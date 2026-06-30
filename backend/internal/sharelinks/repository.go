package sharelinks

import (
	"context"
)

type Repository struct{}

func NewRepository() *Repository {
	return &Repository{}
}

func (r *Repository) Create(ctx context.Context, db dbTX, link shareLinkRecord) (shareLinkRecord, error) {
	var l shareLinkRecord
	err := db.QueryRow(ctx, `
		INSERT INTO share_links (file_id, directory_id, token, access_type, created_by, expires_at, password_hash)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, file_id, directory_id, token, access_type, created_by, expires_at, password_hash, created_at
	`, link.FileID, link.DirectoryID, link.Token, link.AccessType, link.CreatedBy, link.ExpiresAt, link.PasswordHash).Scan(
		&l.ID, &l.FileID, &l.DirectoryID, &l.Token, &l.AccessType, &l.CreatedBy, &l.ExpiresAt, &l.PasswordHash, &l.CreatedAt,
	)
	return l, err
}

func (r *Repository) FindByID(ctx context.Context, db dbTX, id string) (shareLinkRecord, error) {
	var l shareLinkRecord
	err := db.QueryRow(ctx, `
		SELECT id, file_id, directory_id, token, access_type, created_by, expires_at, password_hash, created_at
		FROM share_links WHERE id = $1
	`, id).Scan(&l.ID, &l.FileID, &l.DirectoryID, &l.Token, &l.AccessType, &l.CreatedBy, &l.ExpiresAt, &l.PasswordHash, &l.CreatedAt)
	return l, err
}

func (r *Repository) FindByToken(ctx context.Context, db dbTX, token string) (shareLinkRecord, error) {
	var l shareLinkRecord
	err := db.QueryRow(ctx, `
		SELECT id, file_id, directory_id, token, access_type, created_by, expires_at, password_hash, created_at
		FROM share_links WHERE token = $1
	`, token).Scan(&l.ID, &l.FileID, &l.DirectoryID, &l.Token, &l.AccessType, &l.CreatedBy, &l.ExpiresAt, &l.PasswordHash, &l.CreatedAt)
	return l, err
}

func (r *Repository) FindByFileID(ctx context.Context, db dbTX, fileID string, limit int) ([]shareLinkRecord, error) {
	query := `
		SELECT id, file_id, directory_id, token, access_type, created_by, expires_at, password_hash, created_at
		FROM share_links WHERE file_id = $1
		ORDER BY created_at DESC`
	args := []any{fileID}

	if limit > 0 {
		query += ` LIMIT $2`
		args = append(args, limit)
	}

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var links []shareLinkRecord
	for rows.Next() {
		var l shareLinkRecord
		if err := rows.Scan(&l.ID, &l.FileID, &l.DirectoryID, &l.Token, &l.AccessType, &l.CreatedBy, &l.ExpiresAt, &l.PasswordHash, &l.CreatedAt); err != nil {
			return nil, err
		}
		links = append(links, l)
	}
	return links, rows.Err()
}

func (r *Repository) FindByDirectoryID(ctx context.Context, db dbTX, dirID string, limit int) ([]shareLinkRecord, error) {
	query := `
		SELECT id, file_id, directory_id, token, access_type, created_by, expires_at, password_hash, created_at
		FROM share_links WHERE directory_id = $1
		ORDER BY created_at DESC`
	args := []any{dirID}

	if limit > 0 {
		query += ` LIMIT $2`
		args = append(args, limit)
	}

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var links []shareLinkRecord
	for rows.Next() {
		var l shareLinkRecord
		if err := rows.Scan(&l.ID, &l.FileID, &l.DirectoryID, &l.Token, &l.AccessType, &l.CreatedBy, &l.ExpiresAt, &l.PasswordHash, &l.CreatedAt); err != nil {
			return nil, err
		}
		links = append(links, l)
	}
	return links, rows.Err()
}

func (r *Repository) Update(ctx context.Context, db dbTX, id string, link shareLinkRecord) (shareLinkRecord, error) {
	var l shareLinkRecord
	err := db.QueryRow(ctx, `
		UPDATE share_links SET
			access_type = COALESCE(NULLIF($2, ''), access_type),
			expires_at = $3,
			password_hash = $4
		WHERE id = $1
		RETURNING id, file_id, directory_id, token, access_type, created_by, expires_at, password_hash, created_at
	`, id, link.AccessType, link.ExpiresAt, link.PasswordHash).Scan(
		&l.ID, &l.FileID, &l.DirectoryID, &l.Token, &l.AccessType, &l.CreatedBy, &l.ExpiresAt, &l.PasswordHash, &l.CreatedAt,
	)
	return l, err
}

func (r *Repository) Delete(ctx context.Context, db dbTX, id string) error {
	_, err := db.Exec(ctx, `DELETE FROM share_links WHERE id = $1`, id)
	return err
}

func (r *Repository) GetShareLinksStats(ctx context.Context, db dbTX, userID string) (count, quota int, err error) {
	err = db.QueryRow(ctx, `
		SELECT share_links_count, share_links_quota FROM users WHERE id = $1 FOR UPDATE
	`, userID).Scan(&count, &quota)
	return
}

func (r *Repository) IncrementShareLinksCount(ctx context.Context, db dbTX, userID string) error {
	_, err := db.Exec(ctx, `
		UPDATE users SET share_links_count = share_links_count + 1, updated_at = now() WHERE id = $1
	`, userID)
	return err
}

func (r *Repository) DecrementShareLinksCount(ctx context.Context, db dbTX, userID string) error {
	_, err := db.Exec(ctx, `
		UPDATE users SET share_links_count = GREATEST(share_links_count - 1, 0), updated_at = now() WHERE id = $1
	`, userID)
	return err
}

func (r *Repository) GetFileByID(ctx context.Context, db dbTX, fileID string) (fileRecord, error) {
	var f fileRecord
	err := db.QueryRow(ctx, `
		SELECT id, directory_id, owner_id, object_key, filename, extension, mime_type, size, created_at
		FROM files WHERE id = $1 AND deleted_at IS NULL
	`, fileID).Scan(&f.ID, &f.DirectoryID, &f.OwnerID, &f.ObjectKey, &f.Filename, &f.Extension, &f.MimeType, &f.Size, &f.CreatedAt)
	return f, err
}

func (r *Repository) GetUsernameByID(ctx context.Context, db dbTX, userID string) (string, error) {
	var username string
	err := db.QueryRow(ctx, `SELECT username FROM users WHERE id = $1`, userID).Scan(&username)
	return username, err
}

func (r *Repository) GetDirectoryByID(ctx context.Context, db dbTX, dirID string) (directoryRecord, error) {
	var d directoryRecord
	err := db.QueryRow(ctx, `
		SELECT id, name, owner_id FROM directories WHERE id = $1 AND deleted_at IS NULL
	`, dirID).Scan(&d.ID, &d.Name, &d.OwnerID)
	return d, err
}

func (r *Repository) GetDirectorySubdirs(ctx context.Context, db dbTX, dirID string) ([]dirSubdirRecord, error) {
	rows, err := db.Query(ctx, `
		SELECT id, name FROM directories WHERE parent_id = $1 AND deleted_at IS NULL AND type = 'regular'
		ORDER BY name ASC
	`, dirID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var subdirs []dirSubdirRecord
	for rows.Next() {
		var sd dirSubdirRecord
		if err := rows.Scan(&sd.ID, &sd.Name); err != nil {
			return nil, err
		}
		subdirs = append(subdirs, sd)
	}
	return subdirs, rows.Err()
}

func (r *Repository) GetDirectoryFiles(ctx context.Context, db dbTX, dirID string) ([]dirFileRecord, error) {
	rows, err := db.Query(ctx, `
		SELECT id, filename, extension, mime_type, size, object_key, created_at
		FROM files WHERE directory_id = $1 AND deleted_at IS NULL
		ORDER BY filename ASC
	`, dirID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var files []dirFileRecord
	for rows.Next() {
		var f dirFileRecord
		if err := rows.Scan(&f.ID, &f.Filename, &f.Extension, &f.MimeType, &f.Size, &f.ObjectKey, &f.CreatedAt); err != nil {
			return nil, err
		}
		files = append(files, f)
	}
	return files, rows.Err()
}

func (r *Repository) IsSubdirectory(ctx context.Context, db dbTX, parentID, childID string) (bool, error) {
	var count int
	err := db.QueryRow(ctx, `
		WITH RECURSIVE dir_tree AS (
			SELECT id, parent_id FROM directories WHERE id = $2 AND deleted_at IS NULL
			UNION ALL
			SELECT d.id, d.parent_id FROM directories d
			INNER JOIN dir_tree dt ON d.id = dt.parent_id
			WHERE d.deleted_at IS NULL
		)
		SELECT COUNT(*) FROM dir_tree WHERE id = $1
	`, parentID, childID).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}
