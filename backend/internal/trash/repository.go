package trash

import (
	"context"
	"fmt"
)

type Repository struct{}

func NewRepository() *Repository {
	return &Repository{}
}

func (r *Repository) FindRootDeletedDirectories(ctx context.Context, db dbTX, userID string) ([]deletedDirectoryRecord, error) {
	rows, err := db.Query(ctx, `
		WITH deleted_dirs AS (
			SELECT id, name, owner_id, parent_id, type, deleted_at, created_at, updated_at
			FROM directories
			WHERE owner_id = $1 AND deleted_at IS NOT NULL
		)
		SELECT d.id, d.name, d.owner_id, d.parent_id, d.type, d.deleted_at, d.created_at, d.updated_at
		FROM deleted_dirs d
		LEFT JOIN deleted_dirs parent ON d.parent_id = parent.id
		WHERE parent.id IS NULL OR parent.deleted_at IS NULL
		ORDER BY d.deleted_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var dirs []deletedDirectoryRecord
	for rows.Next() {
		var d deletedDirectoryRecord
		if err := rows.Scan(&d.ID, &d.Name, &d.OwnerID, &d.ParentID, &d.Type, &d.DeletedAt, &d.CreatedAt, &d.UpdatedAt); err != nil {
			return nil, err
		}
		dirs = append(dirs, d)
	}
	return dirs, rows.Err()
}

func (r *Repository) FindDeletedFiles(ctx context.Context, db dbTX, userID string) ([]deletedFileRecord, error) {
	rows, err := db.Query(ctx, `
		SELECT id, filename, extension, mime_type, size, directory_id, object_key, owner_id, deleted_at, created_at, updated_at
		FROM files
		WHERE owner_id = $1 AND deleted_at IS NOT NULL
		ORDER BY deleted_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var files []deletedFileRecord
	for rows.Next() {
		var f deletedFileRecord
		if err := rows.Scan(&f.ID, &f.Filename, &f.Extension, &f.MimeType, &f.Size, &f.DirectoryID, &f.ObjectKey, &f.OwnerID, &f.DeletedAt, &f.CreatedAt, &f.UpdatedAt); err != nil {
			return nil, err
		}
		files = append(files, f)
	}
	return files, rows.Err()
}

func (r *Repository) FindDeletedDirectoriesPaginated(ctx context.Context, db dbTX, userID string, limit int, cursorName string, cursorID string) ([]deletedDirectoryRecord, bool, string, error) {
	query := `
		SELECT id, name, owner_id, parent_id, type, deleted_at, created_at, updated_at
		FROM directories
		WHERE owner_id = $1 AND deleted_at IS NOT NULL`
	args := []any{userID}

	if cursorName != "" && cursorID != "" {
		query += ` AND (name, id) > ($2, $3)`
		args = append(args, cursorName, cursorID)
	}

	query += ` ORDER BY name ASC, id ASC`
	paramIdx := len(args) + 1
	query += fmt.Sprintf(` LIMIT $%d`, paramIdx)
	args = append(args, limit+1)

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, false, "", err
	}
	defer rows.Close()

	var dirs []deletedDirectoryRecord
	for rows.Next() {
		var d deletedDirectoryRecord
		if err := rows.Scan(&d.ID, &d.Name, &d.OwnerID, &d.ParentID, &d.Type, &d.DeletedAt, &d.CreatedAt, &d.UpdatedAt); err != nil {
			return nil, false, "", err
		}
		dirs = append(dirs, d)
	}
	if err := rows.Err(); err != nil {
		return nil, false, "", err
	}

	hasMore := len(dirs) > limit
	if hasMore {
		dirs = dirs[:limit]
	}

	nextCursor := ""
	if hasMore && len(dirs) > 0 {
		last := dirs[len(dirs)-1]
		nextCursor = fmt.Sprintf("%s|%s", last.Name, last.ID)
	}

	return dirs, hasMore, nextCursor, nil
}

func (r *Repository) FindDeletedFilesPaginated(ctx context.Context, db dbTX, userID string, limit int, cursorFilename string, cursorID string) ([]deletedFileRecord, bool, string, error) {
	query := `
		SELECT id, filename, extension, mime_type, size, directory_id, object_key, owner_id, deleted_at, created_at, updated_at
		FROM files
		WHERE owner_id = $1 AND deleted_at IS NOT NULL`
	args := []any{userID}

	if cursorFilename != "" && cursorID != "" {
		query += ` AND (filename, id) > ($2, $3)`
		args = append(args, cursorFilename, cursorID)
	}

	query += ` ORDER BY filename ASC, id ASC`
	paramIdx := len(args) + 1
	query += fmt.Sprintf(` LIMIT $%d`, paramIdx)
	args = append(args, limit+1)

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, false, "", err
	}
	defer rows.Close()

	var files []deletedFileRecord
	for rows.Next() {
		var f deletedFileRecord
		if err := rows.Scan(&f.ID, &f.Filename, &f.Extension, &f.MimeType, &f.Size, &f.DirectoryID, &f.ObjectKey, &f.OwnerID, &f.DeletedAt, &f.CreatedAt, &f.UpdatedAt); err != nil {
			return nil, false, "", err
		}
		files = append(files, f)
	}
	if err := rows.Err(); err != nil {
		return nil, false, "", err
	}

	hasMore := len(files) > limit
	if hasMore {
		files = files[:limit]
	}

	nextCursor := ""
	if hasMore && len(files) > 0 {
		last := files[len(files)-1]
		nextCursor = fmt.Sprintf("%s|%s", last.Filename, last.ID)
	}

	return files, hasMore, nextCursor, nil
}

func (r *Repository) FindDeletedSubtreeIDs(ctx context.Context, db dbTX, dirIDs []string) ([]string, error) {
	if len(dirIDs) == 0 {
		return nil, nil
	}
	rows, err := db.Query(ctx, `
		WITH RECURSIVE subtree AS (
			SELECT id FROM directories WHERE id = ANY($1) AND deleted_at IS NOT NULL
			UNION ALL
			SELECT d.id FROM directories d 
			JOIN subtree s ON d.parent_id = s.id
			WHERE d.deleted_at IS NOT NULL
		)
		SELECT id FROM subtree
	`, dirIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (r *Repository) FindFilesInDeletedDirs(ctx context.Context, db dbTX, dirIDs []string) ([]fileForDeleteRecord, error) {
	if len(dirIDs) == 0 {
		return nil, nil
	}
	rows, err := db.Query(ctx, `
		SELECT id, object_key, size, owner_id
		FROM files
		WHERE directory_id = ANY($1) AND deleted_at IS NOT NULL
	`, dirIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var files []fileForDeleteRecord
	for rows.Next() {
		var f fileForDeleteRecord
		if err := rows.Scan(&f.ID, &f.ObjectKey, &f.Size, &f.OwnerID); err != nil {
			return nil, err
		}
		files = append(files, f)
	}
	return files, rows.Err()
}

func (r *Repository) FindDeletedFilesByIDs(ctx context.Context, db dbTX, fileIDs []string) ([]fileForDeleteRecord, error) {
	if len(fileIDs) == 0 {
		return nil, nil
	}
	rows, err := db.Query(ctx, `
		SELECT id, object_key, size, owner_id
		FROM files
		WHERE id = ANY($1) AND deleted_at IS NOT NULL
	`, fileIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var files []fileForDeleteRecord
	for rows.Next() {
		var f fileForDeleteRecord
		if err := rows.Scan(&f.ID, &f.ObjectKey, &f.Size, &f.OwnerID); err != nil {
			return nil, err
		}
		files = append(files, f)
	}
	return files, rows.Err()
}

func (r *Repository) FindDeletedDirectoryByID(ctx context.Context, db dbTX, id string) (deletedDirectoryRecord, error) {
	var d deletedDirectoryRecord
	err := db.QueryRow(ctx, `
		SELECT id, name, owner_id, parent_id, type, deleted_at, created_at, updated_at
		FROM directories
		WHERE id = $1 AND deleted_at IS NOT NULL
	`, id).Scan(&d.ID, &d.Name, &d.OwnerID, &d.ParentID, &d.Type, &d.DeletedAt, &d.CreatedAt, &d.UpdatedAt)
	return d, err
}

func (r *Repository) FindDeletedFileByID(ctx context.Context, db dbTX, id string) (deletedFileRecord, error) {
	var f deletedFileRecord
	err := db.QueryRow(ctx, `
		SELECT id, filename, extension, mime_type, size, directory_id, object_key, owner_id, deleted_at, created_at, updated_at
		FROM files
		WHERE id = $1 AND deleted_at IS NOT NULL
	`, id).Scan(&f.ID, &f.Filename, &f.Extension, &f.MimeType, &f.Size, &f.DirectoryID, &f.ObjectKey, &f.OwnerID, &f.DeletedAt, &f.CreatedAt, &f.UpdatedAt)
	return f, err
}

func (r *Repository) ClearFiles(ctx context.Context, db dbTX, fileIDs []string) error {
	if len(fileIDs) == 0 {
		return nil
	}
	_, err := db.Exec(ctx, `DELETE FROM files WHERE id = ANY($1)`, fileIDs)
	return err
}

func (r *Repository) ClearDirectories(ctx context.Context, db dbTX, dirIDs []string) error {
	if len(dirIDs) == 0 {
		return nil
	}
	_, err := db.Exec(ctx, `DELETE FROM directories WHERE id = ANY($1)`, dirIDs)
	return err
}

func (r *Repository) AddUserStorageUsed(ctx context.Context, db dbTX, userID string, delta int64) error {
	_, err := db.Exec(ctx, `UPDATE users SET storage_used = storage_used + $1, updated_at = now() WHERE id = $2`, delta, userID)
	return err
}