package files

import (
	"context"
	"io"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type StorageClient interface {
	Upload(ctx context.Context, objectKey string, r io.Reader, size int64, contentType string) error
	Delete(ctx context.Context, objectKey string) error
}

type ServiceInterface interface {
	Upload(ctx context.Context, userID, directoryID string, uploads []FileUpload) (UploadFilesResponse, error)
}

type RepositoryInterface interface {
	FindDirectoryByID(context.Context, dbTX, string) (directoryRecord, error)
	Save(context.Context, dbTX, fileRecord) (fileRecord, error)
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
