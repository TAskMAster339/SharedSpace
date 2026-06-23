package users

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
)

type Repository struct{}

func NewRepository() *Repository {
	return &Repository{}
}

func (r *Repository) FindUserByID(ctx context.Context, db dbTX, userID string) (record, error) {
	var user record
	err := db.QueryRow(ctx, `
		SELECT id, username, first_name, second_name, email, password_hash, storage_quota, storage_used, created_at
		FROM users
		WHERE id = $1
	`, userID).Scan(&user.ID, &user.Username, &user.FirstName, &user.SecondName, &user.Email, &user.PasswordHash, &user.StorageQuota, &user.StorageUsed, &user.CreatedAt)
	if err != nil {
		return record{}, err
	}
	return user, nil
}

func (r *Repository) FindUserByEmail(ctx context.Context, db dbTX, email string) (record, error) {
	var user record
	err := db.QueryRow(ctx, `
		SELECT id, username, first_name, second_name, email, password_hash, storage_quota, storage_used, created_at
		FROM users
		WHERE email = $1
		LIMIT 1
	`, email).Scan(&user.ID, &user.Username, &user.FirstName, &user.SecondName, &user.Email, &user.PasswordHash, &user.StorageQuota, &user.StorageUsed, &user.CreatedAt)
	if err != nil {
		return record{}, err
	}
	return user, nil
}

func (r *Repository) FindUserByUsername(ctx context.Context, db dbTX, username string) (record, error) {
	var user record
	err := db.QueryRow(ctx, `
		SELECT id, username, first_name, second_name, email, password_hash, storage_quota, storage_used, created_at
		FROM users
		WHERE username = $1
		LIMIT 1
	`, username).Scan(&user.ID, &user.Username, &user.FirstName, &user.SecondName, &user.Email, &user.PasswordHash, &user.StorageQuota, &user.StorageUsed, &user.CreatedAt)
	if err != nil {
		return record{}, err
	}
	return user, nil
}

func (r *Repository) UpdateUserProfile(ctx context.Context, db dbTX, userID string, input UpdateProfileInput) (record, error) {
	var user record
	err := db.QueryRow(ctx, `
		UPDATE users
		SET
			email = CASE WHEN $2::text IS NULL THEN email ELSE $2 END,
			username = CASE WHEN $3::text IS NULL THEN username ELSE $3 END,
			first_name = CASE WHEN $4::text IS NULL THEN first_name ELSE $4 END,
			second_name = CASE WHEN $5::text IS NULL THEN second_name ELSE $5 END,
			updated_at = now()
		WHERE id = $1
		RETURNING id, username, first_name, second_name, email, password_hash, storage_quota, storage_used, created_at
	`, userID, input.Email, input.Username, input.FirstName, input.SecondName).Scan(
		&user.ID, &user.Username, &user.FirstName, &user.SecondName, &user.Email, &user.PasswordHash, &user.StorageQuota, &user.StorageUsed, &user.CreatedAt,
	)
	if err != nil {
		return record{}, err
	}
	return user, nil
}

func (r *Repository) UpdateUserPassword(ctx context.Context, db dbTX, userID, passwordHash string) error {
	_, err := db.Exec(ctx, `UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, userID, passwordHash)
	return err
}

func (r *Repository) LoadRefreshToken(ctx context.Context, db dbTX, rawToken string) (refreshTokenRecord, error) {
	var token refreshTokenRecord
	err := db.QueryRow(ctx, `
		SELECT user_id, expires_at, revoked_at
		FROM refresh_tokens
		WHERE token_hash = $1
		FOR UPDATE
	`, hashToken(rawToken)).Scan(&token.UserID, &token.ExpiresAt, &token.RevokedAt)
	if err != nil {
		return refreshTokenRecord{}, err
	}
	return token, nil
}

func (r *Repository) RevokeAllRefreshTokensExcept(ctx context.Context, db dbTX, userID, exceptRawToken string) error {
	_, err := db.Exec(ctx, `
		UPDATE refresh_tokens
		SET revoked_at = now()
		WHERE user_id = $1 AND token_hash <> $2 AND revoked_at IS NULL
	`, userID, hashToken(exceptRawToken))
	return err
}

func (r *Repository) SearchUsers(ctx context.Context, db dbTX, requesterID, query string, limit int) ([]record, error) {
	rows, err := db.Query(ctx, `
		SELECT id, username, first_name, second_name, email, password_hash, storage_quota, storage_used, created_at
		FROM users
		WHERE id <> $1
		  AND (username ILIKE '%' || $2 || '%' OR email ILIKE '%' || $2 || '%')
		ORDER BY username ASC
		LIMIT $3
	`, requesterID, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := make([]record, 0, limit)
	for rows.Next() {
		var user record
		if err := rows.Scan(&user.ID, &user.Username, &user.FirstName, &user.SecondName, &user.Email, &user.PasswordHash, &user.StorageQuota, &user.StorageUsed, &user.CreatedAt); err != nil {
			return nil, err
		}
		users = append(users, user)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return users, nil
}

func (r *Repository) DeleteUserAndRelatedData(ctx context.Context, db dbTX, userID string) error {
	if _, err := db.Exec(ctx, `DELETE FROM refresh_tokens WHERE user_id = $1`, userID); err != nil {
		return err
	}

	if _, err := db.Exec(ctx, `DELETE FROM favorite_files WHERE user_id = $1`, userID); err != nil {
		return err
	}

	if _, err := db.Exec(ctx, `DELETE FROM shared_directory_members WHERE user_id = $1`, userID); err != nil {
		return err
	}

	if _, err := db.Exec(ctx, `DELETE FROM directory_invitations WHERE invited_user_id = $1`, userID); err != nil {
		return err
	}
	if _, err := db.Exec(ctx, `DELETE FROM directory_invitations WHERE invited_by = $1`, userID); err != nil {
		return err
	}

	if _, err := db.Exec(ctx, `
		DELETE FROM share_links 
		WHERE created_by = $1 OR file_id IN (SELECT id FROM files WHERE owner_id = $1)
	`, userID); err != nil {
		return err
	}

	if _, err := db.Exec(ctx, `
		DELETE FROM file_conversions 
		WHERE created_by = $1 OR source_file_id IN (SELECT id FROM files WHERE owner_id = $1)
	`, userID); err != nil {
		return err
	}

	if _, err := db.Exec(ctx, `
		DELETE FROM shared_directories 
		WHERE owner_id = $1 OR directory_id IN (SELECT id FROM directories WHERE owner_id = $1)
	`, userID); err != nil {
		return err
	}

	if _, err := db.Exec(ctx, `DELETE FROM files WHERE owner_id = $1`, userID); err != nil {
		return err
	}

	if _, err := db.Exec(ctx, `DELETE FROM directories WHERE owner_id = $1`, userID); err != nil {
		return err
	}

	_, err := db.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	return err
}

func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
