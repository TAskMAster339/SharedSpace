package sharing

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type ServiceInterface interface {
	GetSharedWithMe(context.Context, string) ([]SharedDirectoryResponse, error)
	GetMembers(context.Context, string, string) ([]MemberResponse, error)
}

type RepositoryInterface interface {
	CreateShared(ctx context.Context, tx interface {
		Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
		QueryRow(context.Context, string, ...any) pgx.Row
	}, directoryID, ownerID string) error
	FindByMember(ctx context.Context, db dbTX, userID string) ([]sharedDirectoryRecord, error)
	FindMembers(ctx context.Context, db dbTX, sharedDirID string) ([]memberRecord, error)
	FindByID(ctx context.Context, db dbTX, id string) (sharedDirectoryRecord, error)
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
