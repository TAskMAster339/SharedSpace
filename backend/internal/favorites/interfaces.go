package favorites

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type ServiceInterface interface {
	Add(ctx context.Context, userID, fileID string) error
	Remove(ctx context.Context, userID, fileID string) error
	List(ctx context.Context, userID string, limit int, cursor string) (FavoritesListResponse, error)
}

type RepositoryInterface interface {
	Insert(ctx context.Context, db dbTX, userID, fileID string) error
	Delete(ctx context.Context, db dbTX, userID, fileID string) error
	FindAllByUserID(ctx context.Context, db dbTX, userID string, limit int) ([]favoriteFileRecord, error)
	FindAllByUserIDAfterCursor(ctx context.Context, db dbTX, userID string, cursorTime time.Time, cursorID string, limit int) ([]favoriteFileRecord, error)
	FindFileByID(ctx context.Context, db dbTX, fileID string) (directoryID string, err error)
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
