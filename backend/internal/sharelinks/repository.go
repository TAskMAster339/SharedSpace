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
		INSERT INTO share_links (file_id, token, access_type, created_by, expires_at, password_hash)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, file_id, token, access_type, created_by, expires_at, password_hash, created_at
	`, link.FileID, link.Token, link.AccessType, link.CreatedBy, link.ExpiresAt, link.PasswordHash).Scan(
		&l.ID, &l.FileID, &l.Token, &l.AccessType, &l.CreatedBy, &l.ExpiresAt, &l.PasswordHash, &l.CreatedAt,
	)
	return l, err
}

func (r *Repository) FindByID(ctx context.Context, db dbTX, id string) (shareLinkRecord, error) {
	var l shareLinkRecord
	err := db.QueryRow(ctx, `
		SELECT id, file_id, token, access_type, created_by, expires_at, password_hash, created_at
		FROM share_links WHERE id = $1
	`, id).Scan(&l.ID, &l.FileID, &l.Token, &l.AccessType, &l.CreatedBy, &l.ExpiresAt, &l.PasswordHash, &l.CreatedAt)
	return l, err
}

func (r *Repository) FindByToken(ctx context.Context, db dbTX, token string) (shareLinkRecord, error) {
	var l shareLinkRecord
	err := db.QueryRow(ctx, `
		SELECT id, file_id, token, access_type, created_by, expires_at, password_hash, created_at
		FROM share_links WHERE token = $1
	`, token).Scan(&l.ID, &l.FileID, &l.Token, &l.AccessType, &l.CreatedBy, &l.ExpiresAt, &l.PasswordHash, &l.CreatedAt)
	return l, err
}

func (r *Repository) FindByFileID(ctx context.Context, db dbTX, fileID string, limit int) ([]shareLinkRecord, error) {
	query := `
		SELECT id, file_id, token, access_type, created_by, expires_at, password_hash, created_at
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
		if err := rows.Scan(&l.ID, &l.FileID, &l.Token, &l.AccessType, &l.CreatedBy, &l.ExpiresAt, &l.PasswordHash, &l.CreatedAt); err != nil {
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
		RETURNING id, file_id, token, access_type, created_by, expires_at, password_hash, created_at
	`, id, link.AccessType, link.ExpiresAt, link.PasswordHash).Scan(
		&l.ID, &l.FileID, &l.Token, &l.AccessType, &l.CreatedBy, &l.ExpiresAt, &l.PasswordHash, &l.CreatedAt,
	)
	return l, err
}

func (r *Repository) Delete(ctx context.Context, db dbTX, id string) error {
	_, err := db.Exec(ctx, `DELETE FROM share_links WHERE id = $1`, id)
	return err
}

func (r *Repository) GetFileByID(ctx context.Context, db dbTX, fileID string) (fileRecord, error) {
	var f fileRecord
	err := db.QueryRow(ctx, `
		SELECT id, directory_id, owner_id, object_key
		FROM files WHERE id = $1 AND deleted_at IS NULL
	`, fileID).Scan(&f.ID, &f.DirectoryID, &f.OwnerID, &f.ObjectKey)
	return f, err
}
