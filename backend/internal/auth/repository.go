package auth

import (
	"context"
	"errors"
	"fmt"
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

type UpdateProfileInput struct {
	Email      *string
	Username   *string
	FirstName  *string
	SecondName *string
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

func (r *Repository) FindUserByEmail(ctx context.Context, db dbTX, email string) (authUser, error) {
	var user authUser
	err := db.QueryRow(ctx, `
		SELECT id, username, first_name, second_name, email, password_hash, created_at
		FROM users
		WHERE email = $1
		LIMIT 1
	`, email).Scan(&user.ID, &user.Username, &user.FirstName, &user.SecondName, &user.Email, &user.PasswordHash, &user.CreatedAt)
	if err != nil {
		return authUser{}, err
	}
	return user, nil
}

func (r *Repository) FindUserByUsername(ctx context.Context, db dbTX, username string) (authUser, error) {
	var user authUser
	err := db.QueryRow(ctx, `
		SELECT id, username, first_name, second_name, email, password_hash, created_at
		FROM users
		WHERE username = $1
		LIMIT 1
	`, username).Scan(&user.ID, &user.Username, &user.FirstName, &user.SecondName, &user.Email, &user.PasswordHash, &user.CreatedAt)
	if err != nil {
		return authUser{}, err
	}
	return user, nil
}

func (r *Repository) UpdateUserProfile(ctx context.Context, db dbTX, userID string, input UpdateProfileInput) (authUser, error) {
	var user authUser
	err := db.QueryRow(ctx, `
		UPDATE users
		SET
			email = CASE WHEN $2::text IS NULL THEN email ELSE $2 END,
			username = CASE WHEN $3::text IS NULL THEN username ELSE $3 END,
			first_name = CASE WHEN $4::text IS NULL THEN first_name ELSE $4 END,
			second_name = CASE WHEN $5::text IS NULL THEN second_name ELSE $5 END,
			updated_at = now()
		WHERE id = $1
		RETURNING id, username, first_name, second_name, email, password_hash, created_at
	`, userID, input.Email, input.Username, input.FirstName, input.SecondName).Scan(
		&user.ID, &user.Username, &user.FirstName, &user.SecondName, &user.Email, &user.PasswordHash, &user.CreatedAt,
	)
	if err != nil {
		return authUser{}, err
	}
	return user, nil
}

func (r *Repository) UpdateUserPassword(ctx context.Context, db dbTX, userID, passwordHash string) error {
	_, err := db.Exec(ctx, `UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, userID, passwordHash)
	return err
}

func (r *Repository) RevokeAllRefreshTokensExcept(ctx context.Context, db dbTX, userID, exceptRawToken string) error {
	_, err := db.Exec(ctx, `
		UPDATE refresh_tokens
		SET revoked_at = now()
		WHERE user_id = $1 AND token_hash <> $2 AND revoked_at IS NULL
	`, userID, hashToken(exceptRawToken))
	return err
}

func (r *Repository) SearchUsers(ctx context.Context, db dbTX, requesterID, query string, limit int) ([]authUser, error) {
	queryer, ok := db.(interface {
		Query(context.Context, string, ...any) (pgx.Rows, error)
	})
	if !ok {
		return nil, fmt.Errorf("db transaction does not support query")
	}

	rows, err := queryer.Query(ctx, `
		SELECT id, username, first_name, second_name, email, password_hash, created_at
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

	users := make([]authUser, 0, limit)
	for rows.Next() {
		var user authUser
		if err := rows.Scan(&user.ID, &user.Username, &user.FirstName, &user.SecondName, &user.Email, &user.PasswordHash, &user.CreatedAt); err != nil {
			return nil, err
		}
		users = append(users, user)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return users, nil
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
