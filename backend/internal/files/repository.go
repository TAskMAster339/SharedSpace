package files

import "context"

type Repository struct{}

func NewRepository() *Repository {
	return &Repository{}
}

func (r *Repository) FindDirectoryByID(ctx context.Context, db dbTX, id string) (directoryRecord, error) {
	var d directoryRecord
	err := db.QueryRow(ctx, `
		SELECT id, owner_id FROM directories
		WHERE id = $1 AND deleted_at IS NULL
	`, id).Scan(&d.ID, &d.OwnerID)
	return d, err
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
