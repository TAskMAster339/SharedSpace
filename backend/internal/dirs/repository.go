package dirs

import (
	"context"
	"fmt"
	"time"
)

type Repository struct{}

func NewRepository() *Repository {
	return &Repository{}
}

func (r *Repository) FindByID(ctx context.Context, db dbTX, id string) (directoryRecord, error) {
	var d directoryRecord
	err := db.QueryRow(ctx, `
		SELECT id, name, owner_id, parent_id, type, files_count, created_at, updated_at
		FROM directories
		WHERE id = $1 AND deleted_at IS NULL
	`, id).Scan(&d.ID, &d.Name, &d.OwnerID, &d.ParentID, &d.Type, &d.FilesCount, &d.CreatedAt, &d.UpdatedAt)
	return d, err
}

func (r *Repository) FindRootByOwner(ctx context.Context, db dbTX, ownerID string) (directoryRecord, error) {
	var d directoryRecord
	err := db.QueryRow(ctx, `
		SELECT id, name, owner_id, parent_id, type, files_count, created_at, updated_at
		FROM directories
		WHERE owner_id = $1 AND type = 'root' AND deleted_at IS NULL
		LIMIT 1
	`, ownerID).Scan(&d.ID, &d.Name, &d.OwnerID, &d.ParentID, &d.Type, &d.FilesCount, &d.CreatedAt, &d.UpdatedAt)
	return d, err
}

func (r *Repository) FindSubdirectories(ctx context.Context, db dbTX, parentID string) ([]directoryRecord, error) {
	rows, err := db.Query(ctx, `
		SELECT id, name, owner_id, parent_id, type, files_count, created_at, updated_at
		FROM directories
		WHERE parent_id = $1 AND deleted_at IS NULL
		ORDER BY name ASC, id ASC
	`, parentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var dirs []directoryRecord
	for rows.Next() {
		var d directoryRecord
		if err := rows.Scan(&d.ID, &d.Name, &d.OwnerID, &d.ParentID, &d.Type, &d.FilesCount, &d.CreatedAt, &d.UpdatedAt); err != nil {
			return nil, err
		}
		dirs = append(dirs, d)
	}
	return dirs, rows.Err()
}

func (r *Repository) FindSubdirectoriesAfterCursor(ctx context.Context, db dbTX, parentID string, cursorName string, cursorID string, limit int) ([]directoryRecord, bool, string, error) {
	query := `
		SELECT id, name, owner_id, parent_id, type, files_count, created_at, updated_at
		FROM directories
		WHERE parent_id = $1 AND deleted_at IS NULL`
	args := []any{parentID}

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

	var dirs []directoryRecord
	for rows.Next() {
		var d directoryRecord
		if err := rows.Scan(&d.ID, &d.Name, &d.OwnerID, &d.ParentID, &d.Type, &d.FilesCount, &d.CreatedAt, &d.UpdatedAt); err != nil {
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

func (r *Repository) FindFiles(ctx context.Context, db dbTX, directoryID string) ([]fileRecord, error) {
	rows, err := db.Query(ctx, `
		SELECT id, filename, extension, mime_type, size, created_at, updated_at
		FROM files
		WHERE directory_id = $1 AND deleted_at IS NULL
		ORDER BY filename ASC, id ASC
	`, directoryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var files []fileRecord
	for rows.Next() {
		var f fileRecord
		if err := rows.Scan(&f.ID, &f.Filename, &f.Extension, &f.MimeType, &f.Size, &f.CreatedAt, &f.UpdatedAt); err != nil {
			return nil, err
		}
		files = append(files, f)
	}
	return files, rows.Err()
}

func (r *Repository) FindFilesAfterCursor(ctx context.Context, db dbTX, directoryID string, cursorFilename string, cursorID string, limit int) ([]fileRecord, bool, string, error) {
	query := `
		SELECT id, filename, extension, mime_type, size, created_at, updated_at
		FROM files
		WHERE directory_id = $1 AND deleted_at IS NULL`
	args := []any{directoryID}

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

	var files []fileRecord
	for rows.Next() {
		var f fileRecord
		if err := rows.Scan(&f.ID, &f.Filename, &f.Extension, &f.MimeType, &f.Size, &f.CreatedAt, &f.UpdatedAt); err != nil {
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

func (r *Repository) FindByNameAndParent(ctx context.Context, db dbTX, name, parentID, ownerID string) (directoryRecord, error) {
	var d directoryRecord
	err := db.QueryRow(ctx, `
		SELECT id, name, owner_id, parent_id, type, files_count, created_at, updated_at
		FROM directories
		WHERE name = $1 AND parent_id = $2 AND owner_id = $3 AND deleted_at IS NULL
		LIMIT 1
	`, name, parentID, ownerID).Scan(&d.ID, &d.Name, &d.OwnerID, &d.ParentID, &d.Type, &d.FilesCount, &d.CreatedAt, &d.UpdatedAt)
	return d, err
}

func (r *Repository) Create(ctx context.Context, db dbTX, name, ownerID, parentID string) (directoryRecord, error) {
	var d directoryRecord
	err := db.QueryRow(ctx, `
		INSERT INTO directories (name, owner_id, parent_id, type)
		VALUES ($1, $2, $3, 'regular')
		RETURNING id, name, owner_id, parent_id, type, files_count, created_at, updated_at
	`, name, ownerID, parentID).Scan(&d.ID, &d.Name, &d.OwnerID, &d.ParentID, &d.Type, &d.FilesCount, &d.CreatedAt, &d.UpdatedAt)
	return d, err
}

func (r *Repository) UpdateNameAndParent(ctx context.Context, db dbTX, id string, name *string, parentID *string) (directoryRecord, error) {
	var d directoryRecord
	err := db.QueryRow(ctx, `
		UPDATE directories
		SET
			name = CASE WHEN $2::text IS NULL THEN name ELSE $2 END,
			parent_id = CASE WHEN $3::uuid IS NULL THEN parent_id ELSE $3 END,
			updated_at = now()
		WHERE id = $1 AND deleted_at IS NULL
		RETURNING id, name, owner_id, parent_id, type, files_count, created_at, updated_at
	`, id, name, parentID).Scan(&d.ID, &d.Name, &d.OwnerID, &d.ParentID, &d.Type, &d.FilesCount, &d.CreatedAt, &d.UpdatedAt)
	return d, err
}

func (r *Repository) FindByIDAnyState(ctx context.Context, db dbTX, id string) (directoryRecord, error) {
	var d directoryRecord
	err := db.QueryRow(ctx, `
		SELECT id, name, owner_id, parent_id, type, files_count, deleted_at, created_at, updated_at
		FROM directories WHERE id = $1
	`, id).Scan(&d.ID, &d.Name, &d.OwnerID, &d.ParentID, &d.Type, &d.FilesCount, &d.DeletedAt, &d.CreatedAt, &d.UpdatedAt)
	return d, err
}

func (r *Repository) FindSubtreeIDs(ctx context.Context, db dbTX, rootID string) ([]string, error) {
	rows, err := db.Query(ctx, `
		WITH RECURSIVE subtree AS (
			SELECT id FROM directories WHERE id = $1
			UNION ALL
			SELECT d.id FROM directories d JOIN subtree s ON d.parent_id = s.id
		)
		SELECT id FROM subtree
	`, rootID)
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

func (r *Repository) FindFilesInDirs(ctx context.Context, db dbTX, dirIDs []string) ([]fileRecord, error) {
	return r.findFilesInDirs(ctx, db, dirIDs, true)
}
func (r *Repository) FindDeletedFilesInDirs(ctx context.Context, db dbTX, dirIDs []string) ([]fileRecord, error) {
	return r.findFilesInDirs(ctx, db, dirIDs, false)
}
func (r *Repository) findFilesInDirs(ctx context.Context, db dbTX, dirIDs []string, alive bool) ([]fileRecord, error) {
	if len(dirIDs) == 0 {
		return nil, nil
	}
	cond := "deleted_at IS NULL"
	if !alive {
		cond = "deleted_at IS NOT NULL"
	}
	rows, err := db.Query(ctx, `
		SELECT id, filename, extension, mime_type, size, object_key, owner_id
		FROM files WHERE directory_id = ANY($1) AND `+cond, dirIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var files []fileRecord
	for rows.Next() {
		var f fileRecord
		if err := rows.Scan(&f.ID, &f.Filename, &f.Extension, &f.MimeType, &f.Size, &f.ObjectKey, &f.OwnerID); err != nil {
			return nil, err
		}
		files = append(files, f)
	}
	return files, rows.Err()
}

func (r *Repository) SoftDeleteSubtree(ctx context.Context, db dbTX, dirIDs []string, deletedAt time.Time) error {
	_, err := db.Exec(ctx, `UPDATE directories SET deleted_at=$2, updated_at=now() WHERE id = ANY($1) AND deleted_at IS NULL`, dirIDs, deletedAt)
	return err
}
func (r *Repository) SoftDeleteFilesInDirs(ctx context.Context, db dbTX, dirIDs []string, deletedAt time.Time) error {
	if len(dirIDs) == 0 {
		return nil
	}
	_, err := db.Exec(ctx, `UPDATE files SET deleted_at=$2, updated_at=now() WHERE directory_id = ANY($1)`, dirIDs, deletedAt)
	return err
}
func (r *Repository) RestoreSubtree(ctx context.Context, db dbTX, dirIDs []string) error {
	_, err := db.Exec(ctx, `UPDATE directories SET deleted_at=NULL, updated_at=now() WHERE id = ANY($1)`, dirIDs)
	return err
}
func (r *Repository) RestoreFilesInDirs(ctx context.Context, db dbTX, dirIDs []string, deletedAt time.Time) error {
	if len(dirIDs) == 0 {
		return nil
	}
	_, err := db.Exec(ctx, `UPDATE files SET deleted_at=NULL, updated_at=now() WHERE directory_id = ANY($1) AND deleted_at = $2`, dirIDs, deletedAt)
	return err
}
func (r *Repository) HardDeleteSubtree(ctx context.Context, db dbTX, dirIDs []string) error {
	_, err := db.Exec(ctx, `DELETE FROM directories WHERE id = ANY($1)`, dirIDs)
	return err
}
func (r *Repository) AddUserStorageUsed(ctx context.Context, db dbTX, userID string, delta int64) error {
	_, err := db.Exec(ctx, `UPDATE users SET storage_used = storage_used + $1, updated_at = now() WHERE id = $2`, delta, userID)
	return err
}

func (r *Repository) GetSharedDirsStats(ctx context.Context, db dbTX, userID string) (count, quota int, err error) {
	err = db.QueryRow(ctx, `
		SELECT shared_dirs_count, shared_dirs_quota FROM users WHERE id = $1 FOR UPDATE
	`, userID).Scan(&count, &quota)
	return
}

func (r *Repository) IncrementSharedDirsCount(ctx context.Context, db dbTX, userID string) error {
	_, err := db.Exec(ctx, `
		UPDATE users SET shared_dirs_count = shared_dirs_count + 1, updated_at = now() WHERE id = $1
	`, userID)
	return err
}

func (r *Repository) RecalcSharedDirsCount(ctx context.Context, db dbTX, userID string) error {
	_, err := db.Exec(ctx, `
		UPDATE users SET shared_dirs_count = (
			SELECT COUNT(*) FROM shared_directories sd
			JOIN directories d ON d.id = sd.directory_id
			WHERE sd.owner_id = $1 AND d.deleted_at IS NULL
		), updated_at = now() WHERE id = $1
	`, userID)
	return err
}

func (r *Repository) CheckShareLinks(ctx context.Context, db dbTX, fileIDs, dirIDs []string) (fileLinks map[string]bool, dirLinks map[string]bool, err error) {
	fileLinks = make(map[string]bool)
	dirLinks = make(map[string]bool)

	if len(fileIDs) == 0 && len(dirIDs) == 0 {
		return
	}

	query := `SELECT file_id, directory_id FROM share_links WHERE`
	args := make([]any, 0, 2)

	if len(fileIDs) > 0 && len(dirIDs) > 0 {
		query += ` (file_id = ANY($1) OR directory_id = ANY($2))`
		args = append(args, fileIDs, dirIDs)
	} else if len(fileIDs) > 0 {
		query += ` file_id = ANY($1)`
		args = append(args, fileIDs)
	} else {
		query += ` directory_id = ANY($1)`
		args = append(args, dirIDs)
	}

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var fileID, dirID *string
		if err := rows.Scan(&fileID, &dirID); err != nil {
			return nil, nil, err
		}
		if fileID != nil {
			fileLinks[*fileID] = true
		}
		if dirID != nil {
			dirLinks[*dirID] = true
		}
	}
	return fileLinks, dirLinks, rows.Err()
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
