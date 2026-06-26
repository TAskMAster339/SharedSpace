package favorites

import (
	"context"
	"errors"

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

func (r *Repository) FindAllByUserID(ctx context.Context, db dbTX, userID string, limit int) ([]favoriteFileRecord, error) {
	query := `
		SELECT f.id, f.filename, f.extension, f.mime_type, f.size,
		       f.directory_id, f.owner_id, f.created_at, f.updated_at,
		       fav.created_at AS favorited_at
		FROM favorite_files fav
		JOIN files f ON f.id = fav.file_id
		WHERE fav.user_id = $1 AND f.deleted_at IS NULL
		ORDER BY fav.created_at DESC`
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

	var records []favoriteFileRecord
	for rows.Next() {
		var rec favoriteFileRecord
		if err := rows.Scan(
			&rec.ID, &rec.Filename, &rec.Extension, &rec.MimeType,
			&rec.Size, &rec.DirectoryID, &rec.OwnerID,
			&rec.CreatedAt, &rec.UpdatedAt, &rec.FavoritedAt,
		); err != nil {
			return nil, err
		}
		records = append(records, rec)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return records, nil
}

func (r *Repository) FindFileByID(ctx context.Context, db dbTX, fileID string) (string, error) {
	var directoryID string
	err := db.QueryRow(ctx, `
		SELECT directory_id FROM files
		WHERE id = $1 AND deleted_at IS NULL
	`, fileID).Scan(&directoryID)
	return directoryID, err
}
