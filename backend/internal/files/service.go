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
		return UploadFilesResponse{}, apperror.Validation("требуется хотя бы один файл")
	}

	// проверка размеров и подсчёт суммарного объёма загрузки
	var totalSize int64
	for _, u := range uploads {
		if u.Size > maxFileSize {
			return UploadFilesResponse{}, apperror.Validation(
				fmt.Sprintf("файл %q превышает максимальный размер 100 МБ", u.Filename))
		}
		totalSize += u.Size
	}

	dir, err := s.repo.FindDirectoryByID(ctx, s.db, directoryID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return UploadFilesResponse{}, apperror.NotFound("директория не найдена")
		}
		return UploadFilesResponse{}, apperror.WrapInternal("поиск директории", err)
	}
	if dir.OwnerID != userID {
		return UploadFilesResponse{}, apperror.Forbidden("доступ запрещён")
	}

	// грузим объекты в MinIO; ключи копим для отката
	uploadedKeys := make([]string, 0, len(uploads))
	records := make([]fileRecord, 0, len(uploads))
	for _, u := range uploads {
		objectKey := uuid.NewString()
		if err := s.storage.Upload(ctx, objectKey, u.Content, u.Size, u.MimeType); err != nil {
			s.cleanupObjects(uploadedKeys)
			return UploadFilesResponse{}, apperror.WrapInternal("загрузка в хранилище", err)
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
		return UploadFilesResponse{}, apperror.WrapInternal("начало транзакции", err)
	}
	defer tx.Rollback(ctx) // после Commit — no-op

	used, quota, err := s.repo.GetUserStorage(ctx, tx, userID)
	if err != nil {
		s.cleanupObjects(uploadedKeys)
		return UploadFilesResponse{}, apperror.WrapInternal("получение данных о хранилище", err)
	}
	if used+totalSize > quota {
		s.cleanupObjects(uploadedKeys)
		return UploadFilesResponse{}, apperror.Validation("превышен лимит хранилища")
	}

	results := make([]UploadResponse, 0, len(records))
	for _, rec := range records {
		saved, err := s.repo.Save(ctx, tx, rec)
		if err != nil {
			s.cleanupObjects(uploadedKeys)
			return UploadFilesResponse{}, apperror.WrapInternal("сохранение метаданных файла", err)
		}
		results = append(results, toUploadResponse(saved))
	}

	if err := s.repo.AddUserStorageUsed(ctx, tx, userID, totalSize); err != nil {
		s.cleanupObjects(uploadedKeys)
		return UploadFilesResponse{}, apperror.WrapInternal("обновление использованного объёма", err)
	}

	if err := tx.Commit(ctx); err != nil {
		s.cleanupObjects(uploadedKeys)
		return UploadFilesResponse{}, apperror.WrapInternal("сохранение загрузки файлов", err)
	}

	return UploadFilesResponse{Files: results}, nil
}

func (s *Service) GetMetadata(ctx context.Context, userID, fileID string) (FileMetadataResponse, error) {
	file, err := s.repo.FindByID(ctx, s.db, fileID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return FileMetadataResponse{}, apperror.NotFound("файл не найден")
		}
		return FileMetadataResponse{}, apperror.WrapInternal("поиск файла", err)
	}
	if file.OwnerID != userID {
		return FileMetadataResponse{}, apperror.Forbidden("доступ запрещён")
	}
	return toMetadataResponse(file), nil
}

func (s *Service) GetContentURL(ctx context.Context, userID, fileID string) (FileContentResponse, error) {
	file, err := s.repo.FindByID(ctx, s.db, fileID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return FileContentResponse{}, apperror.NotFound("файл не найден")
		}
		return FileContentResponse{}, apperror.WrapInternal("поиск файла", err)
	}
	if file.OwnerID != userID {
		return FileContentResponse{}, apperror.Forbidden("доступ запрещён")
	}

	url, err := s.storage.PresignedGetURL(ctx, file.ObjectKey, 24*time.Hour)
	if err != nil {
		return FileContentResponse{}, apperror.WrapInternal("генерация ссылки", err)
	}

	return FileContentResponse{URL: url}, nil
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

func toMetadataResponse(f fileRecord) FileMetadataResponse {
	return FileMetadataResponse{
		ID:          f.ID,
		Filename:    f.Filename,
		Extension:   f.Extension,
		MimeType:    f.MimeType,
		Size:        f.Size,
		DirectoryID: f.DirectoryID,
		OwnerID:     f.OwnerID,
		CreatedAt:   f.CreatedAt,
		UpdatedAt:   f.UpdatedAt,
	}
}
