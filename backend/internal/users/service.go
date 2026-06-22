package users

import (
	"context"
	"errors"
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
		return UserResponse{}, apperror.Unauthorized("invalid access token")
	}

	user, err := s.repo.FindUserByID(ctx, s.db, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return UserResponse{}, apperror.NotFound("user not found")
		}
		return UserResponse{}, apperror.WrapInternal("find user", err)
	}

	return toUserResponse(user), nil
}

func (s *Service) UpdateMe(ctx context.Context, userID string, req UpdateProfileRequest) (UserResponse, error) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return UserResponse{}, apperror.Unauthorized("invalid access token")
	}

	input, err := normalizeUpdateProfileRequest(req)
	if err != nil {
		return UserResponse{}, err
	}

	tx, err := s.beginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return UserResponse{}, apperror.WrapInternal("begin transaction", err)
	}
	defer tx.Rollback(ctx)

	if input.Email != nil {
		existing, findErr := s.repo.FindUserByEmail(ctx, tx, *input.Email)
		switch {
		case findErr == nil && existing.ID != userID:
			return UserResponse{}, apperror.Conflict("email is already in use")
		case findErr != nil && !errors.Is(findErr, pgx.ErrNoRows):
			return UserResponse{}, apperror.WrapInternal("find user by email", findErr)
		}
	}

	if input.Username != nil {
		existing, findErr := s.repo.FindUserByUsername(ctx, tx, *input.Username)
		switch {
		case findErr == nil && existing.ID != userID:
			return UserResponse{}, apperror.Conflict("username is already in use")
		case findErr != nil && !errors.Is(findErr, pgx.ErrNoRows):
			return UserResponse{}, apperror.WrapInternal("find user by username", findErr)
		}
	}

	user, err := s.repo.UpdateUserProfile(ctx, tx, userID, input)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return UserResponse{}, apperror.NotFound("user not found")
		}
		if isUniqueViolation(err) {
			return UserResponse{}, apperror.Conflict("user profile already exists")
		}
		return UserResponse{}, apperror.WrapInternal("update user profile", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return UserResponse{}, apperror.WrapInternal("commit profile update", err)
	}

	return toUserResponse(user), nil
}

func (s *Service) ChangePassword(ctx context.Context, userID string, req ChangePasswordRequest) error {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return apperror.Unauthorized("invalid access token")
	}

	req.OldPassword = strings.TrimSpace(req.OldPassword)
	req.NewPassword = strings.TrimSpace(req.NewPassword)
	req.CurrentRefreshToken = strings.TrimSpace(req.CurrentRefreshToken)

	if req.OldPassword == "" {
		return apperror.Validation("old password is required")
	}
	if req.NewPassword == "" {
		return apperror.Validation("new password is required")
	}
	if req.CurrentRefreshToken == "" {
		return apperror.Validation("current refresh token is required")
	}
	if err := validatePassword(req.NewPassword); err != nil {
		return err
	}

	tx, err := s.beginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return apperror.WrapInternal("begin transaction", err)
	}
	defer tx.Rollback(ctx)

	user, err := s.repo.FindUserByID(ctx, tx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperror.NotFound("user not found")
		}
		return apperror.WrapInternal("find user", err)
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.OldPassword)); err != nil {
		return apperror.Forbidden("old password is invalid")
	}

	record, err := s.repo.LoadRefreshToken(ctx, tx, req.CurrentRefreshToken)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperror.Unauthorized("invalid refresh token")
		}
		return apperror.WrapInternal("load refresh token", err)
	}
	if record.UserID != userID || record.RevokedAt != nil || time.Now().UTC().After(record.ExpiresAt) {
		return apperror.Unauthorized("invalid refresh token")
	}

	newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return apperror.WrapInternal("hash password", err)
	}

	if err := s.repo.UpdateUserPassword(ctx, tx, userID, string(newHash)); err != nil {
		return apperror.WrapInternal("update user password", err)
	}

	if err := s.repo.RevokeAllRefreshTokensExcept(ctx, tx, userID, req.CurrentRefreshToken); err != nil {
		return apperror.WrapInternal("revoke refresh tokens", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return apperror.WrapInternal("commit password change", err)
	}

	return nil
}

func (s *Service) SearchUsers(ctx context.Context, userID, query string, limit int) (SearchUsersResponse, error) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return SearchUsersResponse{}, apperror.Unauthorized("invalid access token")
	}

	query = strings.TrimSpace(query)
	if len(query) < minSearchQueryLength {
		return SearchUsersResponse{}, apperror.Validation("query must be at least 2 characters")
	}

	if limit <= 0 {
		limit = 20
	}
	if limit > 50 {
		limit = 50
	}

	users, err := s.repo.SearchUsers(ctx, s.db, userID, query, limit)
	if err != nil {
		return SearchUsersResponse{}, apperror.WrapInternal("search users", err)
	}

	result := make([]UserResponse, 0, len(users))
	for _, u := range users {
		result = append(result, toUserResponse(u))
	}

	return SearchUsersResponse{Users: result}, nil
}

func toUserResponse(user record) UserResponse {
	return UserResponse{
		ID:         user.ID,
		Email:      user.Email,
		Username:   user.Username,
		FirstName:  user.FirstName,
		SecondName: user.SecondName,
		CreatedAt:  user.CreatedAt,
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
		return UpdateProfileInput{}, apperror.Validation("at least one profile field is required")
	}

	if input.Email != nil && *input.Email == "" {
		return UpdateProfileInput{}, apperror.Validation("email cannot be empty")
	}
	if input.Username != nil && *input.Username == "" {
		return UpdateProfileInput{}, apperror.Validation("username cannot be empty")
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

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

func validatePassword(password string) error {
	if len(password) < 8 {
		return apperror.Validation("password must be at least 8 characters long")
	}
	if len(password) > 72 {
		return apperror.Validation("password must be no longer than 72 bytes")
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
		return apperror.Validation("password must contain uppercase, lowercase and special characters")
	}
	return nil
}
