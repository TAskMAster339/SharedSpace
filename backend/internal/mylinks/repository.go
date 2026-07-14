package mylinks

import (
	"context"
	"fmt"
	"time"
)

type Repository struct{}

func NewRepository() *Repository {
	return &Repository{}
}

func (r *Repository) FindAllByUserID(ctx context.Context, db dbTX, userID string, limit int) ([]linkItemRecord, error) {
	baseQuery := `
		SELECT sub.link_id, sub.item_type, sub.id, sub.filename, sub.extension,
		       sub.mime_type, sub.size, sub.directory_id, sub.owner_id,
		       sub.created_at, sub.updated_at, sub.link_token, sub.is_active, sub.link_created_at
		FROM (
			SELECT sl.id AS link_id, 'file' AS item_type,
			       f.id, f.filename, f.extension, f.mime_type, f.size,
			       f.directory_id, f.owner_id, f.created_at, f.updated_at,
			       sl.token AS link_token, sl.is_active, sl.created_at AS link_created_at
			FROM share_links sl
			JOIN files f ON f.id = sl.file_id
			WHERE sl.created_by = $1 AND f.deleted_at IS NULL
			UNION ALL
			SELECT sl.id AS link_id, 'directory' AS item_type,
			       d.id, d.name AS filename, '' AS extension, '' AS mime_type,
			       0 AS size, d.id AS directory_id, d.owner_id,
			       d.created_at, d.updated_at,
			       sl.token AS link_token, sl.is_active, sl.created_at AS link_created_at
			FROM share_links sl
			JOIN directories d ON d.id = sl.directory_id
			WHERE sl.created_by = $1 AND d.deleted_at IS NULL
		) sub
		ORDER BY sub.link_created_at DESC, sub.link_id DESC`

	query := baseQuery
	args := []any{userID}

	if limit > 0 {
		paramIdx := len(args) + 1
		query += fmt.Sprintf(` LIMIT $%d`, paramIdx)
		args = append(args, limit)
	}

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []linkItemRecord
	for rows.Next() {
		var rec linkItemRecord
		if err := rows.Scan(
			&rec.LinkID, &rec.ItemType, &rec.ID, &rec.Filename, &rec.Extension,
			&rec.MimeType, &rec.Size, &rec.DirectoryID, &rec.OwnerID,
			&rec.CreatedAt, &rec.UpdatedAt, &rec.LinkToken, &rec.IsActive, &rec.LinkCreatedAt,
		); err != nil {
			return nil, err
		}
		records = append(records, rec)
	}
	return records, rows.Err()
}

func (r *Repository) FindAllByUserIDAfterCursor(ctx context.Context, db dbTX, userID string, cursorTime time.Time, cursorID string, limit int) ([]linkItemRecord, error) {
	query := `
		SELECT sub.link_id, sub.item_type, sub.id, sub.filename, sub.extension,
		       sub.mime_type, sub.size, sub.directory_id, sub.owner_id,
		       sub.created_at, sub.updated_at, sub.link_token, sub.is_active, sub.link_created_at
		FROM (
			SELECT sl.id AS link_id, 'file' AS item_type,
			       f.id, f.filename, f.extension, f.mime_type, f.size,
			       f.directory_id, f.owner_id, f.created_at, f.updated_at,
			       sl.token AS link_token, sl.is_active, sl.created_at AS link_created_at
			FROM share_links sl
			JOIN files f ON f.id = sl.file_id
			WHERE sl.created_by = $1 AND f.deleted_at IS NULL
			UNION ALL
			SELECT sl.id AS link_id, 'directory' AS item_type,
			       d.id, d.name AS filename, '' AS extension, '' AS mime_type,
			       0 AS size, d.id AS directory_id, d.owner_id,
			       d.created_at, d.updated_at,
			       sl.token AS link_token, sl.is_active, sl.created_at AS link_created_at
			FROM share_links sl
			JOIN directories d ON d.id = sl.directory_id
			WHERE sl.created_by = $1 AND d.deleted_at IS NULL
		) sub
		WHERE (sub.link_created_at, sub.link_id) < ($2, $3)
		ORDER BY sub.link_created_at DESC, sub.link_id DESC
		LIMIT $4`

	rows, err := db.Query(ctx, query, userID, cursorTime, cursorID, limit+1)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []linkItemRecord
	for rows.Next() {
		var rec linkItemRecord
		if err := rows.Scan(
			&rec.LinkID, &rec.ItemType, &rec.ID, &rec.Filename, &rec.Extension,
			&rec.MimeType, &rec.Size, &rec.DirectoryID, &rec.OwnerID,
			&rec.CreatedAt, &rec.UpdatedAt, &rec.LinkToken, &rec.IsActive, &rec.LinkCreatedAt,
		); err != nil {
			return nil, err
		}
		records = append(records, rec)
	}
	return records, rows.Err()
}
