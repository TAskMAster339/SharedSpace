package favorites

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

type Repository struct{}

func NewRepository() *Repository {
	return &Repository{}
}

func (r *Repository) Insert(ctx context.Context, db dbTX, userID, fileID string) error {
	_, err := db.Exec(ctx, `
		INSERT INTO favorite_files (user_id, file_id)
		VALUES ($1, $2)
		ON CONFLICT (user_id, file_id) DO NOTHING
	`, userID, fileID)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23503" {
			return err
		}
	}
	return err
}

func (r *Repository) Delete(ctx context.Context, db dbTX, userID, fileID string) error {
	_, err := db.Exec(ctx, `
		DELETE FROM favorite_files
		WHERE user_id = $1 AND file_id = $2
	`, userID, fileID)
	return err
}

func (r *Repository) FindAllByUserID(ctx context.Context, db dbTX, userID string, limit int, purpose ...string) ([]favoriteFileRecord, error) {
	query := `
		SELECT f.id, f.filename, f.extension, f.mime_type, f.size,
		       f.directory_id, f.owner_id, f.created_at, f.updated_at,
		       fav.created_at AS favorited_at,
		       CASE WHEN d.purpose = 'audio' THEN COALESCE(
		          (SELECT object_key FROM file_previews WHERE file_id = f.id AND source_object_key = f.object_key),
		          (SELECT preview_key FROM directory_covers WHERE directory_id = d.id), '') ELSE '' END
		FROM favorite_files fav
		JOIN files f ON f.id = fav.file_id
		JOIN directories d ON d.id = f.directory_id
		WHERE fav.user_id = $1 AND f.deleted_at IS NULL
		  AND ($2 = '' OR (d.purpose = $2 AND d.deleted_at IS NULL))
		ORDER BY fav.created_at DESC, fav.file_id DESC`
	args := []any{userID, requestedPurpose(purpose)}

	if limit > 0 {
		query += ` LIMIT $3`
		args = append(args, limit)
	}

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []favoriteFileRecord
	for rows.Next() {
		var rec favoriteFileRecord
		if err := rows.Scan(
			&rec.ID, &rec.Filename, &rec.Extension, &rec.MimeType,
			&rec.Size, &rec.DirectoryID, &rec.OwnerID,
			&rec.CreatedAt, &rec.UpdatedAt, &rec.FavoritedAt, &rec.CoverKey,
		); err != nil {
			return nil, err
		}
		records = append(records, rec)
	}

	return records, rows.Err()
}

func (r *Repository) FindAllByUserIDAfterCursor(ctx context.Context, db dbTX, userID string, cursorTime time.Time, cursorID string, limit int, purpose ...string) ([]favoriteFileRecord, error) {
	rows, err := db.Query(ctx, `
		SELECT f.id, f.filename, f.extension, f.mime_type, f.size,
		       f.directory_id, f.owner_id, f.created_at, f.updated_at,
		       fav.created_at AS favorited_at,
		       CASE WHEN d.purpose = 'audio' THEN COALESCE(
		          (SELECT object_key FROM file_previews WHERE file_id = f.id AND source_object_key = f.object_key),
		          (SELECT preview_key FROM directory_covers WHERE directory_id = d.id), '') ELSE '' END
		FROM favorite_files fav
		JOIN files f ON f.id = fav.file_id
		JOIN directories d ON d.id = f.directory_id
		WHERE fav.user_id = $1 AND f.deleted_at IS NULL
		  AND (fav.created_at, fav.file_id) < ($2, $3)
		  AND ($5 = '' OR (d.purpose = $5 AND d.deleted_at IS NULL))
		ORDER BY fav.created_at DESC, fav.file_id DESC
		LIMIT $4
	`, userID, cursorTime, cursorID, limit+1, requestedPurpose(purpose))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []favoriteFileRecord
	for rows.Next() {
		var rec favoriteFileRecord
		if err := rows.Scan(
			&rec.ID, &rec.Filename, &rec.Extension, &rec.MimeType,
			&rec.Size, &rec.DirectoryID, &rec.OwnerID,
			&rec.CreatedAt, &rec.UpdatedAt, &rec.FavoritedAt, &rec.CoverKey,
		); err != nil {
			return nil, err
		}
		records = append(records, rec)
	}

	return records, rows.Err()
}

func (r *Repository) FindFileByID(ctx context.Context, db dbTX, fileID string) (string, error) {
	var directoryID string
	err := db.QueryRow(ctx, `
		SELECT directory_id FROM files
		WHERE id = $1 AND deleted_at IS NULL
	`, fileID).Scan(&directoryID)
	return directoryID, err
}

func (r *Repository) HasShareLinks(ctx context.Context, db dbTX, fileIDs []string) (map[string]bool, error) {
	if len(fileIDs) == 0 {
		return make(map[string]bool), nil
	}

	rows, err := db.Query(ctx, `SELECT DISTINCT file_id FROM share_links WHERE file_id = ANY($1) AND is_active = true`, fileIDs)
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

func requestedPurpose(purpose []string) string {
	if len(purpose) == 0 {
		return ""
	}
	return purpose[0]
}
