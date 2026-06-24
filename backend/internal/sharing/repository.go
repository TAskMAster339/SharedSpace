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

func (r *Repository) FindByMemberWithStats(ctx context.Context, db dbTX, userID string) ([]sharedDirectoryWithStatsRecord, error) {
	rows, err := db.Query(ctx, `
		SELECT
			sd.id,
			sd.directory_id,
			sd.owner_id,
			d.name,
			u.username,
			sdm.role,
			(SELECT COUNT(*) FROM shared_directory_members sdm2 WHERE sdm2.shared_directory_id = sd.id),
			(SELECT COUNT(*) FROM files f WHERE f.directory_id = sd.directory_id AND f.deleted_at IS NULL),
			sd.created_at
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

	var records []sharedDirectoryWithStatsRecord
	for rows.Next() {
		var r sharedDirectoryWithStatsRecord
		if err := rows.Scan(&r.ID, &r.DirectoryID, &r.OwnerID, &r.Name, &r.OwnerName, &r.Role, &r.MemberCount, &r.FileCount, &r.CreatedAt); err != nil {
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

func (r *Repository) FindUserByUsername(ctx context.Context, db dbTX, username string) (string, error) {
	var userID string
	err := db.QueryRow(ctx, `
		SELECT id FROM users WHERE username = $1
	`, username).Scan(&userID)
	return userID, err
}

func (r *Repository) IsMember(ctx context.Context, db dbTX, sharedDirID, userID string) (bool, error) {
	var exists bool
	err := db.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM shared_directory_members
			WHERE shared_directory_id = $1 AND user_id = $2
		)
	`, sharedDirID, userID).Scan(&exists)
	return exists, err
}

func (r *Repository) CreateInvitation(ctx context.Context, db dbTX, sharedDirID, invitedUserID, invitedByUserID, role string) (invitationRecord, error) {
	var rec invitationRecord
	err := db.QueryRow(ctx, `
		INSERT INTO directory_invitations (shared_directory_id, invited_user_id, invited_by, role)
		VALUES ($1, $2, $3, $4)
		RETURNING id, shared_directory_id, invited_user_id, invited_by, role, status, created_at
	`, sharedDirID, invitedUserID, invitedByUserID, role).Scan(
		&rec.ID, &rec.SharedDirectoryID, &rec.InvitedUserID,
		&rec.InvitedByUserID, &rec.Role, &rec.Status, &rec.CreatedAt,
	)
	if err != nil {
		return invitationRecord{}, err
	}
	return rec, nil
}

func (r *Repository) FindInvitationsByUser(ctx context.Context, db dbTX, userID string, statuses ...string) ([]invitationRecord, error) {
	rows, err := db.Query(ctx, `
		SELECT di.id, di.shared_directory_id, d.name, di.invited_user_id, di.invited_by, u.username, di.role, di.status, di.created_at
		FROM directory_invitations di
		JOIN shared_directories sd ON sd.id = di.shared_directory_id
		JOIN directories d ON d.id = sd.directory_id
		JOIN users u ON u.id = di.invited_by
		WHERE di.invited_user_id = $1
		ORDER BY di.created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []invitationRecord
	for rows.Next() {
		var rec invitationRecord
		if err := rows.Scan(&rec.ID, &rec.SharedDirectoryID, &rec.DirectoryName,
			&rec.InvitedUserID, &rec.InvitedByUserID, &rec.InvitedByUsername,
			&rec.Role, &rec.Status, &rec.CreatedAt); err != nil {
			return nil, err
		}
		records = append(records, rec)
	}
	return records, rows.Err()
}

func (r *Repository) FindInvitationByID(ctx context.Context, db dbTX, id string) (invitationRecord, error) {
	var rec invitationRecord
	err := db.QueryRow(ctx, `
		SELECT di.id, di.shared_directory_id, d.name, di.invited_user_id, di.invited_by, u.username, di.role, di.status, di.created_at
		FROM directory_invitations di
		JOIN shared_directories sd ON sd.id = di.shared_directory_id
		JOIN directories d ON d.id = sd.directory_id
		JOIN users u ON u.id = di.invited_by
		WHERE di.id = $1
	`, id).Scan(&rec.ID, &rec.SharedDirectoryID, &rec.DirectoryName,
		&rec.InvitedUserID, &rec.InvitedByUserID, &rec.InvitedByUsername,
		&rec.Role, &rec.Status, &rec.CreatedAt)
	return rec, err
}

func (r *Repository) UpdateInvitationStatus(ctx context.Context, db dbTX, id, status string) error {
	_, err := db.Exec(ctx, `
		UPDATE directory_invitations SET status = $2 WHERE id = $1
	`, id, status)
	return err
}

func (r *Repository) AddMember(ctx context.Context, db dbTX, sharedDirID, userID, role string) error {
	_, err := db.Exec(ctx, `
		INSERT INTO shared_directory_members (shared_directory_id, user_id, role)
		VALUES ($1, $2, $3)
	`, sharedDirID, userID, role)
	return err
}

func (r *Repository) FindMember(ctx context.Context, db dbTX, sharedDirID, userID string) (memberRecord, error) {
	var rec memberRecord
	err := db.QueryRow(ctx, `
		SELECT sdm.id, u.id, u.username, sdm.role, sdm.joined_at
		FROM shared_directory_members sdm
		JOIN users u ON u.id = sdm.user_id
		WHERE sdm.shared_directory_id = $1 AND sdm.user_id = $2
	`, sharedDirID, userID).Scan(&rec.ID, &rec.UserID, &rec.Username, &rec.Role, &rec.JoinedAt)
	return rec, err
}

func (r *Repository) UpdateMemberRole(ctx context.Context, db dbTX, sharedDirID, userID, role string) error {
	_, err := db.Exec(ctx, `
		UPDATE shared_directory_members SET role = $3
		WHERE shared_directory_id = $1 AND user_id = $2
	`, sharedDirID, userID, role)
	return err
}

func (r *Repository) RemoveMember(ctx context.Context, db dbTX, sharedDirID, userID string) error {
	_, err := db.Exec(ctx, `
		DELETE FROM shared_directory_members
		WHERE shared_directory_id = $1 AND user_id = $2
	`, sharedDirID, userID)
	return err
}
