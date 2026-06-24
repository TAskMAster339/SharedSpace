package files

import (
	"bytes"
	"context"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"sharedspace/internal/access"
	"sharedspace/internal/apperror"
)

type mockRepo struct {
	dir           directoryRecord
	dirErr        error
	saveErr       error
	storageUsed   int64
	storageQuota  int64
	getStorageErr error
	addUsedErr    error
	addedDelta    int64
}

func (m *mockRepo) FindDirectoryByID(_ context.Context, _ dbTX, _ string) (directoryRecord, error) {
	return m.dir, m.dirErr
}

func (m *mockRepo) FindByID(_ context.Context, _ dbTX, _ string) (fileRecord, error) {
	return fileRecord{}, nil
}

func (m *mockRepo) Save(_ context.Context, _ dbTX, f fileRecord) (fileRecord, error) {
	if m.saveErr != nil {
		return fileRecord{}, m.saveErr
	}
	f.ID = "file-1"
	f.CreatedAt = time.Unix(100, 0).UTC()
	f.UpdatedAt = time.Unix(100, 0).UTC()
	return f, nil
}

func (m *mockRepo) GetUserStorage(_ context.Context, _ dbTX, _ string) (int64, int64, error) {
	quota := m.storageQuota
	if quota == 0 {
		quota = 1 << 40
	}
	return m.storageUsed, quota, m.getStorageErr
}

func (m *mockRepo) AddUserStorageUsed(_ context.Context, _ dbTX, _ string, delta int64) error {
	m.addedDelta = delta
	return m.addUsedErr
}

func (m *mockRepo) FindRecentByUserID(_ context.Context, _ dbTX, _ string, _ int) ([]fileRecord, error) {
	return nil, nil
}

type mockStorage struct {
	uploadedKey string
	err         error
}

func (m *mockStorage) Upload(_ context.Context, objectKey string, _ io.Reader, _ int64, _ string) error {
	m.uploadedKey = objectKey
	return m.err
}

func (m *mockStorage) PresignedGetURL(_ context.Context, _ string, _ time.Duration) (string, error) {
	return "http://localhost:9000/test-bucket/key", nil
}

func (m *mockStorage) Delete(_ context.Context, _ string) error {
	return nil
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
	canFn func(ctx context.Context, userID, directoryID string, action access.Action) (bool, error)
}

func (m *mockAccessChecker) Can(ctx context.Context, userID, directoryID string, action access.Action) (bool, error) {
	return m.canFn(ctx, userID, directoryID, action)
}

func newTestService(repo RepositoryInterface, storage StorageClient) *Service {
	tx := &mockTx{}
	return &Service{
		beginTx: func(_ context.Context, _ pgx.TxOptions) (transaction, error) {
			return tx, nil
		},
		db:            tx,
		repo:          repo,
		storage:       storage,
		accessChecker: &mockAccessChecker{canFn: func(_ context.Context, _, _ string, _ access.Action) (bool, error) { return true, nil }},
	}
}

func TestServiceUpload_Success(t *testing.T) {
	repo := &mockRepo{
		dir: directoryRecord{ID: "dir-1", OwnerID: "user-1"},
	}
	storage := &mockStorage{}
	svc := newTestService(repo, storage)

	resp, err := svc.Upload(context.Background(), "user-1", "dir-1", []FileUpload{
		{
			Filename:  "hello.txt",
			Extension: "txt",
			MimeType:  "text/plain",
			Size:      5,
			Content:   strings.NewReader("hello"),
		},
	})
	if err != nil {
		t.Fatalf("Upload returned error: %v", err)
	}
	if len(resp.Files) != 1 {
		t.Fatalf("expected 1 file, got %d", len(resp.Files))
	}
	if resp.Files[0].Filename != "hello.txt" {
		t.Fatalf("unexpected filename: %q", resp.Files[0].Filename)
	}
	if storage.uploadedKey == "" {
		t.Fatal("expected storage.Upload to be called")
	}
}

func TestServiceUpload_NoFiles(t *testing.T) {
	svc := newTestService(&mockRepo{}, &mockStorage{})

	_, err := svc.Upload(context.Background(), "user-1", "dir-1", []FileUpload{})
	if err == nil {
		t.Fatal("expected error")
	}
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeValidation {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestServiceUpload_DirectoryNotFound(t *testing.T) {
	repo := &mockRepo{}
	svc := newTestService(repo, &mockStorage{})
	svc.accessChecker = &mockAccessChecker{canFn: func(_ context.Context, _, _ string, _ access.Action) (bool, error) {
		return false, apperror.NotFound("директория не найдена")
	}}

	_, err := svc.Upload(context.Background(), "user-1", "dir-1", []FileUpload{
		{Filename: "f.txt", Extension: "txt", MimeType: "text/plain", Size: 1, Content: bytes.NewReader([]byte("x"))},
	})
	if err == nil {
		t.Fatal("expected error")
	}
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeNotFound {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestServiceUpload_AccessDenied(t *testing.T) {
	repo := &mockRepo{
		dir: directoryRecord{ID: "dir-1", OwnerID: "other-user"},
	}
	svc := newTestService(repo, &mockStorage{})
	svc.accessChecker = &mockAccessChecker{canFn: func(_ context.Context, _, _ string, _ access.Action) (bool, error) { return false, nil }}

	_, err := svc.Upload(context.Background(), "user-1", "dir-1", []FileUpload{
		{Filename: "f.txt", Extension: "txt", MimeType: "text/plain", Size: 1, Content: bytes.NewReader([]byte("x"))},
	})
	if err == nil {
		t.Fatal("expected error")
	}
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeForbidden {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestServiceUpload_FileTooLarge(t *testing.T) {
	repo := &mockRepo{
		dir: directoryRecord{ID: "dir-1", OwnerID: "user-1"},
	}
	svc := newTestService(repo, &mockStorage{})

	_, err := svc.Upload(context.Background(), "user-1", "dir-1", []FileUpload{
		{Filename: "big.bin", Extension: "bin", MimeType: "application/octet-stream", Size: maxFileSize + 1, Content: bytes.NewReader([]byte("x"))},
	})
	if err == nil {
		t.Fatal("expected error")
	}
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeValidation {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestServiceUpload_QuotaExceeded(t *testing.T) {
	repo := &mockRepo{
		dir:          directoryRecord{ID: "dir-1", OwnerID: "user-1"},
		storageUsed:  90,
		storageQuota: 100,
	}
	svc := newTestService(repo, &mockStorage{})

	_, err := svc.Upload(context.Background(), "user-1", "dir-1", []FileUpload{
		{Filename: "f.txt", Extension: "txt", MimeType: "text/plain", Size: 50, Content: bytes.NewReader([]byte("x"))},
	})
	if err == nil {
		t.Fatal("expected error")
	}
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeValidation {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestExtractExtension(t *testing.T) {
	cases := []struct {
		filename string
		want     string
	}{
		{"hello.txt", "txt"},
		{"image.PNG", "png"},
		{"archive.tar.gz", "gz"},
		{"noext", ""},
	}
	for _, c := range cases {
		got := ExtractExtension(c.filename)
		if got != c.want {
			t.Fatalf("ExtractExtension(%q) = %q, want %q", c.filename, got, c.want)
		}
	}
}
