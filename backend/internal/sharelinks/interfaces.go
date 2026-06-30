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
	CreateForDirectory(ctx context.Context, userID, dirID string, req CreateShareLinkRequest) (ShareLinkResponse, error)
	ListByFile(ctx context.Context, userID, fileID string, limit int) ([]ShareLinkResponse, error)
	ListByDirectory(ctx context.Context, userID, dirID string, limit int) ([]ShareLinkResponse, error)
	Update(ctx context.Context, userID, linkID string, req UpdateShareLinkRequest) (ShareLinkResponse, error)
	Delete(ctx context.Context, userID, linkID string) error
	Resolve(ctx context.Context, token, password string, authenticated bool) (FileContentResponse, error)
	ResolveDirectory(ctx context.Context, token, password string, authenticated bool, subDirID string) (DirectoryContentResponse, error)
}

type RepositoryInterface interface {
	Create(ctx context.Context, db dbTX, link shareLinkRecord) (shareLinkRecord, error)
	FindByID(ctx context.Context, db dbTX, id string) (shareLinkRecord, error)
	FindByToken(ctx context.Context, db dbTX, token string) (shareLinkRecord, error)
	FindByFileID(ctx context.Context, db dbTX, fileID string, limit int) ([]shareLinkRecord, error)
	FindByDirectoryID(ctx context.Context, db dbTX, dirID string, limit int) ([]shareLinkRecord, error)
	Update(ctx context.Context, db dbTX, id string, link shareLinkRecord) (shareLinkRecord, error)
	Delete(ctx context.Context, db dbTX, id string) error
	GetShareLinksStats(ctx context.Context, db dbTX, userID string) (count, quota int, err error)
	IncrementShareLinksCount(ctx context.Context, db dbTX, userID string) error
	DecrementShareLinksCount(ctx context.Context, db dbTX, userID string) error
	GetFileByID(ctx context.Context, db dbTX, fileID string) (fileRecord, error)
	GetUsernameByID(ctx context.Context, db dbTX, userID string) (string, error)
	GetDirectoryByID(ctx context.Context, db dbTX, dirID string) (directoryRecord, error)
	GetDirectorySubdirs(ctx context.Context, db dbTX, dirID string) ([]dirSubdirRecord, error)
	GetDirectoryFiles(ctx context.Context, db dbTX, dirID string) ([]dirFileRecord, error)
	IsSubdirectory(ctx context.Context, db dbTX, parentID, childID string) (bool, error)
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
