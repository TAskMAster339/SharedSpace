package dirs

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type ServiceInterface interface {
	GetRootContents(context.Context, string) (DirectoryContentsResponse, error)
	GetContents(context.Context, string, string) (DirectoryContentsResponse, error)
	GetByID(context.Context, string, string) (DirectoryResponse, error)
	Create(context.Context, string, CreateDirectoryRequest) (DirectoryResponse, error)
	Update(context.Context, string, string, UpdateDirectoryRequest) (DirectoryResponse, error)
	SoftDelete(context.Context, string, string) error
	Restore(context.Context, string, string) error
	PermanentDelete(context.Context, string, string) error
}

type RepositoryInterface interface {
	FindByID(context.Context, dbTX, string) (directoryRecord, error)
	FindRootByOwner(context.Context, dbTX, string) (directoryRecord, error)
	FindSubdirectories(context.Context, dbTX, string) ([]directoryRecord, error)
	FindFiles(context.Context, dbTX, string) ([]fileRecord, error)
	FindByNameAndParent(context.Context, dbTX, string, string, string) (directoryRecord, error)
	Create(context.Context, dbTX, string, string, string) (directoryRecord, error)
	UpdateNameAndParent(context.Context, dbTX, string, *string, *string) (directoryRecord, error)

	FindByIDAnyState(context.Context, dbTX, string) (directoryRecord, error)
	FindSubtreeIDs(context.Context, dbTX, string) ([]string, error)
	FindFilesInDirs(context.Context, dbTX, []string) ([]fileRecord, error)
	FindDeletedFilesInDirs(context.Context, dbTX, []string) ([]fileRecord, error)
	SoftDeleteSubtree(context.Context, dbTX, []string, time.Time) error
	SoftDeleteFilesInDirs(context.Context, dbTX, []string, time.Time) error
	RestoreSubtree(context.Context, dbTX, []string) error
	RestoreFilesInDirs(context.Context, dbTX, []string, time.Time) error
	HardDeleteSubtree(context.Context, dbTX, []string) error
	AddUserStorageUsed(context.Context, dbTX, string, int64) error
	GetSharedDirsStats(ctx context.Context, db dbTX, userID string) (count, quota int, err error)
	IncrementSharedDirsCount(ctx context.Context, db dbTX, userID string) error
	DecrementSharedDirsCount(ctx context.Context, db dbTX, userID string) error
	IncrementFilesCount(ctx context.Context, db dbTX, directoryID string, delta int) error
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
