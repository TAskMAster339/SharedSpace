package mylinks

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type ServiceInterface interface {
	List(ctx context.Context, userID string, limit int, cursor string) (LinksListResponse, error)
}

type RepositoryInterface interface {
	FindAllByUserID(ctx context.Context, db dbTX, userID string, limit int) ([]linkItemRecord, error)
	FindAllByUserIDAfterCursor(ctx context.Context, db dbTX, userID string, cursorTime time.Time, cursorID string, limit int) ([]linkItemRecord, error)
}

type dbTX interface {
	QueryRow(context.Context, string, ...any) pgx.Row
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

type beginTxFunc func(context.Context, pgx.TxOptions) (transaction, error)

type transaction interface {
	dbTX
	Commit(context.Context) error
	Rollback(context.Context) error
}

type txWrapper struct{ pgx.Tx }
