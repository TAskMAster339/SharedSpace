package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/crypto/bcrypt"

	"sharedspace/internal/apperror"
)

type mockRow struct {
	scanFn func(dest ...any) error
}

func (r mockRow) Scan(dest ...any) error {
	if r.scanFn != nil {
		return r.scanFn(dest...)
	}
	return nil
}

type mockTx struct {
	commitCount   int
	rollbackCount int
	queryRowCount int
	queryCount    int
	execCount     int

	queryRowFn func(sql string, args ...any) mockRow
	queryFn    func(sql string, args ...any) (pgx.Rows, error)
	execFn     func(sql string, args ...any) (pgconn.CommandTag, error)
}

func (t *mockTx) QueryRow(_ context.Context, sql string, args ...any) pgx.Row {
	t.queryRowCount++
	if t.queryRowFn != nil {
		return t.queryRowFn(sql, args...)
	}
	return mockRow{}
}

func (t *mockTx) Exec(_ context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	t.execCount++
	if t.execFn != nil {
		return t.execFn(sql, args...)
	}
	return pgconn.CommandTag{}, nil
}

func (t *mockTx) Query(_ context.Context, sql string, args ...any) (pgx.Rows, error) {
	t.queryCount++
	if t.queryFn != nil {
		return t.queryFn(sql, args...)
	}
	return nil, nil
}

func (t *mockTx) Commit(context.Context) error {
	t.commitCount++
	return nil
}

func (t *mockTx) Rollback(context.Context) error {
	t.rollbackCount++
	return nil
}

type mockRepo struct {
	emailExists         bool
	emailErr            error
	usernameExists      bool
	usernameErr         error
	createdUser         authUser
	createUserErr       error
	rootDirectoryID     string
	createRootErr       error
	userByIdentifier    authUser
	userByIdentifierErr error
	userByID            authUser
	userByIDErr         error
	refreshRecord       refreshTokenRecord
	refreshRecordErr    error
	storeRefreshErr     error
	revokeRefreshErr    error

	createUserInput       RegisterRequest
	createUserHash        string
	createUserQuota       int64
	storeRefreshUserID    string
	storedRefreshTokenRaw string
	storeRefreshUserAgent string
	storeRefreshIP        string
	storeRefreshExpiresAt time.Time
	revokeToken           string
	findIdentifier        string
	findUserID            string
	loadToken             string

	findUserByEmailInput    string
	findUserByEmailResult   authUser
	findUserByEmailErr      error
	findUserByUsernameInput string
	findUserByUsernameResult authUser
	findUserByUsernameErr   error
	updateProfileUserID     string
	updateProfileInput      UpdateProfileInput
	updatedProfileUser      authUser
	updateProfileErr        error
	updatePasswordUserID    string
	updatePasswordHash      string
	updatePasswordErr       error
	revokeAllUserID         string
	revokeAllExceptToken    string
	revokeAllErr            error
	searchRequesterID       string
	searchQuery             string
	searchLimit             int
	searchResult            []authUser
	searchErr               error
}

func (m *mockRepo) EmailExists(_ context.Context, _ dbTX, _ string) (bool, error) {
	return m.emailExists, m.emailErr
}

func (m *mockRepo) UsernameExists(_ context.Context, _ dbTX, _ string) (bool, error) {
	return m.usernameExists, m.usernameErr
}

func (m *mockRepo) CreateUser(_ context.Context, _ dbTX, input RegisterRequest, passwordHash string, storageQuota int64) (authUser, error) {
	m.createUserInput = input
	m.createUserHash = passwordHash
	m.createUserQuota = storageQuota
	return m.createdUser, m.createUserErr
}

func (m *mockRepo) CreateRootDirectory(_ context.Context, _ dbTX, _, _ string) (string, error) {
	return m.rootDirectoryID, m.createRootErr
}

func (m *mockRepo) FindUserByIdentifier(_ context.Context, _ dbTX, identifier string) (authUser, error) {
	m.findIdentifier = identifier
	return m.userByIdentifier, m.userByIdentifierErr
}

func (m *mockRepo) FindUserByID(_ context.Context, _ dbTX, userID string) (authUser, error) {
	m.findUserID = userID
	return m.userByID, m.userByIDErr
}

func (m *mockRepo) FindUserByEmail(_ context.Context, _ dbTX, email string) (authUser, error) {
	m.findUserByEmailInput = email
	return m.findUserByEmailResult, m.findUserByEmailErr
}

func (m *mockRepo) FindUserByUsername(_ context.Context, _ dbTX, username string) (authUser, error) {
	m.findUserByUsernameInput = username
	return m.findUserByUsernameResult, m.findUserByUsernameErr
}

func (m *mockRepo) UpdateUserProfile(_ context.Context, _ dbTX, userID string, input UpdateProfileInput) (authUser, error) {
	m.updateProfileUserID = userID
	m.updateProfileInput = input
	return m.updatedProfileUser, m.updateProfileErr
}

func (m *mockRepo) UpdateUserPassword(_ context.Context, _ dbTX, userID, passwordHash string) error {
	m.updatePasswordUserID = userID
	m.updatePasswordHash = passwordHash
	return m.updatePasswordErr
}

func (m *mockRepo) RevokeAllRefreshTokensExcept(_ context.Context, _ dbTX, userID, exceptRawToken string) error {
	m.revokeAllUserID = userID
	m.revokeAllExceptToken = exceptRawToken
	return m.revokeAllErr
}

func (m *mockRepo) SearchUsers(_ context.Context, _ dbTX, requesterID, query string, limit int) ([]authUser, error) {
	m.searchRequesterID = requesterID
	m.searchQuery = query
	m.searchLimit = limit
	return m.searchResult, m.searchErr
}

func (m *mockRepo) StoreRefreshToken(_ context.Context, _ dbTX, userID, rawToken, userAgent, ipAddress string, expiresAt time.Time) error {
	m.storeRefreshUserID = userID
	m.storedRefreshTokenRaw = rawToken
	m.storeRefreshUserAgent = userAgent
	m.storeRefreshIP = ipAddress
	m.storeRefreshExpiresAt = expiresAt
	return m.storeRefreshErr
}

func (m *mockRepo) LoadRefreshToken(_ context.Context, _ dbTX, rawToken string) (refreshTokenRecord, error) {
	m.loadToken = rawToken
	return m.refreshRecord, m.refreshRecordErr
}

func (m *mockRepo) RevokeRefreshToken(_ context.Context, _ dbTX, rawToken string) error {
	m.revokeToken = rawToken
	return m.revokeRefreshErr
}

func newTestService(repo AuthRepository) (*Service, *mockTx) {
	tx := &mockTx{}
	service := &Service{
		beginTx:      func(context.Context, pgx.TxOptions) (transaction, error) { return tx, nil },
		db:           tx,
		repo:         repo,
		jwtSecret:    []byte("secret-key"),
		accessTTL:    time.Hour,
		refreshTTL:   24 * time.Hour,
		storageQuota: defaultStorageQuota,
	}
	return service, tx
}

func TestServiceRegister(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		repo := &mockRepo{
			createdUser:     authUser{ID: "user-1", Username: "ivan", Email: "ivan@example.com", FirstName: "Ivan", SecondName: "Petrov", CreatedAt: time.Unix(100, 0).UTC()},
			rootDirectoryID: "dir-1",
		}
		service, tx := newTestService(repo)

		resp, err := service.Register(context.Background(), RegisterRequest{
			Email:      "ivan@example.com",
			Username:   "ivan",
			FirstName:  "Ivan",
			SecondName: "Petrov",
			Password:   "StrongPass1!",
		})
		if err != nil {
			t.Fatalf("Register returned error: %v", err)
		}
		if resp.RootDirectoryID != "dir-1" {
			t.Fatalf("unexpected root directory id: %q", resp.RootDirectoryID)
		}
		if resp.User.ID != "user-1" || resp.User.Email != "ivan@example.com" || resp.User.Username != "ivan" {
			t.Fatalf("unexpected user response: %+v", resp.User)
		}
		if repo.createUserQuota != defaultStorageQuota {
			t.Fatalf("unexpected quota: got %d want %d", repo.createUserQuota, defaultStorageQuota)
		}
		if tx.commitCount != 1 {
			t.Fatalf("commit count = %d, want 1", tx.commitCount)
		}
	})

	t.Run("email conflict", func(t *testing.T) {
		repo := &mockRepo{emailExists: true}
		service, _ := newTestService(repo)

		_, err := service.Register(context.Background(), RegisterRequest{
			Email:    "ivan@example.com",
			Username: "ivan",
			Password: "StrongPass1!",
		})
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeConflict {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestServiceLogin(t *testing.T) {
	hashed, err := bcrypt.GenerateFromPassword([]byte("StrongPass1!"), bcrypt.DefaultCost)
	if err != nil {
		t.Fatalf("bcrypt: %v", err)
	}

	t.Run("success", func(t *testing.T) {
		repo := &mockRepo{
			userByIdentifier: authUser{ID: "user-1", Username: "ivan", Email: "ivan@example.com", PasswordHash: string(hashed), FirstName: "Ivan", SecondName: "Petrov", CreatedAt: time.Unix(100, 0).UTC()},
		}
		service, _ := newTestService(repo)

		resp, err := service.Login(context.Background(), LoginRequest{Email: "ivan@example.com", Password: "StrongPass1!"}, loginMeta{UserAgent: "PostmanRuntime", IPAddress: "127.0.0.1"})
		if err != nil {
			t.Fatalf("Login returned error: %v", err)
		}
		if resp.Tokens.AccessToken == "" || resp.Tokens.RefreshToken == "" {
			t.Fatalf("expected tokens to be returned: %+v", resp.Tokens)
		}
		if resp.Tokens.TokenType != "Bearer" {
			t.Fatalf("unexpected token type: %q", resp.Tokens.TokenType)
		}
		if repo.storeRefreshUserID != "user-1" || repo.storeRefreshUserAgent != "PostmanRuntime" || repo.storeRefreshIP != "127.0.0.1" {
			t.Fatalf("unexpected refresh token metadata: %+v", repo)
		}
	})

	t.Run("wrong password", func(t *testing.T) {
		repo := &mockRepo{
			userByIdentifier: authUser{ID: "user-1", Username: "ivan", Email: "ivan@example.com", PasswordHash: string(hashed), CreatedAt: time.Unix(100, 0).UTC()},
		}
		service, _ := newTestService(repo)

		_, err := service.Login(context.Background(), LoginRequest{Email: "ivan@example.com", Password: "WrongPass1!"}, loginMeta{})
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeUnauthorized {
			t.Fatalf("unexpected error: %v", err)
		}
		if repo.storedRefreshTokenRaw != "" {
			t.Fatal("refresh token should not be stored on failed login")
		}
	})
}

func TestServiceRefresh(t *testing.T) {
	repo := &mockRepo{
		userByID: authUser{ID: "user-1", Username: "ivan", Email: "ivan@example.com", FirstName: "Ivan", SecondName: "Petrov", CreatedAt: time.Unix(100, 0).UTC()},
	}
	service, _ := newTestService(repo)

	seedTokenPair, err := service.issueTokenPair(authUser{ID: "user-1", Username: "ivan", Email: "ivan@example.com"})
	if err != nil {
		t.Fatalf("issueTokenPair: %v", err)
	}
	repo.refreshRecord = refreshTokenRecord{UserID: "user-1", ExpiresAt: time.Now().UTC().Add(time.Hour)}

	resp, err := service.Refresh(context.Background(), seedTokenPair.RefreshToken, loginMeta{UserAgent: "PostmanRuntime", IPAddress: "127.0.0.1"})
	if err != nil {
		t.Fatalf("Refresh returned error: %v", err)
	}
	if resp.Tokens.AccessToken == "" || resp.Tokens.RefreshToken == "" {
		t.Fatalf("expected new tokens: %+v", resp.Tokens)
	}
	if repo.revokeToken == "" || repo.loadToken == "" || repo.storedRefreshTokenRaw == "" {
		t.Fatalf("expected refresh token lifecycle to be executed: %+v", repo)
	}
}

func TestValidatePassword(t *testing.T) {
	if err := validatePassword("weak"); err == nil {
		t.Fatal("expected weak password to fail")
	}
	if err := validatePassword("StrongPass1!"); err != nil {
		t.Fatalf("expected strong password to pass: %v", err)
	}
}

func TestNormalizeLoginIdentifier(t *testing.T) {
	identifier, err := normalizeLoginIdentifier(LoginRequest{Email: "  Ivan@Example.Com  ", Password: "StrongPass1!"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if identifier != "ivan@example.com" {
		t.Fatalf("unexpected identifier: %q", identifier)
	}
}

func TestRegisterResponseJSONShape(t *testing.T) {
	payload := RegisterResponse{User: UserResponse{ID: "1", Email: "a@b.com"}, RootDirectoryID: "dir-1"}
	encoded, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if !bytes.Contains(encoded, []byte(`"root_directory_id":"dir-1"`)) {
		t.Fatalf("unexpected json: %s", encoded)
	}
}

func TestServiceChangePasswordRevokesOtherRefreshTokens(t *testing.T) {
	oldHash, err := bcrypt.GenerateFromPassword([]byte("OldPass1!"), bcrypt.DefaultCost)
	if err != nil {
		t.Fatalf("bcrypt old: %v", err)
	}

	repo := &mockRepo{
		userByID:      authUser{ID: "user-1", PasswordHash: string(oldHash)},
		refreshRecord: refreshTokenRecord{UserID: "user-1", ExpiresAt: time.Now().UTC().Add(time.Hour)},
	}
	service, tx := newTestService(repo)

	err = service.ChangePassword(context.Background(), "user-1", ChangePasswordRequest{
		OldPassword:         "OldPass1!",
		NewPassword:         "NewPass1!",
		CurrentRefreshToken: "current-token",
	})
	if err != nil {
		t.Fatalf("ChangePassword returned error: %v", err)
	}

	if repo.updatePasswordUserID != "user-1" {
		t.Fatalf("password updated for wrong user: %q", repo.updatePasswordUserID)
	}
	if repo.revokeAllUserID != "user-1" || repo.revokeAllExceptToken != "current-token" {
		t.Fatalf("refresh revoke not called with expected args: user=%q token=%q", repo.revokeAllUserID, repo.revokeAllExceptToken)
	}
	if tx.commitCount != 1 {
		t.Fatalf("commit count = %d, want 1", tx.commitCount)
	}
}

func TestServiceSearchUsersByUsernameAndEmail(t *testing.T) {
	repo := &mockRepo{
		searchResult: []authUser{
			{ID: "u1", Username: "ivanov", Email: "ivanov@example.com", FirstName: "Ivan", CreatedAt: time.Unix(1, 0).UTC()},
			{ID: "u2", Username: "petya", Email: "petya.ivan@example.com", FirstName: "Petr", CreatedAt: time.Unix(2, 0).UTC()},
		},
	}
	service, _ := newTestService(repo)

	resp, err := service.SearchUsers(context.Background(), "me-1", "ivan", 20)
	if err != nil {
		t.Fatalf("SearchUsers returned error: %v", err)
	}

	if repo.searchRequesterID != "me-1" || repo.searchQuery != "ivan" {
		t.Fatalf("unexpected search args: requester=%q query=%q", repo.searchRequesterID, repo.searchQuery)
	}
	if len(resp.Users) != 2 {
		t.Fatalf("unexpected users length: got %d, want 2", len(resp.Users))
	}
	if resp.Users[0].Username != "ivanov" {
		t.Fatalf("expected username match user, got %q", resp.Users[0].Username)
	}
	if resp.Users[1].Email != "petya.ivan@example.com" {
		t.Fatalf("expected email match user, got %q", resp.Users[1].Email)
	}
}
