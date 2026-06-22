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
	UserIDFromAccessToken(context.Context, string) (string, error)
	Logout(context.Context, string) error
	ParseAccessToken(string) (*Claims, error)
}

type AuthRepository interface {
	EmailExists(context.Context, dbTX, string) (bool, error)
	UsernameExists(context.Context, dbTX, string) (bool, error)
	CreateUser(context.Context, dbTX, RegisterRequest, string, int64) (authUser, error)
	CreateRootDirectory(context.Context, dbTX, string, string) (string, error)
	FindUserByIdentifier(context.Context, dbTX, string) (authUser, error)
	FindUserByID(context.Context, dbTX, string) (authUser, error)
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
