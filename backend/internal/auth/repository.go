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
		INSERT INTO users (username, first_name, second_name, email, password_hash, storage_quota, storage_used)
		VALUES ($1, $2, $3, $4, $5, $6, 0)
		RETURNING id, username, first_name, second_name, email, created_at
	`, input.Username, input.FirstName, input.SecondName, input.Email, passwordHash, storageQuota).Scan(
		&user.ID, &user.Username, &user.FirstName, &user.SecondName, &user.Email, &user.CreatedAt,
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
		SELECT id, username, first_name, second_name, email, password_hash, created_at
		FROM users
		WHERE email = $1 OR username = $1
		LIMIT 1
	`, identifier).Scan(&user.ID, &user.Username, &user.FirstName, &user.SecondName, &user.Email, &user.PasswordHash, &user.CreatedAt)
	if err != nil {
		return authUser{}, err
	}
	return user, nil
}

func (r *Repository) FindUserByID(ctx context.Context, db dbTX, userID string) (authUser, error) {
	var user authUser
	err := db.QueryRow(ctx, `
		SELECT id, username, first_name, second_name, email, password_hash, created_at
		FROM users
		WHERE id = $1
	`, userID).Scan(&user.ID, &user.Username, &user.FirstName, &user.SecondName, &user.Email, &user.PasswordHash, &user.CreatedAt)
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

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
