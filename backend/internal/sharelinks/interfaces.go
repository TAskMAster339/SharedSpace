package sharelinks

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"sharedspace/internal/auth"
)

type ServiceInterface interface {
	Create(ctx context.Context, userID, fileID string, req CreateShareLinkRequest) (ShareLinkResponse, error)
	ListByFile(ctx context.Context, userID, fileID string, limit int) ([]ShareLinkResponse, error)
	Update(ctx context.Context, userID, linkID string, req UpdateShareLinkRequest) (ShareLinkResponse, error)
	Delete(ctx context.Context, userID, linkID string) error
	Resolve(ctx context.Context, token, password string, authenticated bool) (FileContentResponse, error)
}

type RepositoryInterface interface {
	Create(ctx context.Context, db dbTX, link shareLinkRecord) (shareLinkRecord, error)
	FindByID(ctx context.Context, db dbTX, id string) (shareLinkRecord, error)
	FindByToken(ctx context.Context, db dbTX, token string) (shareLinkRecord, error)
	FindByFileID(ctx context.Context, db dbTX, fileID string, limit int) ([]shareLinkRecord, error)
	Update(ctx context.Context, db dbTX, id string, link shareLinkRecord) (shareLinkRecord, error)
	Delete(ctx context.Context, db dbTX, id string) error
	GetFileByID(ctx context.Context, db dbTX, fileID string) (fileRecord, error)
	GetUsernameByID(ctx context.Context, db dbTX, userID string) (string, error)
}

type StorageClient interface {
	PresignedGetURL(ctx context.Context, objectKey string, expiry time.Duration) (string, error)
}

type TokenParser interface {
	ParseAccessToken(raw string) (*auth.Claims, error)
}

type dbTX interface {
	QueryRow(context.Context, string, ...any) pgx.Row
	Query(context.Context, string, ...any) (pgx.Rows, error)
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

type transaction interface {
	dbTX
	Commit(context.Context) error
	Rollback(context.Context) error
}

type beginTxFunc func(context.Context, pgx.TxOptions) (transaction, error)

type txWrapper struct{ pgx.Tx }
