package files

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sharedspace/internal/access"
	"sharedspace/internal/apperror"
)

const maxFileSize = 100 * 1024 * 1024 // 100 MB

type Service struct {
	beginTx       beginTxFunc
	db            dbTX
	repo          RepositoryInterface
	storage       StorageClient
	tmpStorage    StorageClient
	accessChecker access.AccessChecker
}

func NewService(pool *pgxpool.Pool, repo RepositoryInterface, storage, tmpStorage StorageClient, accessChecker access.AccessChecker) *Service {
	beginTx := func(ctx context.Context, opts pgx.TxOptions) (transaction, error) {
		tx, err := pool.BeginTx(ctx, opts)
		if err != nil {
			return nil, err
		}
		return txWrapper{Tx: tx}, nil
	}
	return &Service{beginTx: beginTx, db: pool, repo: repo, storage: storage, tmpStorage: tmpStorage, accessChecker: accessChecker}
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

	// проверяем доступ к директории
	ok, err := s.accessChecker.Can(ctx, userID, directoryID, access.ActionUpload)
	if err != nil {
		return UploadFilesResponse{}, err
	}
	if !ok {
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
	ok, err := s.accessChecker.Can(ctx, userID, file.DirectoryID, access.ActionView)
	if err != nil {
		return FileMetadataResponse{}, err
	}
	if !ok {
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
	ok, err := s.accessChecker.Can(ctx, userID, file.DirectoryID, access.ActionDownload)
	if err != nil {
		return FileContentResponse{}, err
	}
	if !ok {
		return FileContentResponse{}, apperror.Forbidden("доступ запрещён")
	}

	url, err := s.storage.PresignedGetURL(ctx, file.ObjectKey, 24*time.Hour)
	if err != nil {
		return FileContentResponse{}, apperror.WrapInternal("генерация ссылки", err)
	}

	return FileContentResponse{URL: url}, nil
}

func (s *Service) GetRecent(ctx context.Context, userID string, limit int) (RecentFilesResponse, error) {
	records, err := s.repo.FindRecentByUserID(ctx, s.db, userID, limit)
	if err != nil {
		return RecentFilesResponse{}, apperror.WrapInternal("получение списка недавних файлов", err)
	}

	files := make([]FileMetadataResponse, 0, len(records))
	for _, rec := range records {
		files = append(files, toMetadataResponse(rec))
	}
	return RecentFilesResponse{Files: files}, nil
}

func (s *Service) Update(ctx context.Context, userID, fileID string, req UpdateFileRequest) (FileMetadataResponse, error) {
	if req.Filename != nil {
		trimmed := strings.TrimSpace(*req.Filename)
		req.Filename = &trimmed
		if *req.Filename == "" {
			return FileMetadataResponse{}, apperror.Validation("имя файла не может быть пустым")
		}
	}

	if req.Filename == nil && req.ParentID == nil {
		return FileMetadataResponse{}, apperror.Validation("требуется хотя бы одно поле (filename или parent_id)")
	}

	file, err := s.repo.FindByID(ctx, s.db, fileID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return FileMetadataResponse{}, apperror.NotFound("файл не найден")
		}
		return FileMetadataResponse{}, apperror.WrapInternal("поиск файла", err)
	}

	ok, err := s.accessChecker.Can(ctx, userID, file.DirectoryID, access.ActionDelete)
	if err != nil {
		return FileMetadataResponse{}, err
	}
	if !ok {
		return FileMetadataResponse{}, apperror.Forbidden("доступ запрещён")
	}

	targetParent := file.DirectoryID
	if req.ParentID != nil {
		targetParent = *req.ParentID
	}
	targetFilename := file.Filename
	if req.Filename != nil {
		targetFilename = *req.Filename
	}

	if req.ParentID != nil {
		_, err := s.repo.FindDirectoryByID(ctx, s.db, *req.ParentID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return FileMetadataResponse{}, apperror.NotFound("целевая директория не найдена")
			}
			return FileMetadataResponse{}, apperror.WrapInternal("поиск целевой директории", err)
		}
		ok, err = s.accessChecker.Can(ctx, userID, *req.ParentID, access.ActionUpload)
		if err != nil {
			return FileMetadataResponse{}, err
		}
		if !ok {
			return FileMetadataResponse{}, apperror.Forbidden("доступ к целевой директории запрещён")
		}
	}

	if _, err := s.repo.FindByFilenameAndDirectory(ctx, s.db, targetFilename, targetParent); err == nil {
		return FileMetadataResponse{}, apperror.Conflict("файл с таким именем уже существует в целевой директории")
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return FileMetadataResponse{}, apperror.WrapInternal("проверка дубликата имени", err)
	}

	tx, err := s.beginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return FileMetadataResponse{}, apperror.WrapInternal("начало транзакции", err)
	}
	defer tx.Rollback(ctx)

	updated, err := s.repo.MoveFile(ctx, tx, fileID, targetParent, req.Filename)
	if err != nil {
		return FileMetadataResponse{}, apperror.WrapInternal("перемещение файла", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return FileMetadataResponse{}, apperror.WrapInternal("сохранение перемещения файла", err)
	}

	return toMetadataResponse(updated), nil
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

func (s *Service) SoftDelete(ctx context.Context, userID, fileID string) error {
	file, err := s.repo.FindByIDAnyState(ctx, s.db, fileID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperror.NotFound("файл не найден")
		}
		return apperror.WrapInternal("поиск файла", err)
	}
	ok, err := s.accessChecker.Can(ctx, userID, file.DirectoryID, access.ActionDelete)
	if err != nil {
		return err
	}
	if !ok {
		return apperror.Forbidden("доступ запрещён")
	}
	if file.DeletedAt != nil {
		return apperror.Validation("файл уже в корзине")
	}
	if err := s.repo.SoftDeleteFile(ctx, s.db, fileID, time.Now().UTC()); err != nil {
		return apperror.WrapInternal("удаление файла в корзину", err)
	}
	return nil
}

func (s *Service) Restore(ctx context.Context, userID, fileID string) error {
	file, err := s.repo.FindByIDAnyState(ctx, s.db, fileID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperror.NotFound("файл не найден")
		}
		return apperror.WrapInternal("поиск файла", err)
	}
	ok, err := s.accessChecker.Can(ctx, userID, file.DirectoryID, access.ActionDelete)
	if err != nil {
		return err
	}
	if !ok {
		return apperror.Forbidden("доступ запрещён")
	}
	if file.DeletedAt == nil {
		return apperror.Validation("файл не находится в корзине")
	}

	dir, err := s.repo.FindDirectoryByIDAnyState(ctx, s.db, file.DirectoryID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperror.Conflict("родительская директория не найдена")
		}
		return apperror.WrapInternal("поиск родительской директории", err)
	}
	if dir.DeletedAt != nil {
		return apperror.Conflict("сначала восстановите родительскую директорию")
	}

	if err := s.repo.RestoreFile(ctx, s.db, fileID); err != nil {
		return apperror.WrapInternal("восстановление файла", err)
	}
	return nil
}

func (s *Service) PermanentDelete(ctx context.Context, userID, fileID string) error {
	file, err := s.repo.FindByIDAnyState(ctx, s.db, fileID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperror.NotFound("файл не найден")
		}
		return apperror.WrapInternal("поиск файла", err)
	}
	ok, err := s.accessChecker.Can(ctx, userID, file.DirectoryID, access.ActionDelete)
	if err != nil {
		return err
	}
	if !ok {
		return apperror.Forbidden("доступ запрещён")
	}

	tx, err := s.beginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return apperror.WrapInternal("начало транзакции", err)
	}
	defer tx.Rollback(ctx)

	if err := s.repo.HardDeleteFile(ctx, tx, fileID); err != nil {
		return apperror.WrapInternal("удаление метаданных файла", err)
	}
	if err := s.repo.AddUserStorageUsed(ctx, tx, file.OwnerID, -file.Size); err != nil {
		return apperror.WrapInternal("обновление объёма", err)
	}
	if err := s.storage.Delete(ctx, file.ObjectKey); err != nil {
		return apperror.WrapInternal("удаление объекта из хранилища", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return apperror.WrapInternal("сохранение удаления", err)
	}
	return nil
}

func (s *Service) produceConversion(ctx context.Context, userID, fileID, target string) (fileRecord, []byte, string, string, string, error) {
	target = strings.ToLower(strings.TrimSpace(target))
	if target == "jpeg" {
		target = "jpg"
	}

	file, err := s.repo.FindByID(ctx, s.db, fileID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return fileRecord{}, nil, "", "", "", apperror.NotFound("файл не найден")
		}
		return fileRecord{}, nil, "", "", "", apperror.WrapInternal("поиск файла", err)
	}
	ok, err := s.accessChecker.Can(ctx, userID, file.DirectoryID, access.ActionDownload)
	if err != nil {
		return fileRecord{}, nil, "", "", "", err
	}
	if !ok {
		return fileRecord{}, nil, "", "", "", apperror.Forbidden("доступ запрещён")
	}

	rc, err := s.storage.Get(ctx, file.ObjectKey)
	if err != nil {
		return fileRecord{}, nil, "", "", "", apperror.WrapInternal("чтение объекта из хранилища", err)
	}
	defer rc.Close()
	data, err := io.ReadAll(rc)
	if err != nil {
		return fileRecord{}, nil, "", "", "", apperror.WrapInternal("чтение содержимого", err)
	}

	out, sourceFormat, mimeType, ext, err := convertImageData(data, target)
	if err != nil {
		if errors.Is(err, errUnsupportedConversion) {
			return fileRecord{}, nil, "", "", "", apperror.Validation("неподдерживаемая пара форматов")
		}
		return fileRecord{}, nil, "", "", "", apperror.WrapInternal("конвертация изображения", err)
	}
	return file, out, sourceFormat, mimeType, ext, nil
}

func (s *Service) ConvertAndDownload(ctx context.Context, userID, fileID, target string) (string, string, error) {
	file, out, _, mimeType, ext, err := s.produceConversion(ctx, userID, fileID, target)
	if err != nil {
		return "", "", err
	}
	filename := replaceExt(file.Filename, ext)
	key := "conv/" + uuid.NewString() + "." + ext
	if err := s.tmpStorage.Upload(ctx, key, bytes.NewReader(out), int64(len(out)), mimeType); err != nil {
		return "", "", apperror.WrapInternal("загрузка во временное хранилище", err)
	}
	url, err := s.tmpStorage.PresignedDownloadURL(ctx, key, 15*time.Minute, filename)
	if err != nil {
		return "", "", apperror.WrapInternal("генерация ссылки", err)
	}
	return url, filename, nil
}

func (s *Service) ConvertAndSave(ctx context.Context, userID, fileID, target string) (ConversionResponse, error) {
	file, out, sourceFormat, mimeType, ext, err := s.produceConversion(ctx, userID, fileID, target)
	if err != nil {
		return ConversionResponse{}, err
	}

	ok, err := s.accessChecker.Can(ctx, userID, file.DirectoryID, access.ActionUpload)
	if err != nil {
		return ConversionResponse{}, err
	}
	if !ok {
		return ConversionResponse{}, apperror.Forbidden("доступ запрещён")
	}

	size := int64(len(out))
	objectKey := uuid.NewString()
	if err := s.storage.Upload(ctx, objectKey, bytes.NewReader(out), size, mimeType); err != nil {
		return ConversionResponse{}, apperror.WrapInternal("загрузка в хранилище", err)
	}

	tx, err := s.beginTx(ctx, pgx.TxOptions{})
	if err != nil {
		s.cleanupObjects([]string{objectKey})
		return ConversionResponse{}, apperror.WrapInternal("начало транзакции", err)
	}
	defer tx.Rollback(ctx)

	used, quota, err := s.repo.GetUserStorage(ctx, tx, userID)
	if err != nil {
		s.cleanupObjects([]string{objectKey})
		return ConversionResponse{}, apperror.WrapInternal("получение данных о хранилище", err)
	}
	if used+size > quota {
		s.cleanupObjects([]string{objectKey})
		return ConversionResponse{}, apperror.Validation("превышен лимит хранилища")
	}

	newFile, err := s.repo.Save(ctx, tx, fileRecord{
		DirectoryID: file.DirectoryID,
		OwnerID:     userID,
		Filename:    replaceExt(file.Filename, ext),
		Extension:   ext,
		MimeType:    mimeType,
		Size:        size,
		ObjectKey:   objectKey,
	})
	if err != nil {
		s.cleanupObjects([]string{objectKey})
		return ConversionResponse{}, apperror.WrapInternal("сохранение файла", err)
	}
	if err := s.repo.AddUserStorageUsed(ctx, tx, userID, size); err != nil {
		s.cleanupObjects([]string{objectKey})
		return ConversionResponse{}, apperror.WrapInternal("обновление объёма", err)
	}

	conv, err := s.repo.SaveConversion(ctx, tx, file.ID, newFile.ID, sourceFormat, target, userID)
	if err != nil {
		s.cleanupObjects([]string{objectKey})
		return ConversionResponse{}, apperror.WrapInternal("сохранение записи конверсии", err)
	}

	if err := tx.Commit(ctx); err != nil {
		s.cleanupObjects([]string{objectKey})
		return ConversionResponse{}, apperror.WrapInternal("сохранение конверсии", err)
	}
	return toConversionResponse(conv), nil
}

func (s *Service) ListConversions(ctx context.Context, userID, fileID string) (ConversionsListResponse, error) {
	file, err := s.repo.FindByIDAnyState(ctx, s.db, fileID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ConversionsListResponse{}, apperror.NotFound("файл не найден")
		}
		return ConversionsListResponse{}, apperror.WrapInternal("поиск файла", err)
	}
	ok, err := s.accessChecker.Can(ctx, userID, file.DirectoryID, access.ActionView)
	if err != nil {
		return ConversionsListResponse{}, err
	}
	if !ok {
		return ConversionsListResponse{}, apperror.Forbidden("доступ запрещён")
	}

	records, err := s.repo.FindConversionsByFile(ctx, s.db, fileID)
	if err != nil {
		return ConversionsListResponse{}, apperror.WrapInternal("получение истории конверсий", err)
	}
	list := make([]ConversionResponse, 0, len(records))
	for _, r := range records {
		list = append(list, toConversionResponse(r))
	}
	return ConversionsListResponse{Conversions: list}, nil
}

func toConversionResponse(c conversionRecord) ConversionResponse {
	return ConversionResponse{
		ID:           c.ID,
		SourceFileID: c.SourceFileID,
		ResultFileID: c.ResultFileID,
		SourceFormat: c.SourceFormat,
		TargetFormat: c.TargetFormat,
		CreatedBy:    c.CreatedBy,
		CreatedAt:    c.CreatedAt,
	}
}
