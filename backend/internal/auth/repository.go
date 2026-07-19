package auth

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type dbTX interface {
	QueryRow(context.Context, string, ...any) pgx.Row
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

type Repository struct{}

type refreshTokenRecord struct {
	UserID    string
	ExpiresAt time.Time
	RevokedAt *time.Time
}

func NewRepository() *Repository {
	return &Repository{}
}

func (r *Repository) EmailExists(ctx context.Context, db dbTX, email string) (bool, error) {
	var exists bool
	if err := db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)`, email).Scan(&exists); err != nil {
		return false, err
	}
	return exists, nil
}

func (r *Repository) UsernameExists(ctx context.Context, db dbTX, username string) (bool, error) {
	var exists bool
	if err := db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE username = $1)`, username).Scan(&exists); err != nil {
		return false, err
	}
	return exists, nil
}

func (r *Repository) CreateUser(ctx context.Context, db dbTX, input RegisterRequest, passwordHash string, storageQuota int64) (authUser, error) {
	var user authUser
	err := db.QueryRow(ctx, `
		INSERT INTO users (username, first_name, second_name, email, password_hash, storage_quota, storage_used, activated)
		VALUES ($1, $2, $3, $4, $5, $6, 0, false)
		RETURNING id, username, first_name, second_name, email, password_hash, storage_quota, storage_used, shared_dirs_count, shared_dirs_quota, share_links_count, share_links_quota, activated, created_at
	`, input.Username, input.FirstName, input.SecondName, input.Email, passwordHash, storageQuota).Scan(
		&user.ID, &user.Username, &user.FirstName, &user.SecondName, &user.Email, &user.PasswordHash, &user.StorageQuota, &user.StorageUsed, &user.SharedDirsCount, &user.SharedDirsQuota, &user.ShareLinksCount, &user.ShareLinksQuota, &user.Activated, &user.CreatedAt,
	)
	if err != nil {
		return authUser{}, err
	}
	return user, nil
}

func (r *Repository) CreateRootDirectory(ctx context.Context, db dbTX, ownerID, name string) (string, error) {
	var directoryID string
	if err := db.QueryRow(ctx, `
		INSERT INTO directories (name, owner_id, parent_id, type)
		VALUES ($1, $2, NULL, 'root')
		RETURNING id
	`, name, ownerID).Scan(&directoryID); err != nil {
		return "", err
	}
	return directoryID, nil
}

func (r *Repository) FindUserByIdentifier(ctx context.Context, db dbTX, identifier string) (authUser, error) {
	var user authUser
	err := db.QueryRow(ctx, `
		SELECT id, username, first_name, second_name, email, password_hash, storage_quota, storage_used, shared_dirs_count, shared_dirs_quota, share_links_count, share_links_quota, activated, created_at
		FROM users
		WHERE email = $1 OR username = $1
		LIMIT 1
	`, identifier).Scan(&user.ID, &user.Username, &user.FirstName, &user.SecondName, &user.Email, &user.PasswordHash, &user.StorageQuota, &user.StorageUsed, &user.SharedDirsCount, &user.SharedDirsQuota, &user.ShareLinksCount, &user.ShareLinksQuota, &user.Activated, &user.CreatedAt)
	if err != nil {
		return authUser{}, err
	}
	return user, nil
}

func (r *Repository) FindUserByID(ctx context.Context, db dbTX, userID string) (authUser, error) {
	var user authUser
	err := db.QueryRow(ctx, `
		SELECT id, username, first_name, second_name, email, password_hash, storage_quota, storage_used, shared_dirs_count, shared_dirs_quota, share_links_count, share_links_quota, activated, created_at
		FROM users
		WHERE id = $1
	`, userID).Scan(&user.ID, &user.Username, &user.FirstName, &user.SecondName, &user.Email, &user.PasswordHash, &user.StorageQuota, &user.StorageUsed, &user.SharedDirsCount, &user.SharedDirsQuota, &user.ShareLinksCount, &user.ShareLinksQuota, &user.Activated, &user.CreatedAt)
	if err != nil {
		return authUser{}, err
	}
	return user, nil
}

func (r *Repository) FindUserByEmail(ctx context.Context, db dbTX, email string) (authUser, error) {
	var user authUser
	err := db.QueryRow(ctx, `
		SELECT id, username, first_name, second_name, email, password_hash, storage_quota, storage_used, shared_dirs_count, shared_dirs_quota, share_links_count, share_links_quota, activated, created_at
		FROM users
		WHERE email = $1
		LIMIT 1
	`, email).Scan(&user.ID, &user.Username, &user.FirstName, &user.SecondName, &user.Email, &user.PasswordHash, &user.StorageQuota, &user.StorageUsed, &user.SharedDirsCount, &user.SharedDirsQuota, &user.ShareLinksCount, &user.ShareLinksQuota, &user.Activated, &user.CreatedAt)
	if err != nil {
		return authUser{}, err
	}
	return user, nil
}

func (r *Repository) StoreRefreshToken(ctx context.Context, db dbTX, userID, rawToken, userAgent, ipAddress string, expiresAt time.Time) error {
	_, err := db.Exec(ctx, `
		INSERT INTO refresh_tokens (user_id, token_hash, user_agent, ip_address, expires_at)
		VALUES ($1, $2, $3, $4, $5)
	`, userID, hashToken(rawToken), userAgent, ipAddress, expiresAt)
	return err
}

func (r *Repository) LoadRefreshToken(ctx context.Context, db dbTX, rawToken string) (refreshTokenRecord, error) {
	var record refreshTokenRecord
	if err := db.QueryRow(ctx, `
		SELECT user_id, expires_at, revoked_at
		FROM refresh_tokens
		WHERE token_hash = $1
		FOR UPDATE
	`, hashToken(rawToken)).Scan(&record.UserID, &record.ExpiresAt, &record.RevokedAt); err != nil {
		return refreshTokenRecord{}, err
	}
	return record, nil
}

func (r *Repository) RevokeRefreshToken(ctx context.Context, db dbTX, rawToken string) error {
	_, err := db.Exec(ctx, `UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1`, hashToken(rawToken))
	return err
}

// RevokeAllRefreshTokensForUser revokes every non-revoked refresh token of a user.
// Used during password reset to force re-login on all devices.
func (r *Repository) RevokeAllRefreshTokensForUser(ctx context.Context, db dbTX, userID string) error {
	_, err := db.Exec(ctx, `
		UPDATE refresh_tokens SET revoked_at = now()
		WHERE user_id = $1 AND revoked_at IS NULL
	`, userID)
	return err
}

type emailTokenRecord struct {
	ID        string
	UserID    string
	Type      string
	ExpiresAt time.Time
	UsedAt    *time.Time
}

// CreateEmailToken inserts a new email-token row. The caller passes the
// SHA-256 hash of the raw token (raw tokens are never persisted).
func (r *Repository) CreateEmailToken(ctx context.Context, db dbTX, userID, tokenHash, tokenType string, expiresAt time.Time) error {
	_, err := db.Exec(ctx, `
		INSERT INTO email_tokens (user_id, token_hash, type, expires_at)
		VALUES ($1, $2, $3, $4)
	`, userID, tokenHash, tokenType, expiresAt)
	return err
}

// FindEmailTokenByHash loads an email-token row by its hash, for verification.
func (r *Repository) FindEmailTokenByHash(ctx context.Context, db dbTX, tokenHash string) (emailTokenRecord, error) {
	var rec emailTokenRecord
	err := db.QueryRow(ctx, `
		SELECT id, user_id, type, expires_at, used_at
		FROM email_tokens
		WHERE token_hash = $1
		FOR UPDATE
	`, tokenHash).Scan(&rec.ID, &rec.UserID, &rec.Type, &rec.ExpiresAt, &rec.UsedAt)
	if err != nil {
		return emailTokenRecord{}, err
	}
	return rec, nil
}

// MarkEmailTokenUsed marks a token as used. Safe to call within the same
// transaction that performs the actual state change (verify email / reset password).
func (r *Repository) MarkEmailTokenUsed(ctx context.Context, db dbTX, tokenID string) error {
	_, err := db.Exec(ctx, `UPDATE email_tokens SET used_at = now() WHERE id = $1`, tokenID)
	return err
}

// InvalidateEmailTokensForUser marks all unused tokens of a given type as used.
// Called before issuing a new token of the same type to prevent token storms.
func (r *Repository) InvalidateEmailTokensForUser(ctx context.Context, db dbTX, userID, tokenType string) error {
	_, err := db.Exec(ctx, `
		UPDATE email_tokens SET used_at = now()
		WHERE user_id = $1 AND type = $2 AND used_at IS NULL
	`, userID, tokenType)
	return err
}

// SetUserActivated flips the activated flag. Used during email verification.
func (r *Repository) SetUserActivated(ctx context.Context, db dbTX, userID string, activated bool) error {
	_, err := db.Exec(ctx, `UPDATE users SET activated = $2, updated_at = now() WHERE id = $1`, userID, activated)
	return err
}

// UpdateUserPassword sets a new password hash. Used during password reset.
func (r *Repository) UpdateUserPassword(ctx context.Context, db dbTX, userID, passwordHash string) error {
	_, err := db.Exec(ctx, `UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, userID, passwordHash)
	return err
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
