package dirs

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"sharedspace/internal/access"
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

type mockRows struct {
	closeCalled bool
	pos         int
	data        []rowData
	scanErr     error
}

type rowData struct {
	vals []any
}

func (m *mockRows) Next() bool {
	m.pos++
	return m.pos <= len(m.data)
}

func (m *mockRows) Scan(dest ...any) error {
	if m.scanErr != nil {
		return m.scanErr
	}
	if m.pos-1 < len(m.data) {
		for i, v := range m.data[m.pos-1].vals {
			if i < len(dest) {
				*(dest[i].(*any)) = v
			}
		}
	}
	return nil
}

func (m *mockRows) Close() {
	m.closeCalled = true
}

func (m *mockRows) Err() error {
	return nil
}

func (m *mockRows) CommandTag() pgconn.CommandTag {
	return pgconn.CommandTag{}
}

func (m *mockRows) FieldDescriptions() []pgconn.FieldDescription {
	return nil
}

func (m *mockRows) Values() ([]any, error) {
	return nil, nil
}

func (m *mockRows) RawValues() [][]byte {
	return nil
}

type mockRepo struct {
	findByIDResult    directoryRecord
	findByIDErr       error
	findByIDResult2   directoryRecord
	findRootResult    directoryRecord
	findRootErr       error
	subdirectories    []directoryRecord
	subdirectoriesErr error
	files             []fileRecord
	filesErr          error
	findByNameResult  directoryRecord
	findByNameErr     error
	createResult      directoryRecord
	createErr         error
	updateResult      directoryRecord
	updateErr         error

	createName     string
	createOwnerID  string
	createParentID string
	updateID       string
	updateName     *string
	updateParentID *string

	findByIDCallCount int

	findByIDAnyStateResult directoryRecord
	findByIDAnyStateErr    error
	findSubtreeIDsResult   []string
	findSubtreeIDsErr      error
	findFilesInDirsResult  []fileRecord
	findFilesInDirsErr     error
	findDeletedFilesResult []fileRecord
	findDeletedFilesErr    error
	softDeleteSubtreeErr   error
	softDeleteFilesErr     error
	restoreSubtreeErr      error
	restoreFilesErr        error
	hardDeleteSubtreeErr   error
	addUserStorageUsedErr  error

	sharedDirsCount    int
	sharedDirsQuota    int
	sharedDirsStatsErr error
	incrementErr       error
	decrementErr       error

	shareLinksResult    map[string]bool
	shareLinksDirResult map[string]bool
	shareLinksErr       error
}

func (m *mockRepo) FindByID(_ context.Context, _ dbTX, _ string) (directoryRecord, error) {
	m.findByIDCallCount++
	if m.findByIDCallCount == 2 {
		return m.findByIDResult2, m.findByIDErr
	}
	return m.findByIDResult, m.findByIDErr
}

func (m *mockRepo) FindRootByOwner(_ context.Context, _ dbTX, _ string) (directoryRecord, error) {
	return m.findRootResult, m.findRootErr
}

func (m *mockRepo) FindSubdirectories(_ context.Context, _ dbTX, _ string) ([]directoryRecord, error) {
	return m.subdirectories, m.subdirectoriesErr
}

func (m *mockRepo) FindFiles(_ context.Context, _ dbTX, _ string) ([]fileRecord, error) {
	return m.files, m.filesErr
}

func (m *mockRepo) FindByNameAndParent(_ context.Context, _ dbTX, _, _, _ string) (directoryRecord, error) {
	return m.findByNameResult, m.findByNameErr
}

func (m *mockRepo) Create(_ context.Context, _ dbTX, name, ownerID, parentID string) (directoryRecord, error) {
	m.createName = name
	m.createOwnerID = ownerID
	m.createParentID = parentID
	return m.createResult, m.createErr
}

func (m *mockRepo) UpdateNameAndParent(_ context.Context, _ dbTX, id string, name *string, parentID *string) (directoryRecord, error) {
	m.updateID = id
	m.updateName = name
	m.updateParentID = parentID
	return m.updateResult, m.updateErr
}

func (m *mockRepo) FindByIDAnyState(_ context.Context, _ dbTX, _ string) (directoryRecord, error) {
	return m.findByIDAnyStateResult, m.findByIDAnyStateErr
}

func (m *mockRepo) FindSubtreeIDs(_ context.Context, _ dbTX, _ string) ([]string, error) {
	return m.findSubtreeIDsResult, m.findSubtreeIDsErr
}

func (m *mockRepo) FindFilesInDirs(_ context.Context, _ dbTX, _ []string) ([]fileRecord, error) {
	return m.findFilesInDirsResult, m.findFilesInDirsErr
}

func (m *mockRepo) FindDeletedFilesInDirs(_ context.Context, _ dbTX, _ []string) ([]fileRecord, error) {
	return m.findDeletedFilesResult, m.findDeletedFilesErr
}

func (m *mockRepo) SoftDeleteSubtree(_ context.Context, _ dbTX, _ []string, _ time.Time) error {
	return m.softDeleteSubtreeErr
}

func (m *mockRepo) SoftDeleteFilesInDirs(_ context.Context, _ dbTX, _ []string, _ time.Time) error {
	return m.softDeleteFilesErr
}

func (m *mockRepo) RestoreSubtree(_ context.Context, _ dbTX, _ []string) error {
	return m.restoreSubtreeErr
}

func (m *mockRepo) RestoreFilesInDirs(_ context.Context, _ dbTX, _ []string, _ time.Time) error {
	return m.restoreFilesErr
}

func (m *mockRepo) HardDeleteSubtree(_ context.Context, _ dbTX, _ []string) error {
	return m.hardDeleteSubtreeErr
}

func (m *mockRepo) AddUserStorageUsed(_ context.Context, _ dbTX, _ string, _ int64) error {
	return m.addUserStorageUsedErr
}

func (m *mockRepo) GetSharedDirsStats(_ context.Context, _ dbTX, _ string) (int, int, error) {
	quota := m.sharedDirsQuota
	if quota == 0 {
		quota = 5
	}
	return m.sharedDirsCount, quota, m.sharedDirsStatsErr
}

func (m *mockRepo) IncrementSharedDirsCount(_ context.Context, _ dbTX, _ string) error {
	m.sharedDirsCount++
	return m.incrementErr
}

func (m *mockRepo) DecrementSharedDirsCount(_ context.Context, _ dbTX, _ string) error {
	if m.sharedDirsCount > 0 {
		m.sharedDirsCount--
	}
	return m.decrementErr
}

type mockStorage struct {
	deleteErr error
	deleteKey string
}

func (m *mockStorage) Delete(_ context.Context, objectKey string) error {
	m.deleteKey = objectKey
	return m.deleteErr
}

type mockSharingRepo struct {
	createSharedErr     error
	createSharedDirID   string
	createSharedOwnerID string
}

func (m *mockSharingRepo) CreateShared(_ context.Context, _ interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}, directoryID, ownerID string) error {
	m.createSharedDirID = directoryID
	m.createSharedOwnerID = ownerID
	return m.createSharedErr
}

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

func (m *mockRepo) IncrementFilesCount(_ context.Context, _ dbTX, _ string, _ int) error {
	return nil
}

func (m *mockRepo) CheckShareLinks(_ context.Context, _ dbTX, fileIDs, dirIDs []string) (map[string]bool, map[string]bool, error) {
	if m.shareLinksErr != nil {
		return nil, nil, m.shareLinksErr
	}
	fileLinks := make(map[string]bool)
	for _, id := range fileIDs {
		if m.shareLinksResult != nil && m.shareLinksResult[id] {
			fileLinks[id] = true
		}
	}
	dirLinks := make(map[string]bool)
	for _, id := range dirIDs {
		if m.shareLinksDirResult != nil && m.shareLinksDirResult[id] {
			dirLinks[id] = true
		}
	}
	return fileLinks, dirLinks, nil
}

func newTestService(repo RepositoryInterface) (*Service, *mockTx) {
	tx := &mockTx{}
	service := &Service{
		beginTx:       func(context.Context, pgx.TxOptions) (transaction, error) { return tx, nil },
		db:            tx,
		repo:          repo,
		sharingRepo:   &mockSharingRepo{},
		accessChecker: &mockAccessChecker{canFn: func(_ context.Context, _, _ string, _ access.Action) (bool, error) { return true, nil }},
		storage:       &mockStorage{},
	}
	return service, tx
}

func TestServiceGetRootContents(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		now := time.Now()
		repo := &mockRepo{
			findRootResult: directoryRecord{ID: "root-1", Name: "ivan", OwnerID: "user-1", Type: "root", CreatedAt: now, UpdatedAt: now},
			subdirectories: []directoryRecord{
				{ID: "sub-1", Name: "photos", OwnerID: "user-1", ParentID: strPtr("root-1"), Type: "regular", CreatedAt: now, UpdatedAt: now},
			},
			files: []fileRecord{
				{ID: "file-1", Filename: "readme.txt", Extension: "txt", MimeType: "text/plain", Size: 1024, CreatedAt: now, UpdatedAt: now},
			},
		}
		service, _ := newTestService(repo)

		resp, err := service.GetRootContents(context.Background(), "user-1")
		if err != nil {
			t.Fatalf("GetRootContents returned error: %v", err)
		}
		if resp.ID != "root-1" {
			t.Fatalf("unexpected root id: %q", resp.ID)
		}
		if len(resp.Subdirectories) != 1 || resp.Subdirectories[0].ID != "sub-1" {
			t.Fatalf("unexpected subdirectories: %+v", resp.Subdirectories)
		}
		if len(resp.Files) != 1 || resp.Files[0].ID != "file-1" {
			t.Fatalf("unexpected files: %+v", resp.Files)
		}
	})

	t.Run("root not found", func(t *testing.T) {
		repo := &mockRepo{findRootErr: pgx.ErrNoRows}
		service, _ := newTestService(repo)

		_, err := service.GetRootContents(context.Background(), "user-1")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeNotFound {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestServiceGetContents(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		now := time.Now()
		repo := &mockRepo{
			findByIDResult: directoryRecord{ID: "dir-1", Name: "photos", OwnerID: "user-1", Type: "regular", CreatedAt: now, UpdatedAt: now},
			subdirectories: []directoryRecord{
				{ID: "sub-1", Name: "vacation", OwnerID: "user-1", ParentID: strPtr("dir-1"), Type: "regular", CreatedAt: now, UpdatedAt: now},
			},
		}
		service, _ := newTestService(repo)

		resp, err := service.GetContents(context.Background(), "user-1", "dir-1")
		if err != nil {
			t.Fatalf("GetContents returned error: %v", err)
		}
		if resp.ID != "dir-1" || resp.Name != "photos" {
			t.Fatalf("unexpected response: %+v", resp)
		}
		if len(resp.Subdirectories) != 1 {
			t.Fatalf("expected 1 subdirectory, got %d", len(resp.Subdirectories))
		}
	})

	t.Run("not found", func(t *testing.T) {
		repo := &mockRepo{findByIDErr: pgx.ErrNoRows}
		service, _ := newTestService(repo)

		_, err := service.GetContents(context.Background(), "user-1", "missing")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeNotFound {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("forbidden", func(t *testing.T) {
		now := time.Now()
		repo := &mockRepo{
			findByIDResult: directoryRecord{ID: "dir-1", Name: "photos", OwnerID: "other-user", Type: "regular", CreatedAt: now, UpdatedAt: now},
		}
		service, _ := newTestService(repo)
		service.accessChecker = &mockAccessChecker{canFn: func(_ context.Context, _, _ string, _ access.Action) (bool, error) { return false, nil }}

		_, err := service.GetContents(context.Background(), "user-1", "dir-1")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeForbidden {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestServiceGetByID(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		now := time.Now()
		repo := &mockRepo{
			findByIDResult: directoryRecord{ID: "dir-1", Name: "photos", OwnerID: "user-1", Type: "regular", CreatedAt: now, UpdatedAt: now},
		}
		service, _ := newTestService(repo)

		resp, err := service.GetByID(context.Background(), "user-1", "dir-1")
		if err != nil {
			t.Fatalf("GetByID returned error: %v", err)
		}
		if resp.ID != "dir-1" || resp.Name != "photos" || resp.OwnerID != "user-1" {
			t.Fatalf("unexpected response: %+v", resp)
		}
	})

	t.Run("not found", func(t *testing.T) {
		repo := &mockRepo{findByIDErr: pgx.ErrNoRows}
		service, _ := newTestService(repo)

		_, err := service.GetByID(context.Background(), "user-1", "missing")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeNotFound {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("forbidden", func(t *testing.T) {
		now := time.Now()
		repo := &mockRepo{
			findByIDResult: directoryRecord{ID: "dir-1", Name: "photos", OwnerID: "other-user", Type: "regular", CreatedAt: now, UpdatedAt: now},
		}
		service, _ := newTestService(repo)
		service.accessChecker = &mockAccessChecker{canFn: func(_ context.Context, _, _ string, _ access.Action) (bool, error) { return false, nil }}

		_, err := service.GetByID(context.Background(), "user-1", "dir-1")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeForbidden {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestServiceCreate(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		now := time.Now()
		repo := &mockRepo{
			findByIDResult: directoryRecord{ID: "parent-1", Name: "parent", OwnerID: "user-1", Type: "regular", CreatedAt: now, UpdatedAt: now},
			findByNameErr:  pgx.ErrNoRows,
			createResult:   directoryRecord{ID: "new-1", Name: "newdir", OwnerID: "user-1", ParentID: strPtr("parent-1"), Type: "regular", CreatedAt: now, UpdatedAt: now},
		}
		service, tx := newTestService(repo)

		resp, err := service.Create(context.Background(), "user-1", CreateDirectoryRequest{Name: "newdir", ParentID: "parent-1"})
		if err != nil {
			t.Fatalf("Create returned error: %v", err)
		}
		if resp.ID != "new-1" || resp.Name != "newdir" {
			t.Fatalf("unexpected response: %+v", resp)
		}
		if repo.createName != "newdir" || repo.createOwnerID != "user-1" || repo.createParentID != "parent-1" {
			t.Fatalf("unexpected create args: %+v", repo)
		}
		if tx.commitCount != 1 {
			t.Fatalf("commit count = %d, want 1", tx.commitCount)
		}
	})

	t.Run("empty name", func(t *testing.T) {
		service, _ := newTestService(&mockRepo{})
		_, err := service.Create(context.Background(), "user-1", CreateDirectoryRequest{Name: "", ParentID: "parent-1"})
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeValidation {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("empty parent_id", func(t *testing.T) {
		service, _ := newTestService(&mockRepo{})
		_, err := service.Create(context.Background(), "user-1", CreateDirectoryRequest{Name: "newdir", ParentID: ""})
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeValidation {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("parent not found", func(t *testing.T) {
		repo := &mockRepo{findByIDErr: pgx.ErrNoRows}
		service, _ := newTestService(repo)
		_, err := service.Create(context.Background(), "user-1", CreateDirectoryRequest{Name: "newdir", ParentID: "missing"})
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeNotFound {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("forbidden parent", func(t *testing.T) {
		now := time.Now()
		repo := &mockRepo{
			findByIDResult: directoryRecord{ID: "parent-1", Name: "parent", OwnerID: "other-user", Type: "regular", CreatedAt: now, UpdatedAt: now},
			findByNameErr:  pgx.ErrNoRows,
		}
		service, _ := newTestService(repo)
		service.accessChecker = &mockAccessChecker{canFn: func(_ context.Context, _, _ string, _ access.Action) (bool, error) { return false, nil }}
		_, err := service.Create(context.Background(), "user-1", CreateDirectoryRequest{Name: "newdir", ParentID: "parent-1"})
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeForbidden {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("duplicate name", func(t *testing.T) {
		now := time.Now()
		repo := &mockRepo{
			findByIDResult:   directoryRecord{ID: "parent-1", Name: "parent", OwnerID: "user-1", Type: "regular", CreatedAt: now, UpdatedAt: now},
			findByNameResult: directoryRecord{ID: "existing", Name: "newdir", OwnerID: "user-1", Type: "regular", CreatedAt: now, UpdatedAt: now},
		}
		service, _ := newTestService(repo)
		_, err := service.Create(context.Background(), "user-1", CreateDirectoryRequest{Name: "newdir", ParentID: "parent-1"})
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeConflict {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestServiceCreate_SharedQuota(t *testing.T) {
	t.Run("shared success within quota", func(t *testing.T) {
		now := time.Now()
		repo := &mockRepo{
			findByIDResult:  directoryRecord{ID: "parent-1", Name: "parent", OwnerID: "user-1", Type: "regular", CreatedAt: now, UpdatedAt: now},
			findByNameErr:   pgx.ErrNoRows,
			createResult:    directoryRecord{ID: "new-1", Name: "shared", OwnerID: "user-1", ParentID: strPtr("parent-1"), Type: "regular", CreatedAt: now, UpdatedAt: now},
			sharedDirsCount: 3,
			sharedDirsQuota: 5,
		}
		service, tx := newTestService(repo)

		resp, err := service.Create(context.Background(), "user-1", CreateDirectoryRequest{Name: "shared", ParentID: "parent-1", Shared: true})
		if err != nil {
			t.Fatalf("Create returned error: %v", err)
		}
		if resp.ID != "new-1" {
			t.Fatalf("unexpected response: %+v", resp)
		}
		if tx.commitCount != 1 {
			t.Fatalf("commit count = %d, want 1", tx.commitCount)
		}
		if repo.sharedDirsCount != 4 {
			t.Fatalf("expected count 4, got %d", repo.sharedDirsCount)
		}
	})

	t.Run("shared quota exceeded", func(t *testing.T) {
		now := time.Now()
		repo := &mockRepo{
			findByIDResult:  directoryRecord{ID: "parent-1", Name: "parent", OwnerID: "user-1", Type: "regular", CreatedAt: now, UpdatedAt: now},
			findByNameErr:   pgx.ErrNoRows,
			createResult:    directoryRecord{ID: "new-1", Name: "shared", OwnerID: "user-1", ParentID: strPtr("parent-1"), Type: "regular", CreatedAt: now, UpdatedAt: now},
			sharedDirsCount: 5,
			sharedDirsQuota: 5,
		}
		service, _ := newTestService(repo)

		_, err := service.Create(context.Background(), "user-1", CreateDirectoryRequest{Name: "shared", ParentID: "parent-1", Shared: true})
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeValidation {
			t.Fatalf("expected validation error, got: %v", err)
		}
	})
}

func TestServiceUpdate(t *testing.T) {
	t.Run("rename only", func(t *testing.T) {
		now := time.Now()
		repo := &mockRepo{
			findByIDResult:  directoryRecord{ID: "dir-1", Name: "oldname", OwnerID: "user-1", ParentID: strPtr("parent-1"), Type: "regular", CreatedAt: now, UpdatedAt: now},
			findByIDResult2: directoryRecord{ID: "parent-1", OwnerID: "user-1"},
			findByNameErr:   pgx.ErrNoRows,
			updateResult:    directoryRecord{ID: "dir-1", Name: "newname", OwnerID: "user-1", ParentID: strPtr("parent-1"), Type: "regular", CreatedAt: now, UpdatedAt: now},
		}
		service, tx := newTestService(repo)

		newName := "newname"
		resp, err := service.Update(context.Background(), "user-1", "dir-1", UpdateDirectoryRequest{Name: &newName})
		if err != nil {
			t.Fatalf("Update returned error: %v", err)
		}
		if resp.Name != "newname" {
			t.Fatalf("unexpected name: %q", resp.Name)
		}
		if repo.updateID != "dir-1" || repo.updateName == nil || *repo.updateName != "newname" {
			t.Fatalf("unexpected update args: %+v", repo)
		}
		if tx.commitCount != 1 {
			t.Fatalf("commit count = %d, want 1", tx.commitCount)
		}
	})

	t.Run("move only", func(t *testing.T) {
		now := time.Now()
		repo := &mockRepo{
			findByIDResult:  directoryRecord{ID: "dir-1", Name: "mydir", OwnerID: "user-1", ParentID: strPtr("old-parent"), Type: "regular", CreatedAt: now, UpdatedAt: now},
			findByIDResult2: directoryRecord{ID: "new-parent", OwnerID: "user-1"},
			findByNameErr:   pgx.ErrNoRows,
			updateResult:    directoryRecord{ID: "dir-1", Name: "mydir", OwnerID: "user-1", ParentID: strPtr("new-parent"), Type: "regular", CreatedAt: now, UpdatedAt: now},
		}
		service, _ := newTestService(repo)

		newParent := "new-parent"
		resp, err := service.Update(context.Background(), "user-1", "dir-1", UpdateDirectoryRequest{ParentID: &newParent})
		if err != nil {
			t.Fatalf("Update returned error: %v", err)
		}
		if resp.ParentID == nil || *resp.ParentID != "new-parent" {
			t.Fatalf("unexpected parent: %v", resp.ParentID)
		}
	})

	t.Run("rename and move", func(t *testing.T) {
		now := time.Now()
		repo := &mockRepo{
			findByIDResult:  directoryRecord{ID: "dir-1", Name: "oldname", OwnerID: "user-1", ParentID: strPtr("old-parent"), Type: "regular", CreatedAt: now, UpdatedAt: now},
			findByIDResult2: directoryRecord{ID: "new-parent", OwnerID: "user-1"},
			findByNameErr:   pgx.ErrNoRows,
			updateResult:    directoryRecord{ID: "dir-1", Name: "newname", OwnerID: "user-1", ParentID: strPtr("new-parent"), Type: "regular", CreatedAt: now, UpdatedAt: now},
		}
		service, _ := newTestService(repo)

		newName := "newname"
		newParent := "new-parent"
		resp, err := service.Update(context.Background(), "user-1", "dir-1", UpdateDirectoryRequest{Name: &newName, ParentID: &newParent})
		if err != nil {
			t.Fatalf("Update returned error: %v", err)
		}
		if resp.Name != "newname" {
			t.Fatalf("unexpected name: %q", resp.Name)
		}
		if resp.ParentID == nil || *resp.ParentID != "new-parent" {
			t.Fatalf("unexpected parent: %v", resp.ParentID)
		}
	})

	t.Run("no fields provided", func(t *testing.T) {
		service, _ := newTestService(&mockRepo{})
		_, err := service.Update(context.Background(), "user-1", "dir-1", UpdateDirectoryRequest{})
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeValidation {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("empty name", func(t *testing.T) {
		service, _ := newTestService(&mockRepo{})
		empty := ""
		_, err := service.Update(context.Background(), "user-1", "dir-1", UpdateDirectoryRequest{Name: &empty})
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeValidation {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("not found", func(t *testing.T) {
		repo := &mockRepo{findByIDErr: pgx.ErrNoRows}
		service, _ := newTestService(repo)
		name := "newname"
		_, err := service.Update(context.Background(), "user-1", "missing", UpdateDirectoryRequest{Name: &name})
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeNotFound {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("forbidden", func(t *testing.T) {
		now := time.Now()
		repo := &mockRepo{
			findByIDResult: directoryRecord{ID: "dir-1", Name: "mydir", OwnerID: "other-user", Type: "regular", CreatedAt: now, UpdatedAt: now},
		}
		service, _ := newTestService(repo)
		service.accessChecker = &mockAccessChecker{canFn: func(_ context.Context, _, _ string, _ access.Action) (bool, error) { return false, nil }}
		name := "newname"
		_, err := service.Update(context.Background(), "user-1", "dir-1", UpdateDirectoryRequest{Name: &name})
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeForbidden {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("root directory cannot be renamed", func(t *testing.T) {
		now := time.Now()
		repo := &mockRepo{
			findByIDResult: directoryRecord{ID: "root-1", Name: "ivan", OwnerID: "user-1", Type: "root", CreatedAt: now, UpdatedAt: now},
		}
		service, _ := newTestService(repo)
		name := "newname"
		_, err := service.Update(context.Background(), "user-1", "root-1", UpdateDirectoryRequest{Name: &name})
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeForbidden {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("move to forbidden parent", func(t *testing.T) {
		now := time.Now()
		repo := &mockRepo{
			findByIDResult: directoryRecord{ID: "dir-1", Name: "mydir", OwnerID: "user-1", ParentID: strPtr("old-parent"), Type: "regular", CreatedAt: now, UpdatedAt: now},
			findByNameErr:  pgx.ErrNoRows,
		}
		service, _ := newTestService(repo)
		service.accessChecker = &mockAccessChecker{canFn: func(_ context.Context, _, dirID string, _ access.Action) (bool, error) {
			return dirID == "dir-1", nil
		}}

		newParent := "other-parent"
		_, err := service.Update(context.Background(), "user-1", "dir-1", UpdateDirectoryRequest{ParentID: &newParent})
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeForbidden {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("conflict on target", func(t *testing.T) {
		now := time.Now()
		repo := &mockRepo{
			findByIDResult:   directoryRecord{ID: "dir-1", Name: "mydir", OwnerID: "user-1", ParentID: strPtr("parent-1"), Type: "regular", CreatedAt: now, UpdatedAt: now},
			findByIDResult2:  directoryRecord{ID: "parent-1", OwnerID: "user-1"},
			findByNameResult: directoryRecord{ID: "existing", Name: "mydir", OwnerID: "user-1", Type: "regular", CreatedAt: now, UpdatedAt: now},
		}
		service, _ := newTestService(repo)

		newName := "mydir"
		_, err := service.Update(context.Background(), "user-1", "dir-1", UpdateDirectoryRequest{Name: &newName})
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeConflict {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func strPtr(s string) *string {
	return &s
}

func TestServiceSoftDelete(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		now := time.Now()
		repo := &mockRepo{
			findByIDAnyStateResult: directoryRecord{ID: "dir-1", Name: "mydir", OwnerID: "user-1", Type: "regular", DeletedAt: nil, CreatedAt: now, UpdatedAt: now},
			findSubtreeIDsResult:   []string{"dir-1", "sub-1"},
		}
		service, tx := newTestService(repo)

		err := service.SoftDelete(context.Background(), "user-1", "dir-1")
		if err != nil {
			t.Fatalf("SoftDelete returned error: %v", err)
		}
		if tx.commitCount != 1 {
			t.Fatalf("commit count = %d, want 1", tx.commitCount)
		}
	})

	t.Run("root cannot be deleted", func(t *testing.T) {
		now := time.Now()
		repo := &mockRepo{
			findByIDAnyStateResult: directoryRecord{ID: "root-1", Name: "ivan", OwnerID: "user-1", Type: "root", DeletedAt: nil, CreatedAt: now, UpdatedAt: now},
		}
		service, _ := newTestService(repo)

		err := service.SoftDelete(context.Background(), "user-1", "root-1")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeForbidden {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("already deleted", func(t *testing.T) {
		now := time.Now()
		deletedAt := now
		repo := &mockRepo{
			findByIDAnyStateResult: directoryRecord{ID: "dir-1", Name: "mydir", OwnerID: "user-1", Type: "regular", DeletedAt: &deletedAt, CreatedAt: now, UpdatedAt: now},
		}
		service, _ := newTestService(repo)

		err := service.SoftDelete(context.Background(), "user-1", "dir-1")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeValidation {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestServicePermanentDelete(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		now := time.Now()
		deletedAt := now.Add(-time.Hour)
		repo := &mockRepo{
			findByIDAnyStateResult: directoryRecord{ID: "dir-1", Name: "mydir", OwnerID: "user-1", Type: "regular", DeletedAt: &deletedAt, CreatedAt: now, UpdatedAt: now},
			findSubtreeIDsResult:   []string{"dir-1", "sub-1"},
			findFilesInDirsResult:  []fileRecord{{ID: "file-1", ObjectKey: "key1", Size: 1024, OwnerID: "user-1"}},
			findDeletedFilesResult: []fileRecord{{ID: "file-2", ObjectKey: "key2", Size: 2048, OwnerID: "user-1"}},
		}
		storage := &mockStorage{}
		tx := &mockTx{}
		service := &Service{
			beginTx:       func(context.Context, pgx.TxOptions) (transaction, error) { return tx, nil },
			db:            tx,
			repo:          repo,
			sharingRepo:   &mockSharingRepo{},
			accessChecker: &mockAccessChecker{canFn: func(_ context.Context, _, _ string, _ access.Action) (bool, error) { return true, nil }},
			storage:       storage,
		}

		err := service.PermanentDelete(context.Background(), "user-1", "dir-1")
		if err != nil {
			t.Fatalf("PermanentDelete returned error: %v", err)
		}
		if tx.commitCount != 1 {
			t.Fatalf("commit count = %d, want 1", tx.commitCount)
		}
	})

	t.Run("root cannot be deleted", func(t *testing.T) {
		now := time.Now()
		repo := &mockRepo{
			findByIDAnyStateResult: directoryRecord{ID: "root-1", Name: "ivan", OwnerID: "user-1", Type: "root", CreatedAt: now, UpdatedAt: now},
		}
		service, _ := newTestService(repo)

		err := service.PermanentDelete(context.Background(), "user-1", "root-1")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeForbidden {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}
