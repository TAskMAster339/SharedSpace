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

func (r *Repository) HardDeleteFile(ctx context.Context, db dbTX, id string) error {
	_, err := db.Exec(ctx, `DELETE FROM files WHERE id=$1`, id)
	return err
}
