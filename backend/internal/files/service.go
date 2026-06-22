package files

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sharedspace/internal/apperror"
)

const maxFileSize = 100 * 1024 * 1024 // 100 MB

type Service struct {
	beginTx beginTxFunc
	db      dbTX
	repo    RepositoryInterface
	storage StorageClient
}

func NewService(pool *pgxpool.Pool, repo RepositoryInterface, storage StorageClient) *Service {
	beginTx := func(ctx context.Context, opts pgx.TxOptions) (transaction, error) {
		tx, err := pool.BeginTx(ctx, opts)
		if err != nil {
			return nil, err
		}
		return txWrapper{Tx: tx}, nil
	}
	return &Service{
		beginTx: beginTx,
		db:      pool,
		repo:    repo,
		storage: storage,
	}
}

func (s *Service) Upload(ctx context.Context, userID, directoryID string, uploads []FileUpload) (UploadFilesResponse, error) {
	if len(uploads) == 0 {
		return UploadFilesResponse{}, apperror.Validation("at least one file is required")
	}

	dir, err := s.repo.FindDirectoryByID(ctx, s.db, directoryID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return UploadFilesResponse{}, apperror.NotFound("directory not found")
		}
		return UploadFilesResponse{}, apperror.WrapInternal("find directory", err)
	}
	if dir.OwnerID != userID {
		return UploadFilesResponse{}, apperror.Forbidden("access denied")
	}

	results := make([]UploadResponse, 0, len(uploads))

	for _, u := range uploads {
		if u.Size > maxFileSize {
			return UploadFilesResponse{}, apperror.Validation(
				fmt.Sprintf("file %q exceeds maximum size of 100MB", u.Filename),
			)
		}

		randID, err := randomID()
		if err != nil {
			return UploadFilesResponse{}, apperror.WrapInternal("generate object key", err)
		}
		objectKey := fmt.Sprintf("%s/%s/%s_%s", userID, directoryID, randID, u.Filename)

		if err := s.storage.Upload(ctx, objectKey, u.Content, u.Size, u.MimeType); err != nil {
			return UploadFilesResponse{}, apperror.WrapInternal("upload to storage", err)
		}

		tx, err := s.beginTx(ctx, pgx.TxOptions{})
		if err != nil {
			return UploadFilesResponse{}, apperror.WrapInternal("begin transaction", err)
		}

		saved, err := s.repo.Save(ctx, tx, fileRecord{
			DirectoryID: directoryID,
			OwnerID:     userID,
			Filename:    u.Filename,
			Extension:   u.Extension,
			MimeType:    u.MimeType,
			Size:        u.Size,
			ObjectKey:   objectKey,
		})
		if err != nil {
			tx.Rollback(ctx)
			return UploadFilesResponse{}, apperror.WrapInternal("save file metadata", err)
		}

		if err := tx.Commit(ctx); err != nil {
			return UploadFilesResponse{}, apperror.WrapInternal("commit file upload", err)
		}

		results = append(results, toUploadResponse(saved))
	}

	return UploadFilesResponse{Files: results}, nil
}

func toUploadResponse(f fileRecord) UploadResponse {
	return UploadResponse{
		ID:          f.ID,
		Filename:    f.Filename,
		Extension:   f.Extension,
		MimeType:    f.MimeType,
		Size:        f.Size,
		DirectoryID: f.DirectoryID,
		OwnerID:     f.OwnerID,
		ObjectKey:   f.ObjectKey,
		CreatedAt:   f.CreatedAt,
		UpdatedAt:   f.UpdatedAt,
	}
}

func randomID() (string, error) {
	var buf [8]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf[:]), nil
}

func ExtractExtension(filename string) string {
	ext := filepath.Ext(filename)
	return strings.ToLower(strings.TrimPrefix(ext, "."))
}
