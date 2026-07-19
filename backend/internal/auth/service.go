package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"sharedspace/internal/apperror"
	"sharedspace/internal/mailer"
)

const defaultStorageQuota int64 = 5 * 1024 * 1024 * 1024

const (
	emailTokenVerifyEmail   = "verify_email"
	emailTokenResetPassword = "reset_password"

	verifyEmailPath   = "/verify-email/"
	resetPasswordPath = "/reset-password/"
)

var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)

type Service struct {
	beginTx          beginTxFunc
	db               dbTX
	repo             AuthRepository
	jwtSecret        []byte
	accessTTL        time.Duration
	refreshTTL       time.Duration
	storageQuota     int64
	mailer           mailer.Mailer
	appURL           string
	verifyEmailTTL   time.Duration
	resetPasswordTTL time.Duration
}

func NewService(
	pool *pgxpool.Pool,
	repo AuthRepository,
	jwtSecret string,
	accessTTL, refreshTTL time.Duration,
	m mailer.Mailer,
	appURL string,
	verifyEmailTTL, resetPasswordTTL time.Duration,
) *Service {
	if accessTTL <= 0 {
		accessTTL = time.Hour
	}
	if refreshTTL <= 0 {
		refreshTTL = 30 * 24 * time.Hour
	}
	if verifyEmailTTL <= 0 {
		verifyEmailTTL = 24 * time.Hour
	}
	if resetPasswordTTL <= 0 {
		resetPasswordTTL = time.Hour
	}
	if m == nil {
		m = mailer.NewSMTPMailer("", 0, "", "", "", "", false, nil)
	}
	beginTx := func(ctx context.Context, opts pgx.TxOptions) (transaction, error) {
		tx, err := pool.BeginTx(ctx, opts)
		if err != nil {
			return nil, err
		}
		return txWrapper{Tx: tx}, nil
	}
	return &Service{
		beginTx:          beginTx,
		db:               pool,
		repo:             repo,
		jwtSecret:        []byte(jwtSecret),
		accessTTL:        accessTTL,
		refreshTTL:       refreshTTL,
		storageQuota:     defaultStorageQuota,
		mailer:           m,
		appURL:           strings.TrimRight(appURL, "/"),
		verifyEmailTTL:   verifyEmailTTL,
		resetPasswordTTL: resetPasswordTTL,
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

	// Issue the verification token within the same transaction as the user
	// creation. If token persistence fails, the entire registration rolls
	// back — we don't want users in the DB without a pending verification
	// token (they'd be stuck unable to verify, and unable to re-trigger
	// the flow until they call /resend-verification, which requires a
	// login they can't complete because they're not activated).
	rawVerifyToken, err := s.issueEmailToken(ctx, tx, user.ID, emailTokenVerifyEmail, s.verifyEmailTTL)
	if err != nil {
		return RegisterResponse{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return RegisterResponse{}, apperror.WrapInternal("ошибка сохранения регистрации", err)
	}

	// Send verification email. Best-effort: failure here does NOT fail
	// registration. The token is already persisted and the user can
	// request a resend from the in-app modal.
	verifyURL := s.appURL + verifyEmailPath + rawVerifyToken
	if err := s.mailer.SendVerificationEmail(ctx, user.Email, verifyURL); err != nil {
		log.Printf("auth: failed to send verification email to %s: %v", user.Email, err)
	} else {
		log.Printf("auth: verification email sent to %s", user.Email)
	}

	return RegisterResponse{
		User: UserResponse{
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
			Activated:       user.Activated,
			CreatedAt:       user.CreatedAt,
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
			Activated:       user.Activated,
			CreatedAt:       user.CreatedAt,
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

// VerifyEmail confirms a user's email address using a single-use token from
// the verification email. The token is hash-compared against email_tokens.
func (s *Service) VerifyEmail(ctx context.Context, rawToken string) (VerifyEmailResponse, error) {
	rawToken = strings.TrimSpace(rawToken)
	if rawToken == "" {
		return VerifyEmailResponse{}, apperror.Validation("требуется токен подтверждения")
	}

	tokenHash := hashToken(rawToken)

	tx, err := s.beginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return VerifyEmailResponse{}, apperror.WrapInternal("ошибка начала транзакции", err)
	}
	defer tx.Rollback(ctx)

	rec, err := s.repo.FindEmailTokenByHash(ctx, tx, tokenHash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return VerifyEmailResponse{}, apperror.NotFound("ссылка подтверждения недействительна или истекла")
		}
		return VerifyEmailResponse{}, apperror.WrapInternal("ошибка поиска токена подтверждения", err)
	}
	if rec.Type != emailTokenVerifyEmail {
		return VerifyEmailResponse{}, apperror.NotFound("ссылка подтверждения недействительна или истекла")
	}
	if rec.UsedAt != nil {
		return VerifyEmailResponse{}, apperror.Conflict("ссылка уже использована")
	}
	if time.Now().UTC().After(rec.ExpiresAt) {
		return VerifyEmailResponse{}, apperror.NotFound("срок действия ссылки истёк")
	}

	if err := s.repo.SetUserActivated(ctx, tx, rec.UserID, true); err != nil {
		return VerifyEmailResponse{}, apperror.WrapInternal("ошибка активации аккаунта", err)
	}
	if err := s.repo.MarkEmailTokenUsed(ctx, tx, rec.ID); err != nil {
		return VerifyEmailResponse{}, apperror.WrapInternal("ошибка пометки токена использованным", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return VerifyEmailResponse{}, apperror.WrapInternal("ошибка сохранения подтверждения", err)
	}

	return VerifyEmailResponse{Success: true, UserID: rec.UserID}, nil
}

// ResendVerification issues a fresh verify-email token for the calling user
// (authenticated via JWT). Old unused tokens of the same type are invalidated.
// Returns Conflict if the user is already activated.
func (s *Service) ResendVerification(ctx context.Context, userID string) error {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return apperror.Unauthorized("некорректный access токен")
	}

	user, err := s.repo.FindUserByID(ctx, s.db, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperror.NotFound("пользователь не найден")
		}
		return apperror.WrapInternal("ошибка поиска пользователя", err)
	}
	if user.Activated {
		return apperror.Conflict("почта уже подтверждена")
	}

	tx, err := s.beginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return apperror.WrapInternal("ошибка начала транзакции", err)
	}
	defer tx.Rollback(ctx)

	if err := s.repo.InvalidateEmailTokensForUser(ctx, tx, userID, emailTokenVerifyEmail); err != nil {
		return apperror.WrapInternal("ошибка инвалидации старых токенов", err)
	}

	rawToken, err := s.issueEmailToken(ctx, tx, userID, emailTokenVerifyEmail, s.verifyEmailTTL)
	if err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return apperror.WrapInternal("ошибка сохранения токена", err)
	}

	verifyURL := s.appURL + verifyEmailPath + rawToken
	if err := s.mailer.SendVerificationEmail(ctx, user.Email, verifyURL); err != nil {
		log.Printf("auth: failed to resend verification email to %s: %v", user.Email, err)
		return apperror.WrapInternal("не удалось отправить письмо подтверждения", err)
	}
	log.Printf("auth: verification email resent to %s", user.Email)
	return nil
}

// RequestPasswordReset looks up a user by email. If the user exists AND has
// activated their account, a reset-password token is issued and emailed.
// For non-existent or non-activated accounts this is a silent no-op — the
// caller still returns success to avoid leaking which emails are registered.
func (s *Service) RequestPasswordReset(ctx context.Context, email string) error {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" {
		return apperror.Validation("email обязателен")
	}
	if !emailRegex.MatchString(email) {
		return apperror.Validation("некорректный формат email")
	}

	user, err := s.repo.FindUserByEmail(ctx, s.db, email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Intentionally silent: do not leak registered emails.
			return nil
		}
		return apperror.WrapInternal("ошибка поиска пользователя по email", err)
	}
	if !user.Activated {
		// Per the spec, password reset is only available for activated users.
		return nil
	}

	tx, err := s.beginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return apperror.WrapInternal("ошибка начала транзакции", err)
	}
	defer tx.Rollback(ctx)

	if err := s.repo.InvalidateEmailTokensForUser(ctx, tx, user.ID, emailTokenResetPassword); err != nil {
		return apperror.WrapInternal("ошибка инвалидации старых токенов", err)
	}

	rawToken, err := s.issueEmailToken(ctx, tx, user.ID, emailTokenResetPassword, s.resetPasswordTTL)
	if err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return apperror.WrapInternal("ошибка сохранения токена", err)
	}

	resetURL := s.appURL + resetPasswordPath + rawToken
	if err := s.mailer.SendPasswordResetEmail(ctx, user.Email, resetURL); err != nil {
		log.Printf("auth: failed to send password reset email to %s: %v", user.Email, err)
		return apperror.WrapInternal("не удалось отправить письмо для сброса пароля", err)
	}
	log.Printf("auth: password reset email sent to %s", user.Email)
	return nil
}

// ResetPassword completes a password reset: validates the single-use token,
// sets the new password, marks the token used, and revokes ALL refresh tokens
// for the user (forcing re-login on every device).
func (s *Service) ResetPassword(ctx context.Context, rawToken, newPassword string) error {
	rawToken = strings.TrimSpace(rawToken)
	if rawToken == "" {
		return apperror.Validation("требуется токен сброса пароля")
	}
	if err := validatePassword(newPassword); err != nil {
		return err
	}

	tokenHash := hashToken(rawToken)

	tx, err := s.beginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return apperror.WrapInternal("ошибка начала транзакции", err)
	}
	defer tx.Rollback(ctx)

	rec, err := s.repo.FindEmailTokenByHash(ctx, tx, tokenHash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperror.NotFound("ссылка сброса пароля недействительна или истекла")
		}
		return apperror.WrapInternal("ошибка поиска токена сброса", err)
	}
	if rec.Type != emailTokenResetPassword {
		return apperror.NotFound("ссылка сброса пароля недействительна или истекла")
	}
	if rec.UsedAt != nil {
		return apperror.Conflict("ссылка уже использована")
	}
	if time.Now().UTC().After(rec.ExpiresAt) {
		return apperror.NotFound("срок действия ссылки истёк")
	}

	newHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return apperror.WrapInternal("ошибка хеширования пароля", err)
	}

	if err := s.repo.UpdateUserPassword(ctx, tx, rec.UserID, string(newHash)); err != nil {
		return apperror.WrapInternal("ошибка обновления пароля", err)
	}
	if err := s.repo.MarkEmailTokenUsed(ctx, tx, rec.ID); err != nil {
		return apperror.WrapInternal("ошибка пометки токена использованным", err)
	}
	if err := s.repo.RevokeAllRefreshTokensForUser(ctx, tx, rec.UserID); err != nil {
		return apperror.WrapInternal("ошибка отзыва refresh токенов", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return apperror.WrapInternal("ошибка сохранения нового пароля", err)
	}

	return nil
}

// issueEmailToken generates a cryptographically random token, hashes it,
// persists the hash, and returns the raw token to the caller.
func (s *Service) issueEmailToken(ctx context.Context, tx transaction, userID, tokenType string, ttl time.Duration) (string, error) {
	rawToken, err := newEmailToken()
	if err != nil {
		return "", apperror.WrapInternal("ошибка генерации токена", err)
	}
	tokenHash := hashToken(rawToken)
	expiresAt := time.Now().UTC().Add(ttl)
	if err := s.repo.CreateEmailToken(ctx, tx, userID, tokenHash, tokenType, expiresAt); err != nil {
		return "", apperror.WrapInternal("ошибка сохранения токена", err)
	}
	return rawToken, nil
}

// newEmailToken returns 32 random bytes URL-safe base64-encoded.
func newEmailToken() (string, error) {
	var buf [32]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf[:]), nil
}

func normalizeRegisterRequest(req RegisterRequest) (RegisterRequest, error) {
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	req.Username = strings.TrimSpace(req.Username)
	req.FirstName = strings.TrimSpace(req.FirstName)
	req.SecondName = strings.TrimSpace(req.SecondName)
	req.Password = strings.TrimSpace(req.Password)

	if req.FirstName == "" {
		req.FirstName = req.Username
	}

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
