package mylinks

import (
	"context"
	"fmt"
	"time"
)

const dedupFetchMultiplier = 10

type Repository struct{}

func NewRepository() *Repository {
	return &Repository{}
}

// queryAll fetches rows from SQL and deduplicates by item ID.
// The fetchLimit is the SQL LIMIT (before dedup).
func (r *Repository) queryAll(ctx context.Context, db dbTX, userID string, cursorTime *time.Time, cursorID string, fetchLimit int) ([]linkItemRecord, error) {
	baseQuery := `
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
		WHERE sl.created_by = $1 AND d.deleted_at IS NULL`

	query := `SELECT sub.link_id, sub.item_type, sub.id, sub.filename, sub.extension,
	                 sub.mime_type, sub.size, sub.directory_id, sub.owner_id,
	                 sub.created_at, sub.updated_at, sub.link_token, sub.is_active, sub.link_created_at
	          FROM (` + baseQuery + `) sub`

	var args []any
	if cursorTime != nil && cursorID != "" {
		query += ` WHERE (sub.link_created_at, sub.link_id) < ($2, $3)`
		args = append(args, userID, *cursorTime, cursorID)
	} else {
		args = append(args, userID)
	}

	query += ` ORDER BY sub.link_created_at DESC, sub.link_id DESC`

	if fetchLimit > 0 {
		paramIdx := len(args) + 1
		query += fmt.Sprintf(` LIMIT $%d`, paramIdx)
		args = append(args, fetchLimit)
	}

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	seen := make(map[string]bool)
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
		if seen[rec.ID] {
			continue
		}
		seen[rec.ID] = true
		records = append(records, rec)
	}
	return records, rows.Err()
}

func (r *Repository) FindAllByUserID(ctx context.Context, db dbTX, userID string, limit int) ([]linkItemRecord, error) {
	if limit == 0 {
		return r.queryAll(ctx, db, userID, nil, "", 0)
	}
	// Fetch more from SQL to account for dedup; use a safe multiplier
	records, err := r.queryAll(ctx, db, userID, nil, "", limit*10)
	if err != nil {
		return nil, err
	}
	if len(records) > limit {
		records = records[:limit]
	}
	return records, nil
}

func (r *Repository) FindAllByUserIDAfterCursor(ctx context.Context, db dbTX, userID string, cursorTime time.Time, cursorID string, limit int) ([]linkItemRecord, error) {
	// limit+1 so the service can detect hasMore (same pattern as favorites)
	target := limit + 1
	records, err := r.queryAll(ctx, db, userID, &cursorTime, cursorID, target*dedupFetchMultiplier)
	if err != nil {
		return nil, err
	}
	if len(records) > target {
		records = records[:target]
	}
	return records, nil
}
