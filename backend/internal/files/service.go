package files

import (
	"context"
	"errors"
	"fmt"
	"log"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
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
	return &Service{beginTx: beginTx, db: pool, repo: repo, storage: storage}
}

func (s *Service) Upload(ctx context.Context, userID, directoryID string, uploads []FileUpload) (UploadFilesResponse, error) {
	if len(uploads) == 0 {
		return UploadFilesResponse{}, apperror.Validation("at least one file is required")
	}

	for _, u := range uploads {
		if u.Size > maxFileSize {
			return UploadFilesResponse{}, apperror.Validation(
				fmt.Sprintf("file %q exceeds maximum size of 100MB", u.Filename))
		}
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

	uploadedKeys := make([]string, 0, len(uploads))
	records := make([]fileRecord, 0, len(uploads))
	for _, u := range uploads {
		objectKey := uuid.NewString()
		if err := s.storage.Upload(ctx, objectKey, u.Content, u.Size, u.MimeType); err != nil {
			s.cleanupObjects(uploadedKeys)
			return UploadFilesResponse{}, apperror.WrapInternal("upload to storage", err)
		}
		uploadedKeys = append(uploadedKeys, objectKey)
		records = append(records, fileRecord{
			DirectoryID: directoryID,
			OwnerID:     userID,
			Filename:    u.Filename,
			Extension:   u.Extension,
			MimeType:    u.MimeType,
			Size:        u.Size,
			ObjectKey:   objectKey,
		})
	}

	tx, err := s.beginTx(ctx, pgx.TxOptions{})
	if err != nil {
		s.cleanupObjects(uploadedKeys)
		return UploadFilesResponse{}, apperror.WrapInternal("begin transaction", err)
	}
	defer tx.Rollback(ctx) // после Commit — no-op

	results := make([]UploadResponse, 0, len(records))
	for _, rec := range records {
		saved, err := s.repo.Save(ctx, tx, rec)
		if err != nil {
			s.cleanupObjects(uploadedKeys)
			return UploadFilesResponse{}, apperror.WrapInternal("save file metadata", err)
		}
		results = append(results, toUploadResponse(saved))
	}

	if err := tx.Commit(ctx); err != nil {
		s.cleanupObjects(uploadedKeys)
		return UploadFilesResponse{}, apperror.WrapInternal("commit file upload", err)
	}

	return UploadFilesResponse{Files: results}, nil
}

func (s *Service) cleanupObjects(keys []string) {
	if len(keys) == 0 {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	for _, k := range keys {
		if err := s.storage.Delete(ctx, k); err != nil {
			log.Printf("cleanup orphan object %s: %v", k, err)
		}
	}
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

func ExtractExtension(filename string) string {
	ext := filepath.Ext(filename)
	return strings.ToLower(strings.TrimPrefix(ext, "."))
}
