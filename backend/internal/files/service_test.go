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

	file       fileRecord
	fileErr    error
	softErr    error
	restoreErr error
	hardErr    error

	conv        conversionRecord
	convErr     error
	convList    []conversionRecord
	convListErr error

	findRecentByUserIDRes      []fileRecord
	findRecentByUserIDErr      error
	findRecentByUserIDAfterRes []fileRecord
	findRecentByUserIDAfterErr error
}

func (m *mockRepo) FindDirectoryByID(_ context.Context, _ dbTX, _ string) (directoryRecord, error) {
	return m.dir, m.dirErr
}

func (m *mockRepo) FindDirectoryByIDAnyState(_ context.Context, _ dbTX, _ string) (directoryRecord, error) {
	return m.dir, m.dirErr
}

func (m *mockRepo) FindByID(_ context.Context, _ dbTX, _ string) (fileRecord, error) {
	return m.file, m.fileErr
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
	return m.findRecentByUserIDRes, m.findRecentByUserIDErr
}

func (m *mockRepo) FindRecentByUserIDAfterCursor(_ context.Context, _ dbTX, _ string, _ time.Time, _ string, _ int) ([]fileRecord, error) {
	return m.findRecentByUserIDAfterRes, m.findRecentByUserIDAfterErr
}

func (m *mockRepo) SaveConversion(_ context.Context, _ dbTX, _, _, _, _, _ string) (conversionRecord, error) {
	return m.conv, m.convErr
}
func (m *mockRepo) FindConversionsByFile(_ context.Context, _ dbTX, _ string) ([]conversionRecord, error) {
	return m.convList, m.convListErr
}

type mockStorage struct {
	uploadedKey string
	err         error
	getData     []byte
	getErr      error
	listedKeys  []string
	listErr     error
}

func (m *mockStorage) Upload(_ context.Context, objectKey string, _ io.Reader, _ int64, _ string) error {
	m.uploadedKey = objectKey
	return m.err
}

func (m *mockStorage) PresignedGetURL(_ context.Context, _ string, _ time.Duration) (string, error) {
	return "http://localhost:9000/test-bucket/key", nil
}

func (m *mockStorage) PresignedDownloadURL(_ context.Context, key string, _ time.Duration, filename string) (string, error) {
	return "http://localhost:9000/tmp/" + key + "?dl=" + filename, nil
}

func (m *mockStorage) Delete(_ context.Context, _ string) error {
	return nil
}

func (m *mockStorage) Get(_ context.Context, _ string) (io.ReadCloser, error) {
	return io.NopCloser(bytes.NewReader(m.getData)), m.getErr
}

func (m *mockStorage) ListObjects(_ context.Context, _ string, _ time.Time) ([]string, error) {
	return nil, nil
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
	if m.getPermissionsFn != nil {
		return m.getPermissionsFn(ctx, userID, directoryID)
	}
	return &access.Permissions{}, nil
}

func (m *mockAccessChecker) GetSharedDirectoryID(_ context.Context, _, _ string) (*string, error) {
	return nil, nil
}

func (m *mockRepo) FindByIDAnyState(_ context.Context, _ dbTX, _ string) (fileRecord, error) {
	return m.file, m.fileErr
}
func (m *mockRepo) SoftDeleteFile(_ context.Context, _ dbTX, _ string, _ time.Time) error {
	return m.softErr
}
func (m *mockRepo) RestoreFile(_ context.Context, _ dbTX, _ string) error    { return m.restoreErr }
func (m *mockRepo) HardDeleteFile(_ context.Context, _ dbTX, _ string) error { return m.hardErr }
func (m *mockRepo) MoveFile(_ context.Context, _ dbTX, _, _ string, _ *string) (fileRecord, error) {
	return fileRecord{}, nil
}
func (m *mockRepo) FindByFilenameAndDirectory(_ context.Context, _ dbTX, _, _ string, _ ...string) (fileRecord, error) {
	return fileRecord{}, pgx.ErrNoRows
}

func (m *mockRepo) IncrementFilesCount(_ context.Context, _ dbTX, _ string, _ int) error {
	return nil
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
		tmpStorage:    storage,
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

func TestServiceSoftDelete_Success(t *testing.T) {
	repo := &mockRepo{file: fileRecord{ID: "f-1", DirectoryID: "d-1", OwnerID: "user-1"}}
	svc := newTestService(repo, &mockStorage{})

	if err := svc.SoftDelete(context.Background(), "user-1", "f-1"); err != nil {
		t.Fatalf("SoftDelete: %v", err)
	}
}

func TestServiceSoftDelete_AlreadyTrashed(t *testing.T) {
	now := time.Now()
	repo := &mockRepo{file: fileRecord{ID: "f-1", DirectoryID: "d-1", DeletedAt: &now}}
	svc := newTestService(repo, &mockStorage{})

	err := svc.SoftDelete(context.Background(), "user-1", "f-1")
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeValidation {
		t.Fatalf("expected validation, got %v", err)
	}
}

func TestServiceSoftDelete_Forbidden(t *testing.T) {
	repo := &mockRepo{file: fileRecord{ID: "f-1", DirectoryID: "d-1"}}
	svc := newTestService(repo, &mockStorage{})
	svc.accessChecker = &mockAccessChecker{canFn: func(_ context.Context, _, _ string, _ access.Action) (bool, error) { return false, nil }}

	err := svc.SoftDelete(context.Background(), "user-1", "f-1")
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeForbidden {
		t.Fatalf("expected forbidden, got %v", err)
	}
}

func TestServicePermanentDelete_Success(t *testing.T) {
	repo := &mockRepo{file: fileRecord{ID: "f-1", DirectoryID: "d-1", OwnerID: "user-1", Size: 100, ObjectKey: "key-1"}}
	storage := &mockStorage{}
	svc := newTestService(repo, storage)

	if err := svc.PermanentDelete(context.Background(), "user-1", "f-1"); err != nil {
		t.Fatalf("PermanentDelete: %v", err)
	}
	if repo.addedDelta != -100 {
		t.Fatalf("expected storage_used -100, got %d", repo.addedDelta)
	}
}

func TestServiceConvertAndDownload_Success(t *testing.T) {
	repo := &mockRepo{file: fileRecord{ID: "src-1", DirectoryID: "d-1", Filename: "photo.png", Extension: "png", ObjectKey: "obj-1"}}
	storage := &mockStorage{getData: makePNG(t)}
	svc := newTestService(repo, storage)

	url, filename, err := svc.ConvertAndDownload(context.Background(), "user-1", "src-1", "jpg")
	if err != nil {
		t.Fatalf("ConvertAndDownload: %v", err)
	}
	if filename != "photo.jpg" || url == "" {
		t.Fatalf("unexpected: url=%s file=%s", url, filename)
	}
}

func TestServiceConvertAndSave_Success(t *testing.T) {
	repo := &mockRepo{file: fileRecord{ID: "src-1", DirectoryID: "d-1", OwnerID: "user-1", Filename: "photo.png", Extension: "png", ObjectKey: "obj-1"}}
	storage := &mockStorage{getData: makePNG(t)}
	svc := newTestService(repo, storage)

	if _, err := svc.ConvertAndSave(context.Background(), "user-1", "src-1", "webp"); err != nil {
		t.Fatalf("ConvertAndSave: %v", err)
	}
	if storage.uploadedKey == "" {
		t.Fatal("expected converted object upload")
	}
	if repo.addedDelta <= 0 {
		t.Fatalf("expected storage_used increase, got %d", repo.addedDelta)
	}
}

func TestServiceConvert_UnsupportedPair(t *testing.T) {
	repo := &mockRepo{file: fileRecord{DirectoryID: "d-1", Filename: "a.jpg", Extension: "jpg", ObjectKey: "o"}}
	storage := &mockStorage{getData: makeJPG(t)}
	svc := newTestService(repo, storage)

	_, _, err := svc.ConvertAndDownload(context.Background(), "user-1", "f-1", "png")
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeValidation {
		t.Fatalf("expected validation, got %v", err)
	}
}
