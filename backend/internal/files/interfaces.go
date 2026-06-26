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
	PresignedDownloadURL(ctx context.Context, objectKey string, expiry time.Duration, filename string) (string, error)
	Get(ctx context.Context, objectKey string) (io.ReadCloser, error)
	Delete(ctx context.Context, objectKey string) error
	ListObjects(ctx context.Context, prefix string, olderThan time.Time) ([]string, error)
}

type ServiceInterface interface {
	Upload(ctx context.Context, userID, directoryID string, uploads []FileUpload) (UploadFilesResponse, error)
	GetMetadata(ctx context.Context, userID, fileID string) (FileMetadataResponse, error)
	GetContentURL(ctx context.Context, userID, fileID string) (FileContentResponse, error)
	SoftDelete(ctx context.Context, userID, fileID string) error
	Restore(ctx context.Context, userID, fileID string) error
	PermanentDelete(ctx context.Context, userID, fileID string) error
	GetRecent(ctx context.Context, userID string, limit int) (RecentFilesResponse, error)
	Update(ctx context.Context, userID, fileID string, req UpdateFileRequest) (FileMetadataResponse, error)
	ConvertAndSave(ctx context.Context, userID, fileID, target string) (ConversionResponse, error)
	ConvertAndDownload(ctx context.Context, userID, fileID, target string) (downloadURL, filename string, err error)
	ListConversions(ctx context.Context, userID, fileID string) (ConversionsListResponse, error)
}

type RepositoryInterface interface {
	FindDirectoryByID(context.Context, dbTX, string) (directoryRecord, error)
	FindDirectoryByIDAnyState(context.Context, dbTX, string) (directoryRecord, error)
	FindByID(context.Context, dbTX, string) (fileRecord, error)
	Save(context.Context, dbTX, fileRecord) (fileRecord, error)
	GetUserStorage(ctx context.Context, db dbTX, userID string) (used, quota int64, err error)
	AddUserStorageUsed(ctx context.Context, db dbTX, userID string, delta int64) error
	FindByIDAnyState(ctx context.Context, db dbTX, fileID string) (fileRecord, error)
	SoftDeleteFile(ctx context.Context, db dbTX, fileID string, deletedAt time.Time) error
	RestoreFile(ctx context.Context, db dbTX, fileID string) error
	HardDeleteFile(ctx context.Context, db dbTX, fileID string) error
	FindRecentByUserID(ctx context.Context, db dbTX, userID string, limit int) ([]fileRecord, error)
	MoveFile(ctx context.Context, db dbTX, fileID, newParentID string, newFilename *string) (fileRecord, error)
	FindByFilenameAndDirectory(ctx context.Context, db dbTX, filename, directoryID string) (fileRecord, error)
	SaveConversion(ctx context.Context, db dbTX, sourceFileID, resultFileID, sourceFormat, targetFormat, createdBy string) (conversionRecord, error)
	FindConversionsByFile(ctx context.Context, db dbTX, fileID string) ([]conversionRecord, error)
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
	ID        string
	OwnerID   string
	DeletedAt *time.Time
}
