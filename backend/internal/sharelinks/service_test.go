package sharelinks

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/crypto/bcrypt"

	"sharedspace/internal/access"
	"sharedspace/internal/apperror"
)

type mockRepo struct {
	createFn          func(shareLinkRecord) (shareLinkRecord, error)
	findByIDFn        func(string) (shareLinkRecord, error)
	findByTokenFn     func(string) (shareLinkRecord, error)
	findByFileIDFn    func(string, int) ([]shareLinkRecord, error)
	updateFn          func(string, shareLinkRecord) (shareLinkRecord, error)
	deleteFn          func(string) error
	getFileByIDFn     func(string) (fileRecord, error)
	getUsernameByIDFn func(string) (string, error)
}

func (m *mockRepo) Create(_ context.Context, _ dbTX, link shareLinkRecord) (shareLinkRecord, error) {
	return m.createFn(link)
}
func (m *mockRepo) FindByID(_ context.Context, _ dbTX, id string) (shareLinkRecord, error) {
	return m.findByIDFn(id)
}
func (m *mockRepo) FindByToken(_ context.Context, _ dbTX, token string) (shareLinkRecord, error) {
	return m.findByTokenFn(token)
}
func (m *mockRepo) FindByFileID(_ context.Context, _ dbTX, fileID string, limit int) ([]shareLinkRecord, error) {
	return m.findByFileIDFn(fileID, limit)
}
func (m *mockRepo) Update(_ context.Context, _ dbTX, id string, link shareLinkRecord) (shareLinkRecord, error) {
	return m.updateFn(id, link)
}
func (m *mockRepo) Delete(_ context.Context, _ dbTX, id string) error {
	return m.deleteFn(id)
}
func (m *mockRepo) GetFileByID(_ context.Context, _ dbTX, fileID string) (fileRecord, error) {
	return m.getFileByIDFn(fileID)
}
func (m *mockRepo) GetUsernameByID(_ context.Context, _ dbTX, userID string) (string, error) {
	if m.getUsernameByIDFn != nil {
		return m.getUsernameByIDFn(userID)
	}
	return "testuser", nil
}

type mockStorage struct {
	presignedURL string
}

func (m *mockStorage) PresignedGetURL(_ context.Context, _ string, _ time.Duration) (string, error) {
	return m.presignedURL, nil
}

type mockTx struct{}

func (m *mockTx) QueryRow(_ context.Context, _ string, _ ...any) pgx.Row {
	return mockRow{}
}
func (m *mockTx) Query(_ context.Context, _ string, _ ...any) (pgx.Rows, error) {
	return nil, nil
}
func (m *mockTx) Exec(_ context.Context, _ string, _ ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, nil
}
func (m *mockTx) Commit(_ context.Context) error   { return nil }
func (m *mockTx) Rollback(_ context.Context) error { return nil }

type mockRow struct{}

func (r mockRow) Scan(_ ...any) error { return nil }

type mockAccessChecker struct {
	canFn            func(ctx context.Context, userID, directoryID string, action access.Action) (bool, error)
	getPermissionsFn func(ctx context.Context, userID, directoryID string) (*access.Permissions, error)
}

func (m *mockAccessChecker) Can(ctx context.Context, userID, directoryID string, action access.Action) (bool, error) {
	return m.canFn(ctx, userID, directoryID, action)
}

func (m *mockAccessChecker) GetPermissions(ctx context.Context, userID, directoryID string) (*access.Permissions, error) {
	return m.getPermissionsFn(ctx, userID, directoryID)
}

func newTestService(repo RepositoryInterface) *Service {
	tx := &mockTx{}
	return &Service{
		beginTx: func(_ context.Context, _ pgx.TxOptions) (transaction, error) {
			return tx, nil
		},
		db:      tx,
		repo:    repo,
		storage: &mockStorage{presignedURL: "http://minio/test/obj"},
		accessChecker: &mockAccessChecker{
			canFn: func(_ context.Context, _, _ string, _ access.Action) (bool, error) {
				return true, nil
			},
			getPermissionsFn: func(_ context.Context, _, _ string) (*access.Permissions, error) {
				return &access.Permissions{}, nil
			},
		},
	}
}

func defaultFile() fileRecord {
	return fileRecord{ID: "file-1", DirectoryID: "dir-1", OwnerID: "user-1", ObjectKey: "obj-key-1", Filename: "test.txt", Extension: "txt", MimeType: "text/plain", Size: 100, CreatedAt: time.Unix(100, 0).UTC()}
}

func existingLink() shareLinkRecord {
	return shareLinkRecord{
		ID: "link-1", FileID: "file-1", Token: "tok-1",
		AccessType: "public", CreatedBy: "user-1",
		ExpiresAt: nil, PasswordHash: nil,
		CreatedAt: time.Unix(100, 0).UTC(),
	}
}

// --- Create ---

func TestServiceCreate_Success(t *testing.T) {
	svc := newTestService(&mockRepo{
		getFileByIDFn: func(_ string) (fileRecord, error) { return defaultFile(), nil },
		createFn: func(link shareLinkRecord) (shareLinkRecord, error) {
			link.ID = "link-1"
			link.CreatedAt = time.Unix(100, 0).UTC()
			return link, nil
		},
	})

	resp, err := svc.Create(context.Background(), "user-1", "file-1", CreateShareLinkRequest{
		AccessType: "public",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.AccessType != "public" {
		t.Fatalf("expected public, got %s", resp.AccessType)
	}
	if resp.Token == "" {
		t.Fatal("expected non-empty token")
	}
}

func TestServiceCreate_InvalidAccessType(t *testing.T) {
	svc := newTestService(&mockRepo{
		getFileByIDFn: func(_ string) (fileRecord, error) { return defaultFile(), nil },
	})

	_, err := svc.Create(context.Background(), "user-1", "file-1", CreateShareLinkRequest{
		AccessType: "invalid",
	})
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeValidation {
		t.Fatalf("expected validation, got %v", err)
	}
}

func TestServiceCreate_FileNotFound(t *testing.T) {
	svc := newTestService(&mockRepo{
		getFileByIDFn: func(_ string) (fileRecord, error) { return fileRecord{}, pgx.ErrNoRows },
	})

	_, err := svc.Create(context.Background(), "user-1", "file-1", CreateShareLinkRequest{
		AccessType: "public",
	})
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeNotFound {
		t.Fatalf("expected not_found, got %v", err)
	}
}

func TestServiceCreate_AccessDenied(t *testing.T) {
	svc := newTestService(&mockRepo{
		getFileByIDFn: func(_ string) (fileRecord, error) { return defaultFile(), nil },
	})
	svc.accessChecker = &mockAccessChecker{canFn: func(_ context.Context, _, _ string, _ access.Action) (bool, error) {
		return false, nil
	}}

	_, err := svc.Create(context.Background(), "user-1", "file-1", CreateShareLinkRequest{
		AccessType: "public",
	})
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeForbidden {
		t.Fatalf("expected forbidden, got %v", err)
	}
}

func TestServiceCreate_WithPassword(t *testing.T) {
	svc := newTestService(&mockRepo{
		getFileByIDFn: func(_ string) (fileRecord, error) { return defaultFile(), nil },
		createFn: func(link shareLinkRecord) (shareLinkRecord, error) {
			if link.PasswordHash == nil || *link.PasswordHash == "" {
				t.Fatal("expected password hash to be set")
			}
			link.ID = "link-1"
			link.CreatedAt = time.Unix(100, 0).UTC()
			return link, nil
		},
	})

	resp, err := svc.Create(context.Background(), "user-1", "file-1", CreateShareLinkRequest{
		AccessType: "public",
		Password:   "secret123",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !resp.HasPassword {
		t.Fatal("expected has_password=true")
	}
}

// --- ListByFile ---

func TestServiceListByFile_Success(t *testing.T) {
	svc := newTestService(&mockRepo{
		getFileByIDFn: func(_ string) (fileRecord, error) { return defaultFile(), nil },
		findByFileIDFn: func(_ string, limit int) ([]shareLinkRecord, error) {
			if limit != 0 {
				t.Fatalf("expected limit=0, got %d", limit)
			}
			return []shareLinkRecord{existingLink()}, nil
		},
	})

	links, err := svc.ListByFile(context.Background(), "user-1", "file-1", 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(links) != 1 {
		t.Fatalf("expected 1 link, got %d", len(links))
	}
}

func TestServiceListByFile_WithLimit(t *testing.T) {
	svc := newTestService(&mockRepo{
		getFileByIDFn: func(_ string) (fileRecord, error) { return defaultFile(), nil },
		findByFileIDFn: func(_ string, limit int) ([]shareLinkRecord, error) {
			if limit != 5 {
				t.Fatalf("expected limit=5, got %d", limit)
			}
			return []shareLinkRecord{existingLink()}, nil
		},
	})

	links, err := svc.ListByFile(context.Background(), "user-1", "file-1", 5)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(links) != 1 {
		t.Fatalf("expected 1 link, got %d", len(links))
	}
}

func TestServiceListByFile_FileNotFound(t *testing.T) {
	svc := newTestService(&mockRepo{
		getFileByIDFn: func(_ string) (fileRecord, error) { return fileRecord{}, pgx.ErrNoRows },
	})

	_, err := svc.ListByFile(context.Background(), "user-1", "file-1", 0)
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeNotFound {
		t.Fatalf("expected not_found, got %v", err)
	}
}

func TestServiceListByFile_AccessDenied(t *testing.T) {
	svc := newTestService(&mockRepo{
		getFileByIDFn: func(_ string) (fileRecord, error) { return defaultFile(), nil },
	})
	svc.accessChecker = &mockAccessChecker{canFn: func(_ context.Context, _, _ string, _ access.Action) (bool, error) {
		return false, nil
	}}

	_, err := svc.ListByFile(context.Background(), "user-1", "file-1", 0)
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeForbidden {
		t.Fatalf("expected forbidden, got %v", err)
	}
}

// --- Update ---

func TestServiceUpdate_Success(t *testing.T) {
	svc := newTestService(&mockRepo{
		getFileByIDFn: func(_ string) (fileRecord, error) { return defaultFile(), nil },
		findByIDFn: func(_ string) (shareLinkRecord, error) {
			return existingLink(), nil
		},
		updateFn: func(_ string, link shareLinkRecord) (shareLinkRecord, error) {
			if link.AccessType != "authenticated" {
				t.Fatalf("expected authenticated, got %s", link.AccessType)
			}
			link.ID = "link-1"
			link.CreatedAt = time.Unix(100, 0).UTC()
			return link, nil
		},
	})

	expiresAt := time.Now().Add(24 * time.Hour).Format(time.RFC3339)
	resp, err := svc.Update(context.Background(), "user-1", "link-1", UpdateShareLinkRequest{
		AccessType: strPtr("authenticated"),
		ExpiresAt:  &expiresAt,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.AccessType != "authenticated" {
		t.Fatalf("expected authenticated, got %s", resp.AccessType)
	}
	if resp.ExpiresAt == nil {
		t.Fatal("expected expires_at to be set")
	}
}

func TestServiceUpdate_LinkNotFound(t *testing.T) {
	svc := newTestService(&mockRepo{
		findByIDFn: func(_ string) (shareLinkRecord, error) { return shareLinkRecord{}, pgx.ErrNoRows },
	})

	_, err := svc.Update(context.Background(), "user-1", "link-1", UpdateShareLinkRequest{})
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeNotFound {
		t.Fatalf("expected not_found, got %v", err)
	}
}

func TestServiceUpdate_Forbidden(t *testing.T) {
	svc := newTestService(&mockRepo{
		getFileByIDFn: func(_ string) (fileRecord, error) { return defaultFile(), nil },
		findByIDFn: func(_ string) (shareLinkRecord, error) {
			l := existingLink()
			l.CreatedBy = "other-user"
			return l, nil
		},
	})
	svc.accessChecker = &mockAccessChecker{canFn: func(_ context.Context, _, _ string, _ access.Action) (bool, error) {
		return false, nil
	}}

	_, err := svc.Update(context.Background(), "user-1", "link-1", UpdateShareLinkRequest{})
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeForbidden {
		t.Fatalf("expected forbidden, got %v", err)
	}
}

func TestServiceUpdate_ClearPassword(t *testing.T) {
	hash := "$2a$10$dummyhash"
	svc := newTestService(&mockRepo{
		getFileByIDFn: func(_ string) (fileRecord, error) { return defaultFile(), nil },
		findByIDFn: func(_ string) (shareLinkRecord, error) {
			l := existingLink()
			l.PasswordHash = &hash
			l.CreatedBy = "user-1"
			return l, nil
		},
		updateFn: func(_ string, link shareLinkRecord) (shareLinkRecord, error) {
			if link.PasswordHash != nil {
				t.Fatal("expected password_hash to be cleared")
			}
			link.ID = "link-1"
			link.CreatedAt = time.Unix(100, 0).UTC()
			return link, nil
		},
	})

	resp, err := svc.Update(context.Background(), "user-1", "link-1", UpdateShareLinkRequest{
		Password: strPtr(""),
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.HasPassword {
		t.Fatal("expected has_password=false")
	}
}

// --- Delete ---

func TestServiceDelete_Success(t *testing.T) {
	deleted := false
	svc := newTestService(&mockRepo{
		getFileByIDFn: func(_ string) (fileRecord, error) { return defaultFile(), nil },
		findByIDFn: func(_ string) (shareLinkRecord, error) {
			return existingLink(), nil
		},
		deleteFn: func(_ string) error {
			deleted = true
			return nil
		},
	})

	if err := svc.Delete(context.Background(), "user-1", "link-1"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !deleted {
		t.Fatal("expected Delete to be called")
	}
}

func TestServiceDelete_LinkNotFound(t *testing.T) {
	svc := newTestService(&mockRepo{
		findByIDFn: func(_ string) (shareLinkRecord, error) { return shareLinkRecord{}, pgx.ErrNoRows },
	})

	err := svc.Delete(context.Background(), "user-1", "link-1")
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeNotFound {
		t.Fatalf("expected not_found, got %v", err)
	}
}

func TestServiceDelete_Forbidden(t *testing.T) {
	svc := newTestService(&mockRepo{
		getFileByIDFn: func(_ string) (fileRecord, error) { return defaultFile(), nil },
		findByIDFn: func(_ string) (shareLinkRecord, error) {
			l := existingLink()
			l.CreatedBy = "other-user"
			return l, nil
		},
	})
	svc.accessChecker = &mockAccessChecker{canFn: func(_ context.Context, _, _ string, _ access.Action) (bool, error) {
		return false, nil
	}}

	err := svc.Delete(context.Background(), "user-1", "link-1")
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeForbidden {
		t.Fatalf("expected forbidden, got %v", err)
	}
}

// --- Resolve ---

func TestServiceResolve_Public(t *testing.T) {
	svc := newTestService(&mockRepo{
		findByTokenFn: func(_ string) (shareLinkRecord, error) { return existingLink(), nil },
		getFileByIDFn: func(_ string) (fileRecord, error) { return defaultFile(), nil },
	})

	resp, err := svc.Resolve(context.Background(), "tok-1", "", false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.URL != "http://minio/test/obj" {
		t.Fatalf("unexpected URL: %s", resp.URL)
	}
}

func TestServiceResolve_AuthenticatedWithJWT(t *testing.T) {
	svc := newTestService(&mockRepo{
		findByTokenFn: func(_ string) (shareLinkRecord, error) {
			l := existingLink()
			l.AccessType = "authenticated"
			return l, nil
		},
		getFileByIDFn: func(_ string) (fileRecord, error) { return defaultFile(), nil },
	})

	_, err := svc.Resolve(context.Background(), "tok-1", "", true)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestServiceResolve_AuthenticatedWithoutJWT(t *testing.T) {
	svc := newTestService(&mockRepo{
		findByTokenFn: func(_ string) (shareLinkRecord, error) {
			l := existingLink()
			l.AccessType = "authenticated"
			return l, nil
		},
	})

	_, err := svc.Resolve(context.Background(), "tok-1", "", false)
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeUnauthorized {
		t.Fatalf("expected unauthorized, got %v", err)
	}
}

func TestServiceResolve_TokenNotFound(t *testing.T) {
	svc := newTestService(&mockRepo{
		findByTokenFn: func(_ string) (shareLinkRecord, error) {
			return shareLinkRecord{}, pgx.ErrNoRows
		},
	})

	_, err := svc.Resolve(context.Background(), "invalid-token", "", false)
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeNotFound {
		t.Fatalf("expected not_found, got %v", err)
	}
}

func TestServiceResolve_Expired(t *testing.T) {
	past := time.Now().Add(-1 * time.Hour)
	svc := newTestService(&mockRepo{
		findByTokenFn: func(_ string) (shareLinkRecord, error) {
			l := existingLink()
			l.ExpiresAt = &past
			return l, nil
		},
	})

	_, err := svc.Resolve(context.Background(), "tok-1", "", false)
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeNotFound {
		t.Fatalf("expected not_found, got %v", err)
	}
}

func TestServiceResolve_WrongPassword(t *testing.T) {
	hashBytes, _ := bcrypt.GenerateFromPassword([]byte("correct-password"), bcrypt.DefaultCost)
	hash := string(hashBytes)
	svc := newTestService(&mockRepo{
		findByTokenFn: func(_ string) (shareLinkRecord, error) {
			l := existingLink()
			l.PasswordHash = &hash
			return l, nil
		},
	})

	_, err := svc.Resolve(context.Background(), "tok-1", "wrong-password", false)
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeForbidden {
		t.Fatalf("expected forbidden, got %v", err)
	}
}

func TestServiceResolve_CorrectPassword(t *testing.T) {
	hashBytes, _ := bcrypt.GenerateFromPassword([]byte("correct-password"), bcrypt.DefaultCost)
	hash := string(hashBytes)
	svc := newTestService(&mockRepo{
		findByTokenFn: func(_ string) (shareLinkRecord, error) {
			l := existingLink()
			l.PasswordHash = &hash
			return l, nil
		},
		getFileByIDFn: func(_ string) (fileRecord, error) { return defaultFile(), nil },
	})

	_, err := svc.Resolve(context.Background(), "tok-1", "correct-password", false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func strPtr(s string) *string { return &s }
