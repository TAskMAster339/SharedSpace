package auth

import (
	"context"
	"errors"
	"strings"
	"time"
	"unicode"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"sharedspace/internal/apperror"
)

const defaultStorageQuota int64 = 5 * 1024 * 1024 * 1024

const minSearchQueryLength = 2

type Service struct {
	beginTx      beginTxFunc
	db           dbTX
	repo         AuthRepository
	jwtSecret    []byte
	accessTTL    time.Duration
	refreshTTL   time.Duration
	storageQuota int64
}

func NewService(pool *pgxpool.Pool, repo AuthRepository, jwtSecret string, accessTTL, refreshTTL time.Duration) *Service {
	if accessTTL <= 0 {
		accessTTL = time.Hour
	}
	if refreshTTL <= 0 {
		refreshTTL = 30 * 24 * time.Hour
	}
	beginTx := func(ctx context.Context, opts pgx.TxOptions) (transaction, error) {
		tx, err := pool.BeginTx(ctx, opts)
		if err != nil {
			return nil, err
		}
		return txWrapper{Tx: tx}, nil
	}
	return &Service{
		beginTx:      beginTx,
		db:           pool,
		repo:         repo,
		jwtSecret:    []byte(jwtSecret),
		accessTTL:    accessTTL,
		refreshTTL:   refreshTTL,
		storageQuota: defaultStorageQuota,
	}
}

func (s *Service) Register(ctx context.Context, req RegisterRequest) (RegisterResponse, error) {
	input, err := normalizeRegisterRequest(req)
	if err != nil {
		return RegisterResponse{}, err
	}
	if err := validatePassword(input.Password); err != nil {
		return RegisterResponse{}, err
	}

	tx, err := s.beginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return RegisterResponse{}, apperror.WrapInternal("begin transaction", err)
	}
	defer tx.Rollback(ctx)

	if exists, err := s.repo.EmailExists(ctx, tx, input.Email); err != nil {
		return RegisterResponse{}, err
	} else if exists {
		return RegisterResponse{}, apperror.Conflict("email is already in use")
	}
	if exists, err := s.repo.UsernameExists(ctx, tx, input.Username); err != nil {
		return RegisterResponse{}, err
	} else if exists {
		return RegisterResponse{}, apperror.Conflict("username is already in use")
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return RegisterResponse{}, apperror.WrapInternal("hash password", err)
	}

	user, err := s.repo.CreateUser(ctx, tx, input, string(passwordHash), s.storageQuota)
	if err != nil {
		if isUniqueViolation(err) {
			return RegisterResponse{}, apperror.Conflict("user already exists")
		}
		return RegisterResponse{}, apperror.WrapInternal("create user", err)
	}

	rootDirectoryID, err := s.repo.CreateRootDirectory(ctx, tx, user.ID, user.Username)
	if err != nil {
		if isUniqueViolation(err) {
			return RegisterResponse{}, apperror.Conflict("root directory already exists")
		}
		return RegisterResponse{}, apperror.WrapInternal("create root directory", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return RegisterResponse{}, apperror.WrapInternal("commit registration", err)
	}

	return RegisterResponse{
		User: UserResponse{
			ID:         user.ID,
			Email:      user.Email,
			Username:   user.Username,
			FirstName:  user.FirstName,
			SecondName: user.SecondName,
			CreatedAt:  user.CreatedAt,
		},
		RootDirectoryID: rootDirectoryID,
	}, nil
}

func (s *Service) Login(ctx context.Context, req LoginRequest, meta loginMeta) (LoginResponse, error) {
	identifier, err := normalizeLoginIdentifier(req)
	if err != nil {
		return LoginResponse{}, err
	}

	user, err := s.repo.FindUserByIdentifier(ctx, s.db, identifier)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return LoginResponse{}, apperror.Unauthorized("invalid credentials")
		}
		return LoginResponse{}, err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return LoginResponse{}, apperror.Unauthorized("invalid credentials")
	}

	tokens, err := s.issueTokenPair(user)
	if err != nil {
		return LoginResponse{}, apperror.WrapInternal("issue tokens", err)
	}
	if err := s.repo.StoreRefreshToken(ctx, s.db, user.ID, tokens.RefreshToken, meta.UserAgent, meta.IPAddress, time.Now().UTC().Add(s.refreshTTL)); err != nil {
		return LoginResponse{}, err
	}

	return LoginResponse{
		User: UserResponse{
			ID:         user.ID,
			Email:      user.Email,
			Username:   user.Username,
			FirstName:  user.FirstName,
			SecondName: user.SecondName,
			CreatedAt:  user.CreatedAt,
		},
		Tokens: tokens,
	}, nil
}

func (s *Service) Refresh(ctx context.Context, rawRefreshToken string, meta loginMeta) (RefreshResponse, error) {
	if strings.TrimSpace(rawRefreshToken) == "" {
		return RefreshResponse{}, apperror.Validation("refresh token is required")
	}

	claims, err := s.parseRefreshToken(rawRefreshToken)
	if err != nil {
		return RefreshResponse{}, apperror.Unauthorized("invalid refresh token")
	}

	tx, err := s.beginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return RefreshResponse{}, apperror.WrapInternal("begin transaction", err)
	}
	defer tx.Rollback(ctx)

	record, err := s.repo.LoadRefreshToken(ctx, tx, rawRefreshToken)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return RefreshResponse{}, apperror.Unauthorized("invalid refresh token")
		}
		return RefreshResponse{}, apperror.WrapInternal("load refresh token", err)
	}
	if record.RevokedAt != nil || time.Now().UTC().After(record.ExpiresAt) {
		return RefreshResponse{}, apperror.Unauthorized("refresh token expired")
	}
	if record.UserID != claims.Subject {
		return RefreshResponse{}, apperror.Unauthorized("invalid refresh token")
	}

	user, err := s.repo.FindUserByID(ctx, tx, record.UserID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return RefreshResponse{}, apperror.Unauthorized("invalid refresh token")
		}
		return RefreshResponse{}, err
	}

	if err := s.repo.RevokeRefreshToken(ctx, tx, rawRefreshToken); err != nil {
		return RefreshResponse{}, apperror.WrapInternal("revoke refresh token", err)
	}

	tokens, err := s.issueTokenPair(user)
	if err != nil {
		return RefreshResponse{}, apperror.WrapInternal("issue tokens", err)
	}
	if err := s.repo.StoreRefreshToken(ctx, tx, user.ID, tokens.RefreshToken, meta.UserAgent, meta.IPAddress, time.Now().UTC().Add(s.refreshTTL)); err != nil {
		return RefreshResponse{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return RefreshResponse{}, apperror.WrapInternal("commit refresh", err)
	}

	return RefreshResponse{Tokens: tokens}, nil
}

func (s *Service) UserIDFromAccessToken(_ context.Context, rawAccessToken string) (string, error) {
	rawAccessToken = strings.TrimSpace(rawAccessToken)
	if rawAccessToken == "" {
		return "", apperror.Unauthorized("access token is required")
	}

	claims, err := s.parseAccessToken(rawAccessToken)
	if err != nil {
		return "", apperror.Unauthorized("invalid access token")
	}
	if strings.TrimSpace(claims.Subject) == "" {
		return "", apperror.Unauthorized("invalid access token")
	}

	return claims.Subject, nil
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

func toUserResponse(user authUser) UserResponse {
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

func normalizeRegisterRequest(req RegisterRequest) (RegisterRequest, error) {
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	req.Username = strings.TrimSpace(req.Username)
	req.FirstName = strings.TrimSpace(req.FirstName)
	req.SecondName = strings.TrimSpace(req.SecondName)
	req.Password = strings.TrimSpace(req.Password)

	if req.Email == "" {
		return RegisterRequest{}, apperror.Validation("email is required")
	}
	if req.Username == "" {
		return RegisterRequest{}, apperror.Validation("username is required")
	}
	if req.Password == "" {
		return RegisterRequest{}, apperror.Validation("password is required")
	}
	return req, nil
}

func normalizeLoginIdentifier(req LoginRequest) (string, error) {
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	req.Username = strings.TrimSpace(req.Username)
	req.Identifier = strings.TrimSpace(req.Identifier)
	req.Password = strings.TrimSpace(req.Password)

	if req.Password == "" {
		return "", apperror.Validation("password is required")
	}
	if req.Email != "" {
		return req.Email, nil
	}
	if req.Username != "" {
		return req.Username, nil
	}
	if req.Identifier != "" {
		return req.Identifier, nil
	}
	return "", apperror.Validation("email or username is required")
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
