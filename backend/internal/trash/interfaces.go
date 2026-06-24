package trash

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type ServiceInterface interface {
	GetTrashList(ctx context.Context, userID string) (TrashListResponse, error)
	ClearTrash(ctx context.Context, userID string, itemIDs []string) error
}

type RepositoryInterface interface {
	FindRootDeletedDirectories(ctx context.Context, db dbTX, userID string) ([]deletedDirectoryRecord, error)
	FindDeletedFiles(ctx context.Context, db dbTX, userID string) ([]deletedFileRecord, error)
	FindDeletedSubtreeIDs(ctx context.Context, db dbTX, dirIDs []string) ([]string, error)
	FindFilesInDeletedDirs(ctx context.Context, db dbTX, dirIDs []string) ([]fileForDeleteRecord, error)
	FindDeletedFilesByIDs(ctx context.Context, db dbTX, fileIDs []string) ([]fileForDeleteRecord, error)
	FindDeletedDirectoryByID(ctx context.Context, db dbTX, id string) (deletedDirectoryRecord, error)
	FindDeletedFileByID(ctx context.Context, db dbTX, id string) (deletedFileRecord, error)
	ClearFiles(ctx context.Context, db dbTX, fileIDs []string) error
	ClearDirectories(ctx context.Context, db dbTX, dirIDs []string) error
	AddUserStorageUsed(ctx context.Context, db dbTX, userID string, delta int64) error
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
