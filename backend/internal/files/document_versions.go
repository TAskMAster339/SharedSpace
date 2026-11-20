package files

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"sharedspace/internal/access"
	"sharedspace/internal/apperror"
	"sharedspace/internal/database"
)

const (
	docxMIME     = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	versionLimit = 10
)

type DocumentVersion struct {
	Number       int64     `json:"number"`
	Size         int64     `json:"size"`
	CreatedAt    time.Time `json:"created_at"`
	Contributors []string  `json:"contributors"`
}

type DocumentHistory struct {
	Versions    []DocumentVersion `json:"versions"`
	CanEdit     bool              `json:"can_edit"`
	CanRestore  bool              `json:"can_restore"`
	SavePending bool              `json:"save_pending"`
}

type documentVersionRecord struct {
	DocumentVersion
	Key string
}

func isDOCX(file fileRecord) bool {
	return strings.EqualFold(ExtractExtension(file.Filename), "docx")
}

func (s *DocumentService) requireFile(ctx context.Context, db dbTX, id, user string, action access.Action) (fileRecord, error) {
	if _, err := uuid.Parse(id); err != nil {
		return fileRecord{}, apperror.Validation("некорректный ID файла")
	}
	file, err := s.files.FindByID(ctx, db, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return file, apperror.NotFound("файл не найден")
	}
	if err != nil {
		return file, err
	}
	if err := documentAccess(ctx, db, user, file.DirectoryID, action); err != nil {
		return file, err
	}
	if !isDOCX(file) {
		return file, apperror.New("действие доступно для DOCX", "unsupported_document", http.StatusUnsupportedMediaType)
	}
	return file, nil
}

func documentAccess(ctx context.Context, db dbTX, user, directory string, action access.Action) error {
	allowed, err := access.NewChecker(db, access.NewRepository()).Can(ctx, user, directory, action)
	if err == nil && !allowed {
		return apperror.Forbidden("доступ запрещён")
	}
	return err
}

func documentAllowed(ctx context.Context, db dbTX, user, directory string, action access.Action) (bool, error) {
	err := documentAccess(ctx, db, user, directory, action)
	if appErr, ok := apperror.From(err); ok && (appErr.Status() == http.StatusForbidden || appErr.Status() == http.StatusNotFound) {
		return false, nil
	}
	return err == nil, err
}

func (s *DocumentService) History(ctx context.Context, id, user string) (DocumentHistory, error) {
	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return DocumentHistory{}, err
	}
	defer tx.Rollback(ctx)
	file, err := s.requireFile(ctx, tx, id, user, access.ActionView)
	if err != nil {
		return DocumentHistory{}, err
	}
	result := DocumentHistory{Versions: []DocumentVersion{}}
	if s.enabled {
		result.CanEdit, err = documentAllowed(ctx, tx, user, file.DirectoryID, access.ActionEditContent)
		if err != nil {
			return result, err
		}
	}
	result.CanRestore, err = documentAllowed(ctx, tx, user, file.DirectoryID, access.ActionChangeRole)
	if err != nil {
		return result, err
	}
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM document_edit_sessions
		WHERE file_id = $1 AND (pending_key IS NOT NULL OR result_url IS NOT NULL) AND closed_at IS NULL)`, id).Scan(&result.SavePending); err != nil {
		return result, err
	}
	rows, err := tx.Query(ctx, `SELECT number, size, created_at, contributors FROM file_versions
		WHERE file_id = $1 ORDER BY number DESC`, id)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var version DocumentVersion
		if err := rows.Scan(&version.Number, &version.Size, &version.CreatedAt, &version.Contributors); err != nil {
			return result, err
		}
		result.Versions = append(result.Versions, version)
	}
	return result, rows.Err()
}

func (s *DocumentService) DownloadVersion(ctx context.Context, id, user string, number int64) (FileContentResponse, error) {
	file, err := s.requireFile(ctx, s.db, id, user, access.ActionDownload)
	if err != nil {
		return FileContentResponse{}, err
	}
	version, err := readDocumentVersion(ctx, s.db, id, number)
	if err != nil {
		return FileContentResponse{}, err
	}
	url, err := s.storage.PresignedDownloadURL(ctx, version.Key, time.Minute, file.Filename)
	return FileContentResponse{URL: url}, err
}

func readDocumentVersion(ctx context.Context, db dbTX, id string, number int64) (documentVersionRecord, error) {
	var version documentVersionRecord
	err := db.QueryRow(ctx, `SELECT object_key, size FROM file_versions WHERE file_id = $1 AND number = $2`,
		id, number).Scan(&version.Key, &version.Size)
	if errors.Is(err, pgx.ErrNoRows) {
		err = apperror.NotFound("версия не найдена")
	}
	return version, err
}

func (s *DocumentService) lockDocument(ctx context.Context, tx pgx.Tx, id string) error {
	if _, err := uuid.Parse(id); err != nil {
		return apperror.Validation("некорректный ID файла")
	}
	if err := database.LockDirectoryContents(ctx, tx); err != nil {
		return err
	}
	var locked string
	err := tx.QueryRow(ctx, `SELECT id FROM files WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, id).Scan(&locked)
	if errors.Is(err, pgx.ErrNoRows) {
		return apperror.NotFound("файл не найден")
	}
	return err
}

func (s *DocumentService) RestoreVersion(ctx context.Context, id, user, username string, number int64) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := s.lockDocument(ctx, tx, id); err != nil {
		return err
	}
	file, err := s.requireFile(ctx, tx, id, user, access.ActionChangeRole)
	if err != nil {
		return err
	}
	if _, err := activeDocumentSession(ctx, tx, id); err == nil {
		return apperror.Conflict("дождитесь завершения редактирования и сохранения документа")
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	version, err := readDocumentVersion(ctx, tx, id, number)
	if err != nil {
		return err
	}
	if err := s.publishVersion(ctx, tx, file, version.Key, version.Size, []string{username}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *DocumentService) publishVersion(ctx context.Context, tx pgx.Tx, file fileRecord, key string, size int64, names []string) error {
	used, quota, err := s.files.GetUserStorage(ctx, tx, file.OwnerID)
	if err != nil {
		return err
	}
	delta := size - file.Size
	if delta > 0 && delta > quota-used {
		return apperror.New("недостаточно места для сохранения документа", "document_quota_exceeded", http.StatusConflict)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO file_versions (file_id, number, object_key, size, created_at)
		SELECT $1, 1, $2, $3, $4 WHERE NOT EXISTS (SELECT 1 FROM file_versions WHERE file_id = $1)`,
		file.ID, file.ObjectKey, file.Size, file.UpdatedAt); err != nil {
		return err
	}
	var number int64
	if err := tx.QueryRow(ctx, `SELECT max(number) + 1 FROM file_versions WHERE file_id = $1`, file.ID).Scan(&number); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO file_versions (file_id, number, object_key, size, contributors)
		VALUES ($1, $2, $3, $4, $5)`, file.ID, number, key, size, names); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE files SET object_key = $2, size = $3, mime_type = $4, updated_at = now() WHERE id = $1`,
		file.ID, key, size, docxMIME); err != nil {
		return err
	}
	if err := s.files.AddUserStorageUsed(ctx, tx, file.OwnerID, delta); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM file_versions WHERE file_id = $1 AND number <= $2`, file.ID, number-versionLimit); err != nil {
		return fmt.Errorf("trim document history: %w", err)
	}
	return nil
}
