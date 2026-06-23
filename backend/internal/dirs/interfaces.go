package dirs

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type ServiceInterface interface {
	GetRootContents(context.Context, string) (DirectoryContentsResponse, error)
	GetContents(context.Context, string, string) (DirectoryContentsResponse, error)
	GetByID(context.Context, string, string) (DirectoryResponse, error)
	Create(context.Context, string, CreateDirectoryRequest) (DirectoryResponse, error)
	Update(context.Context, string, string, UpdateDirectoryRequest) (DirectoryResponse, error)
}

type RepositoryInterface interface {
	FindByID(context.Context, dbTX, string) (directoryRecord, error)
	FindRootByOwner(context.Context, dbTX, string) (directoryRecord, error)
	FindSubdirectories(context.Context, dbTX, string) ([]directoryRecord, error)
	FindFiles(context.Context, dbTX, string) ([]fileRecord, error)
	FindByNameAndParent(context.Context, dbTX, string, string, string) (directoryRecord, error)
	Create(context.Context, dbTX, string, string, string) (directoryRecord, error)
	UpdateNameAndParent(context.Context, dbTX, string, *string, *string) (directoryRecord, error)
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
