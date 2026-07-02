package files

import (
	"context"
	"time"
)

type Repository struct{}

func NewRepository() *Repository {
	return &Repository{}
}

func (r *Repository) FindDirectoryByID(ctx context.Context, db dbTX, id string) (directoryRecord, error) {
	var d directoryRecord
	err := db.QueryRow(ctx, `
		SELECT id, owner_id, deleted_at FROM directories
		WHERE id = $1 AND deleted_at IS NULL
	`, id).Scan(&d.ID, &d.OwnerID, &d.DeletedAt)
	return d, err
}

func (r *Repository) FindDirectoryByIDAnyState(ctx context.Context, db dbTX, id string) (directoryRecord, error) {
	var d directoryRecord
	err := db.QueryRow(ctx, `
		SELECT id, owner_id, deleted_at FROM directories
		WHERE id = $1
	`, id).Scan(&d.ID, &d.OwnerID, &d.DeletedAt)
	return d, err
}

func (r *Repository) FindByID(ctx context.Context, db dbTX, id string) (fileRecord, error) {
	var f fileRecord
	err := db.QueryRow(ctx, `
		SELECT id, directory_id, owner_id, filename, extension, mime_type, size, object_key, created_at, updated_at
		FROM files
		WHERE id = $1 AND deleted_at IS NULL
	`, id).Scan(
		&f.ID, &f.DirectoryID, &f.OwnerID,
		&f.Filename, &f.Extension, &f.MimeType,
		&f.Size, &f.ObjectKey, &f.CreatedAt, &f.UpdatedAt,
	)
	return f, err
}

func (r *Repository) Save(ctx context.Context, db dbTX, f fileRecord) (fileRecord, error) {
	var saved fileRecord
	err := db.QueryRow(ctx, `
		INSERT INTO files (directory_id, owner_id, filename, extension, mime_type, size, object_key)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, directory_id, owner_id, filename, extension, mime_type, size, object_key, created_at, updated_at
	`, f.DirectoryID, f.OwnerID, f.Filename, f.Extension, f.MimeType, f.Size, f.ObjectKey).Scan(
		&saved.ID, &saved.DirectoryID, &saved.OwnerID,
		&saved.Filename, &saved.Extension, &saved.MimeType,
		&saved.Size, &saved.ObjectKey, &saved.CreatedAt, &saved.UpdatedAt,
	)
	return saved, err
}

func (r *Repository) GetUserStorage(ctx context.Context, db dbTX, userID string) (int64, int64, error) {
	var used, quota int64
	err := db.QueryRow(ctx, `
		SELECT storage_used, storage_quota FROM users
		WHERE id = $1
		FOR UPDATE
	`, userID).Scan(&used, &quota)
	return used, quota, err
}

func (r *Repository) FindRecentByUserID(ctx context.Context, db dbTX, userID string, limit int) ([]fileRecord, error) {
	query := `
		SELECT id, directory_id, owner_id, filename, extension, mime_type, size, object_key, created_at, updated_at
		FROM files
		WHERE owner_id = $1 AND deleted_at IS NULL
		ORDER BY updated_at DESC, id DESC`
	args := []any{userID}

	if limit > 0 {
		query += ` LIMIT $2`
		args = append(args, limit)
	}

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []fileRecord
	for rows.Next() {
		var f fileRecord
		if err := rows.Scan(
			&f.ID, &f.DirectoryID, &f.OwnerID,
			&f.Filename, &f.Extension, &f.MimeType,
			&f.Size, &f.ObjectKey, &f.CreatedAt, &f.UpdatedAt,
		); err != nil {
			return nil, err
		}
		records = append(records, f)
	}
	return records, rows.Err()
}

func (r *Repository) FindRecentByUserIDAfterCursor(ctx context.Context, db dbTX, userID string, cursorTime time.Time, cursorID string, limit int) ([]fileRecord, error) {
	rows, err := db.Query(ctx, `
		SELECT id, directory_id, owner_id, filename, extension, mime_type, size, object_key, created_at, updated_at
		FROM files
		WHERE owner_id = $1 AND deleted_at IS NULL
		  AND (updated_at, id) < ($2, $3)
		ORDER BY updated_at DESC, id DESC
		LIMIT $4
	`, userID, cursorTime, cursorID, limit+1)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []fileRecord
	for rows.Next() {
		var f fileRecord
		if err := rows.Scan(
			&f.ID, &f.DirectoryID, &f.OwnerID,
			&f.Filename, &f.Extension, &f.MimeType,
			&f.Size, &f.ObjectKey, &f.CreatedAt, &f.UpdatedAt,
		); err != nil {
			return nil, err
		}
		records = append(records, f)
	}
	return records, rows.Err()
}

func (r *Repository) AddUserStorageUsed(ctx context.Context, db dbTX, userID string, delta int64) error {
	_, err := db.Exec(ctx, `
		UPDATE users SET storage_used = storage_used + $1, updated_at = now()
		WHERE id = $2
	`, delta, userID)
	return err
}

func (r *Repository) FindByIDAnyState(ctx context.Context, db dbTX, id string) (fileRecord, error) {
	var f fileRecord
	err := db.QueryRow(ctx, `
		SELECT id, directory_id, owner_id, filename, extension, mime_type, size, object_key, deleted_at, created_at, updated_at
		FROM files WHERE id = $1
	`, id).Scan(&f.ID, &f.DirectoryID, &f.OwnerID, &f.Filename, &f.Extension,
		&f.MimeType, &f.Size, &f.ObjectKey, &f.DeletedAt, &f.CreatedAt, &f.UpdatedAt)
	return f, err
}

func (r *Repository) SoftDeleteFile(ctx context.Context, db dbTX, id string, deletedAt time.Time) error {
	_, err := db.Exec(ctx, `UPDATE files SET deleted_at=$2, updated_at=now() WHERE id=$1 AND deleted_at IS NULL`, id, deletedAt)
	return err
}

func (r *Repository) RestoreFile(ctx context.Context, db dbTX, id string) error {
	_, err := db.Exec(ctx, `UPDATE files SET deleted_at=NULL, updated_at=now() WHERE id=$1`, id)
	return err
}

func (r *Repository) FindByFilenameAndDirectory(ctx context.Context, db dbTX, filename, directoryID string, excludeFileID ...string) (fileRecord, error) {
	var f fileRecord
	query := `
		SELECT id, directory_id, owner_id, filename, extension, mime_type, size, object_key, created_at, updated_at
		FROM files
		WHERE filename = $1 AND directory_id = $2 AND deleted_at IS NULL`
	args := []any{filename, directoryID}
	if len(excludeFileID) > 0 && excludeFileID[0] != "" {
		query += ` AND id != $3`
		args = append(args, excludeFileID[0])
	}
	err := db.QueryRow(ctx, query, args...).Scan(
		&f.ID, &f.DirectoryID, &f.OwnerID,
		&f.Filename, &f.Extension, &f.MimeType,
		&f.Size, &f.ObjectKey, &f.CreatedAt, &f.UpdatedAt,
	)
	return f, err
}

func (r *Repository) MoveFile(ctx context.Context, db dbTX, fileID, newParentID string, newFilename *string) (fileRecord, error) {
	var f fileRecord
	err := db.QueryRow(ctx, `
		UPDATE files SET
			filename = COALESCE($2, filename),
			directory_id = $3,
			updated_at = now()
		WHERE id = $1 AND deleted_at IS NULL
		RETURNING id, directory_id, owner_id, filename, extension, mime_type, size, object_key, created_at, updated_at
	`, fileID, newFilename, newParentID).Scan(
		&f.ID, &f.DirectoryID, &f.OwnerID,
		&f.Filename, &f.Extension, &f.MimeType,
		&f.Size, &f.ObjectKey, &f.CreatedAt, &f.UpdatedAt,
	)
	return f, err
}

func (r *Repository) HardDeleteFile(ctx context.Context, db dbTX, id string) error {
	_, err := db.Exec(ctx, `DELETE FROM files WHERE id=$1`, id)
	return err
}

func (r *Repository) SaveConversion(ctx context.Context, db dbTX, sourceFileID, resultFileID, sourceFormat, targetFormat, createdBy string) (conversionRecord, error) {
	var c conversionRecord
	err := db.QueryRow(ctx, `
		INSERT INTO file_conversions (source_file_id, result_file_id, source_format, target_format, created_by)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, source_file_id, result_file_id, source_format, target_format, created_by, created_at
	`, sourceFileID, resultFileID, sourceFormat, targetFormat, createdBy).Scan(
		&c.ID, &c.SourceFileID, &c.ResultFileID, &c.SourceFormat, &c.TargetFormat, &c.CreatedBy, &c.CreatedAt)
	return c, err
}

func (r *Repository) FindConversionsByFile(ctx context.Context, db dbTX, fileID string) ([]conversionRecord, error) {
	rows, err := db.Query(ctx, `
		SELECT id, source_file_id, result_file_id, source_format, target_format, created_by, created_at
		FROM file_conversions
		WHERE source_file_id = $1
		ORDER BY created_at DESC
	`, fileID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []conversionRecord
	for rows.Next() {
		var c conversionRecord
		if err := rows.Scan(&c.ID, &c.SourceFileID, &c.ResultFileID, &c.SourceFormat, &c.TargetFormat, &c.CreatedBy, &c.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *Repository) IncrementFilesCount(ctx context.Context, db dbTX, directoryID string, delta int) error {
	_, err := db.Exec(ctx, `
		WITH RECURSIVE ancestors AS (
			SELECT id, parent_id FROM directories WHERE id = $1
			UNION ALL
			SELECT d.id, d.parent_id
			FROM directories d
			JOIN ancestors a ON d.id = a.parent_id
		)
		UPDATE directories
		SET files_count = files_count + $2,
		    updated_at  = now()
		WHERE id IN (SELECT id FROM ancestors)
	`, directoryID, delta)
	return err
}

func (r *Repository) HasShareLinks(ctx context.Context, db dbTX, fileIDs []string) (map[string]bool, error) {
	if len(fileIDs) == 0 {
		return make(map[string]bool), nil
	}

	rows, err := db.Query(ctx, `SELECT DISTINCT file_id FROM share_links WHERE file_id = ANY($1)`, fileIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]bool, len(fileIDs))
	for rows.Next() {
		var fileID string
		if err := rows.Scan(&fileID); err != nil {
			return nil, err
		}
		result[fileID] = true
	}

	return result, rows.Err()
}
