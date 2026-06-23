package sharing

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type Repository struct{}

func NewRepository() *Repository {
	return &Repository{}
}

func (r *Repository) CreateShared(ctx context.Context, tx interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}, directoryID, ownerID string) error {
	var sharedID string
	err := tx.QueryRow(ctx, `
		INSERT INTO shared_directories (directory_id, owner_id)
		VALUES ($1, $2)
		RETURNING id
	`, directoryID, ownerID).Scan(&sharedID)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO shared_directory_members (shared_directory_id, user_id, role)
		VALUES ($1, $2, 'admin')
	`, sharedID, ownerID)
	return err
}

func (r *Repository) FindByMember(ctx context.Context, db dbTX, userID string) ([]sharedDirectoryRecord, error) {
	rows, err := db.Query(ctx, `
		SELECT sd.id, sd.directory_id, sd.owner_id, d.name, u.username, sdm.role, sd.created_at
		FROM shared_directories sd
		JOIN shared_directory_members sdm ON sdm.shared_directory_id = sd.id
		JOIN directories d ON d.id = sd.directory_id
		JOIN users u ON u.id = sd.owner_id
		WHERE sdm.user_id = $1
		ORDER BY sd.created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []sharedDirectoryRecord
	for rows.Next() {
		var r sharedDirectoryRecord
		if err := rows.Scan(&r.ID, &r.DirectoryID, &r.OwnerID, &r.Name, &r.OwnerName, &r.Role, &r.CreatedAt); err != nil {
			return nil, err
		}
		records = append(records, r)
	}
	return records, rows.Err()
}

func (r *Repository) FindMembers(ctx context.Context, db dbTX, sharedDirID string) ([]memberRecord, error) {
	rows, err := db.Query(ctx, `
		SELECT sdm.id, u.id, u.username, sdm.role, sdm.joined_at
		FROM shared_directory_members sdm
		JOIN users u ON u.id = sdm.user_id
		WHERE sdm.shared_directory_id = $1
		ORDER BY sdm.joined_at ASC
	`, sharedDirID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []memberRecord
	for rows.Next() {
		var r memberRecord
		if err := rows.Scan(&r.ID, &r.UserID, &r.Username, &r.Role, &r.JoinedAt); err != nil {
			return nil, err
		}
		records = append(records, r)
	}
	return records, rows.Err()
}

func (r *Repository) FindByID(ctx context.Context, db dbTX, id string) (sharedDirectoryRecord, error) {
	var rec sharedDirectoryRecord
	err := db.QueryRow(ctx, `
		SELECT sd.id, sd.directory_id, sd.owner_id, d.name, u.username, ''::text, sd.created_at
		FROM shared_directories sd
		JOIN directories d ON d.id = sd.directory_id
		JOIN users u ON u.id = sd.owner_id
		WHERE sd.id = $1
	`, id).Scan(&rec.ID, &rec.DirectoryID, &rec.OwnerID, &rec.Name, &rec.OwnerName, &rec.Role, &rec.CreatedAt)
	return rec, err
}
