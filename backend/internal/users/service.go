package users

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"sharedspace/internal/apperror"
)

const minSearchQueryLength = 2

var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)

type Service struct {
	beginTx beginTxFunc
	db      dbTX
	repo    RepositoryInterface
}

func NewService(pool *pgxpool.Pool, repo RepositoryInterface) *Service {
	beginTx := func(ctx context.Context, opts pgx.TxOptions) (transaction, error) {
		tx, err := pool.BeginTx(ctx, opts)
		if err != nil {
			return nil, err
		}
		return txWrapper{Tx: tx}, nil
	}

	return &Service{
		beginTx: beginTx,
		db:      pool,
		repo:    repo,
	}
}

func (s *Service) GetMe(ctx context.Context, userID string) (UserResponse, error) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return UserResponse{}, apperror.Unauthorized("некорректный access токен")
	}

	if err := s.repo.RecalcSharedDirsCount(ctx, s.db, userID); err != nil {
		return UserResponse{}, apperror.WrapInternal("ошибка обновления счётчика", err)
	}

	user, err := s.repo.FindUserByID(ctx, s.db, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return UserResponse{}, apperror.NotFound("пользователь не найден")
		}
		return UserResponse{}, apperror.WrapInternal("ошибка поиска пользователя", err)
	}

	return toUserResponse(user), nil
}

func (s *Service) UpdateMe(ctx context.Context, userID string, req UpdateProfileRequest) (UserResponse, error) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return UserResponse{}, apperror.Unauthorized("некорректный access токен")
	}

	input, err := normalizeUpdateProfileRequest(req)
	if err != nil {
		return UserResponse{}, err
	}

	tx, err := s.beginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return UserResponse{}, apperror.WrapInternal("ошибка начала транзакции", err)
	}
	defer tx.Rollback(ctx)

	if input.Email != nil {
		existing, findErr := s.repo.FindUserByEmail(ctx, tx, *input.Email)
		switch {
		case findErr == nil && existing.ID != userID:
			return UserResponse{}, apperror.Conflict("email уже используется")
		case findErr != nil && !errors.Is(findErr, pgx.ErrNoRows):
			return UserResponse{}, apperror.WrapInternal("ошибка поиска пользователя по email", findErr)
		}
	}

	if input.Username != nil {
		existing, findErr := s.repo.FindUserByUsername(ctx, tx, *input.Username)
		switch {
		case findErr == nil && existing.ID != userID:
			return UserResponse{}, apperror.Conflict("имя пользователя уже занято")
		case findErr != nil && !errors.Is(findErr, pgx.ErrNoRows):
			return UserResponse{}, apperror.WrapInternal("ошибка поиска пользователя по имени", findErr)
		}
	}

	user, err := s.repo.UpdateUserProfile(ctx, tx, userID, input)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return UserResponse{}, apperror.NotFound("пользователь не найден")
		}
		if isUniqueViolation(err) {
			return UserResponse{}, apperror.Conflict("профиль пользователя уже существует")
		}
		return UserResponse{}, apperror.WrapInternal("ошибка обновления профиля", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return UserResponse{}, apperror.WrapInternal("ошибка сохранения профиля", err)
	}

	return toUserResponse(user), nil
}

func (s *Service) ChangePassword(ctx context.Context, userID string, req ChangePasswordRequest) error {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return apperror.Unauthorized("некорректный access токен")
	}

	req.OldPassword = strings.TrimSpace(req.OldPassword)
	req.NewPassword = strings.TrimSpace(req.NewPassword)
	req.CurrentRefreshToken = strings.TrimSpace(req.CurrentRefreshToken)

	if req.OldPassword == "" {
		return apperror.Validation("требуется старый пароль")
	}
	if req.NewPassword == "" {
		return apperror.Validation("требуется новый пароль")
	}
	if req.CurrentRefreshToken == "" {
		return apperror.Validation("требуется текущий refresh токен")
	}
	if err := validatePassword(req.NewPassword); err != nil {
		return err
	}

	tx, err := s.beginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return apperror.WrapInternal("ошибка начала транзакции", err)
	}
	defer tx.Rollback(ctx)

	user, err := s.repo.FindUserByID(ctx, tx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperror.NotFound("пользователь не найден")
		}
		return apperror.WrapInternal("ошибка поиска пользователя", err)
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.OldPassword)); err != nil {
		return apperror.Forbidden("неверный старый пароль")
	}

	record, err := s.repo.LoadRefreshToken(ctx, tx, req.CurrentRefreshToken)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperror.Unauthorized("некорректный refresh токен")
		}
		return apperror.WrapInternal("ошибка загрузки refresh токена", err)
	}
	if record.UserID != userID || record.RevokedAt != nil || time.Now().UTC().After(record.ExpiresAt) {
		return apperror.Unauthorized("некорректный refresh токен")
	}

	newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return apperror.WrapInternal("ошибка хеширования пароля", err)
	}

	if err := s.repo.UpdateUserPassword(ctx, tx, userID, string(newHash)); err != nil {
		return apperror.WrapInternal("ошибка обновления пароля", err)
	}

	if err := s.repo.RevokeAllRefreshTokensExcept(ctx, tx, userID, req.CurrentRefreshToken); err != nil {
		return apperror.WrapInternal("ошибка отзыва refresh токенов", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return apperror.WrapInternal("ошибка сохранения пароля", err)
	}

	return nil
}

func (s *Service) SearchUsers(ctx context.Context, userID, query string, limit int) (SearchUsersResponse, error) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return SearchUsersResponse{}, apperror.Unauthorized("некорректный access токен")
	}

	query = strings.TrimSpace(query)
	if len(query) < minSearchQueryLength {
		return SearchUsersResponse{}, apperror.Validation("запрос должен содержать минимум 2 символа")
	}

	if limit <= 0 {
		limit = 20
	}
	if limit > 50 {
		limit = 50
	}

	users, err := s.repo.SearchUsers(ctx, s.db, userID, query, limit)
	if err != nil {
		return SearchUsersResponse{}, apperror.WrapInternal("ошибка поиска пользователей", err)
	}

	result := make([]UserResponse, 0, len(users))
	for _, u := range users {
		r := toUserResponse(u)
		r.StorageQuota = 0
		r.StorageUsed = 0
		result = append(result, r)
	}

	return SearchUsersResponse{Users: result}, nil
}

func toUserResponse(user record) UserResponse {
	return UserResponse{
		ID:              user.ID,
		Email:           user.Email,
		Username:        user.Username,
		FirstName:       user.FirstName,
		SecondName:      user.SecondName,
		StorageQuota:    user.StorageQuota,
		StorageUsed:     user.StorageUsed,
		SharedDirsCount: user.SharedDirsCount,
		SharedDirsQuota: user.SharedDirsQuota,
		ShareLinksCount: user.ShareLinksCount,
		ShareLinksQuota: user.ShareLinksQuota,
		CreatedAt:       user.CreatedAt,
	}
}

func normalizeUpdateProfileRequest(req UpdateProfileRequest) (UpdateProfileInput, error) {
	input := UpdateProfileInput{
		Email:      normalizeOptionalEmail(req.Email),
		Username:   normalizeOptionalText(req.Username),
		FirstName:  normalizeOptionalText(req.FirstName),
		SecondName: normalizeOptionalText(req.SecondName),
	}

	if input.Email == nil && input.Username == nil && input.FirstName == nil && input.SecondName == nil {
		return UpdateProfileInput{}, apperror.Validation("требуется хотя бы одно поле профиля")
	}

	if input.Email != nil && *input.Email == "" {
		return UpdateProfileInput{}, apperror.Validation("email не может быть пустым")
	}
	if err := validateOptionalEmail(input.Email); err != nil {
		return UpdateProfileInput{}, err
	}
	if input.Username != nil && *input.Username == "" {
		return UpdateProfileInput{}, apperror.Validation("имя пользователя не может быть пустым")
	}

	return input, nil
}

func normalizeOptionalText(v *string) *string {
	if v == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*v)
	return &trimmed
}

func normalizeOptionalEmail(v *string) *string {
	if v == nil {
		return nil
	}
	normalized := strings.ToLower(strings.TrimSpace(*v))
	return &normalized
}

func validateOptionalEmail(v *string) error {
	if v == nil || *v == "" {
		return nil
	}
	if !emailRegex.MatchString(*v) {
		return apperror.Validation("некорректный формат email")
	}
	return nil
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

func validatePassword(password string) error {
	if len(password) < 8 {
		return apperror.Validation("пароль должен быть не короче 8 символов")
	}
	if len(password) > 72 {
		return apperror.Validation("пароль должен быть не длиннее 72 байт")
	}

	var hasUpper, hasLower, hasSpecial bool
	for _, r := range password {
		switch {
		case unicode.IsUpper(r):
			hasUpper = true
		case unicode.IsLower(r):
			hasLower = true
		case unicode.IsPunct(r) || unicode.IsSymbol(r):
			hasSpecial = true
		}
	}

	if !hasUpper || !hasLower || !hasSpecial {
		return apperror.Validation("пароль должен содержать заглавные, строчные буквы и спецсимволы")
	}
	return nil
}

func (s *Service) DeleteAccount(ctx context.Context, userID string, req DeleteAccountRequest) error {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return apperror.Unauthorized("некорректный access токен")
	}

	req.CurrentRefreshToken = strings.TrimSpace(req.CurrentRefreshToken)
	if req.CurrentRefreshToken == "" {
		return apperror.Validation("требуется текущий refresh токен")
	}

	tx, err := s.beginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return apperror.WrapInternal("ошибка начала транзакции", err)
	}
	defer tx.Rollback(ctx)

	_, err = s.repo.FindUserByID(ctx, tx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperror.NotFound("пользователь не найден")
		}
		return apperror.WrapInternal("ошибка поиска пользователя", err)
	}

	record, err := s.repo.LoadRefreshToken(ctx, tx, req.CurrentRefreshToken)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperror.Unauthorized("некорректный refresh токен")
		}
		return apperror.WrapInternal("ошибка загрузки refresh токена", err)
	}
	if record.UserID != userID || record.RevokedAt != nil || time.Now().UTC().After(record.ExpiresAt) {
		return apperror.Unauthorized("некорректный refresh токен")
	}

	if err := s.repo.DeleteUserAndRelatedData(ctx, tx, userID); err != nil {
		return apperror.WrapInternal("ошибка удаления аккаунта", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return apperror.WrapInternal("ошибка сохранения удаления аккаунта", err)
	}

	return nil
}

func (s *Service) GetUserByID(ctx context.Context, requesterID, targetID string) (UserResponse, error) {
	if requesterID == "" || targetID == "" {
		return UserResponse{}, apperror.Validation("id пользователя обязателен")
	}

	user, err := s.repo.FindUserByID(ctx, s.db, targetID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return UserResponse{}, apperror.NotFound("пользователь не найден")
		}
		return UserResponse{}, apperror.WrapInternal("ошибка поиска пользователя", err)
	}

	return toUserResponse(user), nil
}
