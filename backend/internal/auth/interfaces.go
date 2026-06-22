package auth

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

type AuthService interface {
	Register(context.Context, RegisterRequest) (RegisterResponse, error)
	Login(context.Context, LoginRequest, loginMeta) (LoginResponse, error)
	Refresh(context.Context, string, loginMeta) (RefreshResponse, error)
	GetMe(context.Context, string) (UserResponse, error)
	UpdateMe(context.Context, string, UpdateProfileRequest) (UserResponse, error)
	ChangePassword(context.Context, string, ChangePasswordRequest) error
	SearchUsers(context.Context, string, string, int) (SearchUsersResponse, error)
	UserIDFromAccessToken(context.Context, string) (string, error)
}

type AuthRepository interface {
	EmailExists(context.Context, dbTX, string) (bool, error)
	UsernameExists(context.Context, dbTX, string) (bool, error)
	CreateUser(context.Context, dbTX, RegisterRequest, string, int64) (authUser, error)
	CreateRootDirectory(context.Context, dbTX, string, string) (string, error)
	FindUserByIdentifier(context.Context, dbTX, string) (authUser, error)
	FindUserByID(context.Context, dbTX, string) (authUser, error)
	FindUserByEmail(context.Context, dbTX, string) (authUser, error)
	FindUserByUsername(context.Context, dbTX, string) (authUser, error)
	UpdateUserProfile(context.Context, dbTX, string, UpdateProfileInput) (authUser, error)
	UpdateUserPassword(context.Context, dbTX, string, string) error
	RevokeAllRefreshTokensExcept(context.Context, dbTX, string, string) error
	SearchUsers(context.Context, dbTX, string, string, int) ([]authUser, error)
	StoreRefreshToken(context.Context, dbTX, string, string, string, string, time.Time) error
	LoadRefreshToken(context.Context, dbTX, string) (refreshTokenRecord, error)
	RevokeRefreshToken(context.Context, dbTX, string) error
}

type beginTxFunc func(context.Context, pgx.TxOptions) (transaction, error)

type transaction interface {
	dbTX
	Commit(context.Context) error
	Rollback(context.Context) error
}

type txWrapper struct{ pgx.Tx }
