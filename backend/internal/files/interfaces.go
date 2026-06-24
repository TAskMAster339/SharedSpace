package files

import (
	"context"
	"io"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type StorageClient interface {
	Upload(ctx context.Context, objectKey string, r io.Reader, size int64, contentType string) error
	PresignedGetURL(ctx context.Context, objectKey string, expiry time.Duration) (string, error)
	Delete(ctx context.Context, objectKey string) error
}

type ServiceInterface interface {
	Upload(ctx context.Context, userID, directoryID string, uploads []FileUpload) (UploadFilesResponse, error)
	GetMetadata(ctx context.Context, userID, fileID string) (FileMetadataResponse, error)
	GetContentURL(ctx context.Context, userID, fileID string) (FileContentResponse, error)
	GetRecent(ctx context.Context, userID string, limit int) (RecentFilesResponse, error)
}

type RepositoryInterface interface {
	FindDirectoryByID(context.Context, dbTX, string) (directoryRecord, error)
	FindByID(context.Context, dbTX, string) (fileRecord, error)
	Save(context.Context, dbTX, fileRecord) (fileRecord, error)
	GetUserStorage(ctx context.Context, db dbTX, userID string) (used, quota int64, err error)
	AddUserStorageUsed(ctx context.Context, db dbTX, userID string, delta int64) error
	FindRecentByUserID(ctx context.Context, db dbTX, userID string, limit int) ([]fileRecord, error)
}

type FileUpload struct {
	Filename  string
	Extension string
	MimeType  string
	Size      int64
	Content   io.Reader
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

type directoryRecord struct {
	ID      string
	OwnerID string
}
