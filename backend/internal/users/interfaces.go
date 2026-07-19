package users

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type ServiceInterface interface {
	GetMe(context.Context, string) (UserResponse, error)
	GetUserByID(context.Context, string, string) (UserResponse, error) // <-- добавляем
	UpdateMe(context.Context, string, UpdateProfileRequest) (UserResponse, error)
	ChangePassword(context.Context, string, ChangePasswordRequest) error
	SearchUsers(context.Context, string, string, int) (SearchUsersResponse, error)
	DeleteAccount(context.Context, string, DeleteAccountRequest) error
}

type AuthIdentity interface {
	UserIDFromAccessToken(context.Context, string) (string, error)
}

type RepositoryInterface interface {
	FindUserByID(context.Context, dbTX, string) (record, error)
	FindUserByEmail(context.Context, dbTX, string) (record, error)
	FindUserByUsername(context.Context, dbTX, string) (record, error)
	UpdateUserProfile(context.Context, dbTX, string, UpdateProfileInput) (record, error)
	UpdateUserPassword(context.Context, dbTX, string, string) error
	LoadRefreshToken(context.Context, dbTX, string) (refreshTokenRecord, error)
	RevokeAllRefreshTokensExcept(context.Context, dbTX, string, string) error
	SearchUsers(context.Context, dbTX, string, string, int) ([]record, error)
	DeleteUserAndRelatedData(context.Context, dbTX, string) error
	RecalcSharedDirsCount(context.Context, dbTX, string) error
}

type dbTX interface {
	QueryRow(context.Context, string, ...any) pgx.Row
	Query(context.Context, string, ...any) (pgx.Rows, error)
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

type beginTxFunc func(context.Context, pgx.TxOptions) (transaction, error)

type transaction interface {
	dbTX
	Commit(context.Context) error
	Rollback(context.Context) error
}

type txWrapper struct{ pgx.Tx }

type UpdateProfileInput struct {
	Username   *string
	FirstName  *string
	SecondName *string
}

type record struct {
	ID              string
	Username        string
	FirstName       string
	SecondName      string
	Email           string
	PasswordHash    string
	StorageQuota    int64
	StorageUsed     int64
	SharedDirsCount int
	SharedDirsQuota int
	ShareLinksCount int
	ShareLinksQuota int
	Activated       bool
	CreatedAt       time.Time
}

type refreshTokenRecord struct {
	UserID    string
	ExpiresAt time.Time
	RevokedAt *time.Time
}
