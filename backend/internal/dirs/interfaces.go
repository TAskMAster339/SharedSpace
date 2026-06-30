package dirs

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type ServiceInterface interface {
	GetRootContents(ctx context.Context, userID string, params ContentsPaginationParams) (*DirectoryContentsResponse, error)
	GetContents(ctx context.Context, userID, dirID string, params ContentsPaginationParams) (*DirectoryContentsResponse, error)
	GetByID(ctx context.Context, userID, dirID string) (DirectoryResponse, error)
	Create(ctx context.Context, userID string, req CreateDirectoryRequest) (DirectoryResponse, error)
	Update(ctx context.Context, userID, dirID string, req UpdateDirectoryRequest) (DirectoryResponse, error)
	SoftDelete(ctx context.Context, userID, dirID string) error
	Restore(ctx context.Context, userID, dirID string) error
	PermanentDelete(ctx context.Context, userID, dirID string) error
}

type RepositoryInterface interface {
	FindByID(ctx context.Context, db dbTX, id string) (directoryRecord, error)
	FindRootByOwner(ctx context.Context, db dbTX, ownerID string) (directoryRecord, error)
	FindSubdirectories(ctx context.Context, db dbTX, parentID string) ([]directoryRecord, error)
	FindSubdirectoriesAfterCursor(ctx context.Context, db dbTX, parentID string, cursorName, cursorID string, limit int) ([]directoryRecord, bool, string, error)
	FindFiles(ctx context.Context, db dbTX, directoryID string) ([]fileRecord, error)
	FindFilesAfterCursor(ctx context.Context, db dbTX, directoryID string, cursorFilename, cursorID string, limit int) ([]fileRecord, bool, string, error)
	FindByNameAndParent(ctx context.Context, db dbTX, name, parentID, ownerID string) (directoryRecord, error)
	Create(ctx context.Context, db dbTX, name, ownerID, parentID string) (directoryRecord, error)
	UpdateNameAndParent(ctx context.Context, db dbTX, id string, name *string, parentID *string) (directoryRecord, error)

	FindByIDAnyState(ctx context.Context, db dbTX, id string) (directoryRecord, error)
	FindSubtreeIDs(ctx context.Context, db dbTX, rootID string) ([]string, error)
	FindFilesInDirs(ctx context.Context, db dbTX, dirIDs []string) ([]fileRecord, error)
	FindDeletedFilesInDirs(ctx context.Context, db dbTX, dirIDs []string) ([]fileRecord, error)
	SoftDeleteSubtree(ctx context.Context, db dbTX, dirIDs []string, deletedAt time.Time) error
	SoftDeleteFilesInDirs(ctx context.Context, db dbTX, dirIDs []string, deletedAt time.Time) error
	RestoreSubtree(ctx context.Context, db dbTX, dirIDs []string) error
	RestoreFilesInDirs(ctx context.Context, db dbTX, dirIDs []string, deletedAt time.Time) error
	HardDeleteSubtree(ctx context.Context, db dbTX, dirIDs []string) error
	AddUserStorageUsed(ctx context.Context, db dbTX, userID string, delta int64) error
	GetSharedDirsStats(ctx context.Context, db dbTX, userID string) (count, quota int, err error)
	IncrementSharedDirsCount(ctx context.Context, db dbTX, userID string) error
	RecalcSharedDirsCount(ctx context.Context, db dbTX, userID string) error
	IncrementFilesCount(ctx context.Context, db dbTX, directoryID string, delta int) error
	CheckShareLinks(ctx context.Context, db dbTX, fileIDs, dirIDs []string) (fileLinks map[string]bool, dirLinks map[string]bool, err error)
}

type SharingRepository interface {
	CreateShared(ctx context.Context, tx interface {
		Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
		QueryRow(context.Context, string, ...any) pgx.Row
	}, directoryID, ownerID string) error
}

type dbTX interface {
	QueryRow(context.Context, string, ...any) pgx.Row
	Query(context.Context, string, ...any) (pgx.Rows, error)
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

type beginTxFunc func(context.Context, pgx.TxOptions) (transaction, error)

type transaction interface {
	dbTX
	Commit(context.Context) error
	Rollback(context.Context) error
}

type txWrapper struct{ pgx.Tx }

type StorageClient interface {
	Delete(ctx context.Context, objectKey string) error
}
