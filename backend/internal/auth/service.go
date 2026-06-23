package auth

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"sharedspace/internal/apperror"
)

const defaultStorageQuota int64 = 5 * 1024 * 1024 * 1024

var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)

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
		return RegisterResponse{}, apperror.WrapInternal("ошибка начала транзакции", err)
	}
	defer tx.Rollback(ctx)

	if exists, err := s.repo.EmailExists(ctx, tx, input.Email); err != nil {
		return RegisterResponse{}, err
	} else if exists {
		return RegisterResponse{}, apperror.Conflict("email уже используется")
	}
	if exists, err := s.repo.UsernameExists(ctx, tx, input.Username); err != nil {
		return RegisterResponse{}, err
	} else if exists {
		return RegisterResponse{}, apperror.Conflict("имя пользователя уже занято")
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return RegisterResponse{}, apperror.WrapInternal("ошибка хеширования пароля", err)
	}

	user, err := s.repo.CreateUser(ctx, tx, input, string(passwordHash), s.storageQuota)
	if err != nil {
		if isUniqueViolation(err) {
			return RegisterResponse{}, apperror.Conflict("пользователь уже существует")
		}
		return RegisterResponse{}, apperror.WrapInternal("ошибка создания пользователя", err)
	}

	rootDirectoryID, err := s.repo.CreateRootDirectory(ctx, tx, user.ID, user.Username)
	if err != nil {
		if isUniqueViolation(err) {
			return RegisterResponse{}, apperror.Conflict("корневая директория уже существует")
		}
		return RegisterResponse{}, apperror.WrapInternal("ошибка создания корневой директории", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return RegisterResponse{}, apperror.WrapInternal("ошибка сохранения регистрации", err)
	}

	return RegisterResponse{
		User: UserResponse{
			ID:           user.ID,
			Email:        user.Email,
			Username:     user.Username,
			FirstName:    user.FirstName,
			SecondName:   user.SecondName,
			StorageQuota: user.StorageQuota,
			StorageUsed:  user.StorageUsed,
			CreatedAt:    user.CreatedAt,
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
			return LoginResponse{}, apperror.Unauthorized("неверный email или пароль")
		}
		return LoginResponse{}, err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return LoginResponse{}, apperror.Unauthorized("неверный email или пароль")
	}

	tokens, err := s.issueTokenPair(user)
	if err != nil {
		return LoginResponse{}, apperror.WrapInternal("ошибка выпуска токенов", err)
	}
	if err := s.repo.StoreRefreshToken(ctx, s.db, user.ID, tokens.RefreshToken, meta.UserAgent, meta.IPAddress, time.Now().UTC().Add(s.refreshTTL)); err != nil {
		return LoginResponse{}, err
	}

	return LoginResponse{
		User: UserResponse{
			ID:           user.ID,
			Email:        user.Email,
			Username:     user.Username,
			FirstName:    user.FirstName,
			SecondName:   user.SecondName,
			StorageQuota: user.StorageQuota,
			StorageUsed:  user.StorageUsed,
			CreatedAt:    user.CreatedAt,
		},
		Tokens: tokens,
	}, nil
}

func (s *Service) Refresh(ctx context.Context, rawRefreshToken string, meta loginMeta) (RefreshResponse, error) {
	if strings.TrimSpace(rawRefreshToken) == "" {
		return RefreshResponse{}, apperror.Validation("требуется refresh токен")
	}

	claims, err := s.parseRefreshToken(rawRefreshToken)
	if err != nil {
		return RefreshResponse{}, apperror.Unauthorized("некорректный refresh токен")
	}

	tx, err := s.beginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return RefreshResponse{}, apperror.WrapInternal("ошибка начала транзакции", err)
	}
	defer tx.Rollback(ctx)

	record, err := s.repo.LoadRefreshToken(ctx, tx, rawRefreshToken)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return RefreshResponse{}, apperror.Unauthorized("некорректный refresh токен")
		}
		return RefreshResponse{}, apperror.WrapInternal("ошибка загрузки refresh токена", err)
	}
	if record.RevokedAt != nil || time.Now().UTC().After(record.ExpiresAt) {
		return RefreshResponse{}, apperror.Unauthorized("срок действия refresh токена истёк")
	}
	if record.UserID != claims.Subject {
		return RefreshResponse{}, apperror.Unauthorized("некорректный refresh токен")
	}

	user, err := s.repo.FindUserByID(ctx, tx, record.UserID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return RefreshResponse{}, apperror.Unauthorized("некорректный refresh токен")
		}
		return RefreshResponse{}, err
	}

	if err := s.repo.RevokeRefreshToken(ctx, tx, rawRefreshToken); err != nil {
		return RefreshResponse{}, apperror.WrapInternal("ошибка отзыва refresh токена", err)
	}

	tokens, err := s.issueTokenPair(user)
	if err != nil {
		return RefreshResponse{}, apperror.WrapInternal("ошибка выпуска токенов", err)
	}
	if err := s.repo.StoreRefreshToken(ctx, tx, user.ID, tokens.RefreshToken, meta.UserAgent, meta.IPAddress, time.Now().UTC().Add(s.refreshTTL)); err != nil {
		return RefreshResponse{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return RefreshResponse{}, apperror.WrapInternal("ошибка сохранения обновления токена", err)
	}

	return RefreshResponse{Tokens: tokens}, nil
}

func (s *Service) UserIDFromAccessToken(_ context.Context, rawAccessToken string) (string, error) {
	rawAccessToken = strings.TrimSpace(rawAccessToken)
	if rawAccessToken == "" {
		return "", apperror.Unauthorized("требуется access токен")
	}

	claims, err := s.parseAccessToken(rawAccessToken)
	if err != nil {
		return "", apperror.Unauthorized("некорректный access токен")
	}
	if strings.TrimSpace(claims.Subject) == "" {
		return "", apperror.Unauthorized("некорректный access токен")
	}

	return claims.Subject, nil
}

func (s *Service) Logout(ctx context.Context, rawRefreshToken string) error {
	if strings.TrimSpace(rawRefreshToken) == "" {
		return apperror.Validation("требуется refresh токен")
	}

	if _, err := s.parseRefreshToken(rawRefreshToken); err != nil {
		return apperror.Unauthorized("некорректный refresh токен")
	}

	if err := s.repo.RevokeRefreshToken(ctx, s.db, rawRefreshToken); err != nil {
		return apperror.WrapInternal("ошибка отзыва refresh токена", err)
	}

	return nil
}

func normalizeRegisterRequest(req RegisterRequest) (RegisterRequest, error) {
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	req.Username = strings.TrimSpace(req.Username)
	req.FirstName = strings.TrimSpace(req.FirstName)
	req.SecondName = strings.TrimSpace(req.SecondName)
	req.Password = strings.TrimSpace(req.Password)

	if req.Email == "" {
		return RegisterRequest{}, apperror.Validation("email обязателен")
	}
	if !emailRegex.MatchString(req.Email) {
		return RegisterRequest{}, apperror.Validation("некорректный формат email")
	}
	if req.Username == "" {
		return RegisterRequest{}, apperror.Validation("имя пользователя обязательно")
	}
	if req.Password == "" {
		return RegisterRequest{}, apperror.Validation("пароль обязателен")
	}
	return req, nil
}

func normalizeLoginIdentifier(req LoginRequest) (string, error) {
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	req.Username = strings.TrimSpace(req.Username)
	req.Identifier = strings.TrimSpace(req.Identifier)
	req.Password = strings.TrimSpace(req.Password)

	if req.Password == "" {
		return "", apperror.Validation("пароль обязателен")
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
	return "", apperror.Validation("email или имя пользователя обязательны")
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
