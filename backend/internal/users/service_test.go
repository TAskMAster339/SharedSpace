package users

import (
	"context"
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
	userByID                 record
	userByIDErr              error
	findUserByEmailInput     string
	findUserByEmailResult    record
	findUserByEmailErr       error
	findUserByUsernameInput  string
	findUserByUsernameResult record
	findUserByUsernameErr    error
	updateProfileUserID      string
	updateProfileInput       UpdateProfileInput
	updatedProfileUser       record
	updateProfileErr         error
	updatePasswordUserID     string
	updatePasswordHash       string
	updatePasswordErr        error
	refreshRecord            refreshTokenRecord
	refreshRecordErr         error
	revokeAllUserID          string
	revokeAllExceptToken     string
	revokeAllErr             error
	searchRequesterID        string
	searchQuery              string
	searchLimit              int
	searchResult             []record
	searchErr                error
	deleteUserAndRelatedErr  error
	deleteUserID             string
	deleteUserCalled         bool
}

func (m *mockRepo) FindUserByID(_ context.Context, _ dbTX, userID string) (record, error) {
	return m.userByID, m.userByIDErr
}

func (m *mockRepo) FindUserByEmail(_ context.Context, _ dbTX, email string) (record, error) {
	m.findUserByEmailInput = email
	return m.findUserByEmailResult, m.findUserByEmailErr
}

func (m *mockRepo) FindUserByUsername(_ context.Context, _ dbTX, username string) (record, error) {
	m.findUserByUsernameInput = username
	return m.findUserByUsernameResult, m.findUserByUsernameErr
}

func (m *mockRepo) UpdateUserProfile(_ context.Context, _ dbTX, userID string, input UpdateProfileInput) (record, error) {
	m.updateProfileUserID = userID
	m.updateProfileInput = input
	return m.updatedProfileUser, m.updateProfileErr
}

func (m *mockRepo) UpdateUserPassword(_ context.Context, _ dbTX, userID, passwordHash string) error {
	m.updatePasswordUserID = userID
	m.updatePasswordHash = passwordHash
	return m.updatePasswordErr
}

func (m *mockRepo) LoadRefreshToken(_ context.Context, _ dbTX, rawToken string) (refreshTokenRecord, error) {
	return m.refreshRecord, m.refreshRecordErr
}

func (m *mockRepo) RevokeAllRefreshTokensExcept(_ context.Context, _ dbTX, userID, exceptRawToken string) error {
	m.revokeAllUserID = userID
	m.revokeAllExceptToken = exceptRawToken
	return m.revokeAllErr
}

func (m *mockRepo) SearchUsers(_ context.Context, _ dbTX, requesterID, query string, limit int) ([]record, error) {
	m.searchRequesterID = requesterID
	m.searchQuery = query
	m.searchLimit = limit
	return m.searchResult, m.searchErr
}

func (m *mockRepo) DeleteUserAndRelatedData(_ context.Context, _ dbTX, userID string) error {
	m.deleteUserID = userID
	m.deleteUserCalled = true
	return m.deleteUserAndRelatedErr
}

func (m *mockRepo) RecalcSharedDirsCount(_ context.Context, _ dbTX, _ string) error {
	return nil
}

func newTestService(repo RepositoryInterface) (*Service, *mockTx) {
	tx := &mockTx{}
	service := &Service{
		beginTx: func(context.Context, pgx.TxOptions) (transaction, error) { return tx, nil },
		db:      tx,
		repo:    repo,
	}
	return service, tx
}

func TestServiceGetMe(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		repo := &mockRepo{
			userByID: record{ID: "user-1", Username: "ivan", Email: "ivan@example.com", FirstName: "Ivan", SharedDirsQuota: 5, CreatedAt: time.Unix(100, 0).UTC()},
		}
		service, _ := newTestService(repo)

		resp, err := service.GetMe(context.Background(), "user-1")
		if err != nil {
			t.Fatalf("GetMe returned error: %v", err)
		}
		if resp.ID != "user-1" || resp.Email != "ivan@example.com" || resp.Username != "ivan" {
			t.Fatalf("unexpected response: %+v", resp)
		}
	})

	t.Run("user not found", func(t *testing.T) {
		repo := &mockRepo{
			userByIDErr: pgx.ErrNoRows,
		}
		service, _ := newTestService(repo)

		_, err := service.GetMe(context.Background(), "nonexistent")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeNotFound {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestServiceUpdateMe(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		repo := &mockRepo{
			findUserByEmailErr:    pgx.ErrNoRows,
			findUserByUsernameErr: pgx.ErrNoRows,
			updatedProfileUser:    record{ID: "user-1", Username: "ivan", Email: "new@example.com", FirstName: "Ivan", SharedDirsQuota: 5, CreatedAt: time.Unix(100, 0).UTC()},
		}
		service, tx := newTestService(repo)

		email := "new@example.com"
		resp, err := service.UpdateMe(context.Background(), "user-1", UpdateProfileRequest{Email: &email})
		if err != nil {
			t.Fatalf("UpdateMe returned error: %v", err)
		}
		if resp.Email != "new@example.com" {
			t.Fatalf("unexpected email: %q", resp.Email)
		}
		if tx.commitCount != 1 {
			t.Fatalf("commit count = %d, want 1", tx.commitCount)
		}
	})

	t.Run("email conflict", func(t *testing.T) {
		repo := &mockRepo{
			findUserByEmailResult: record{ID: "other-user", Username: "other", Email: "taken@example.com"},
		}
		service, _ := newTestService(repo)

		email := "taken@example.com"
		_, err := service.UpdateMe(context.Background(), "user-1", UpdateProfileRequest{Email: &email})
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeConflict {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestServiceChangePasswordRevokesOtherRefreshTokens(t *testing.T) {
	oldHash, err := bcrypt.GenerateFromPassword([]byte("OldPass1!"), bcrypt.DefaultCost)
	if err != nil {
		t.Fatalf("bcrypt old: %v", err)
	}

	repo := &mockRepo{
		userByID:      record{ID: "user-1", PasswordHash: string(oldHash)},
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
		searchResult: []record{
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

func TestServiceSearchUsersShortQuery(t *testing.T) {
	service, _ := newTestService(&mockRepo{})

	_, err := service.SearchUsers(context.Background(), "me-1", "a", 20)
	if err == nil {
		t.Fatal("expected error")
	}
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeValidation {
		t.Fatalf("unexpected error: %v", err)
	}
}
