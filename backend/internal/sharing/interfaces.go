package sharing

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type ServiceInterface interface {
	GetSharedWithMe(context.Context, string) ([]SharedDirectoryResponse, error)
	GetSharedWithMeStats(context.Context, string) ([]SharedDirectoryWithStatsResponse, error)
	GetMembers(context.Context, string, string) ([]MemberResponse, error)
	Invite(context.Context, string, string, string) (*InvitationResponse, error)
	GetMyInvitations(context.Context, string) ([]InvitationResponse, error)
	AcceptInvitation(context.Context, string, string) error
	DeclineInvitation(context.Context, string, string) error
	RemoveInvitation(context.Context, string, string) error
	ChangeRole(context.Context, string, string, string, string) (*MemberResponse, error)
	RemoveMember(context.Context, string, string, string) error
}

type RepositoryInterface interface {
	CreateShared(ctx context.Context, tx interface {
		Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
		QueryRow(context.Context, string, ...any) pgx.Row
	}, directoryID, ownerID string) error
	FindByMember(ctx context.Context, db dbTX, userID string) ([]sharedDirectoryRecord, error)
	FindByMemberWithStats(ctx context.Context, db dbTX, userID string) ([]sharedDirectoryWithStatsRecord, error)
	FindMembers(ctx context.Context, db dbTX, sharedDirID string) ([]memberRecord, error)
	FindByID(ctx context.Context, db dbTX, id string) (sharedDirectoryRecord, error)
	FindUserByUsername(ctx context.Context, db dbTX, username string) (string, error)
	IsMember(ctx context.Context, db dbTX, sharedDirID, userID string) (bool, error)
	CreateInvitation(ctx context.Context, db dbTX, sharedDirID, invitedUserID, invitedByUserID, role string) (invitationRecord, error)
	FindInvitationsByUser(ctx context.Context, db dbTX, userID string, statuses ...string) ([]invitationRecord, error)
	FindInvitationByID(ctx context.Context, db dbTX, id string) (invitationRecord, error)
	UpdateInvitationStatus(ctx context.Context, db dbTX, id, status string) error
	AddMember(ctx context.Context, db dbTX, sharedDirID, userID, role string) error
	FindMember(ctx context.Context, db dbTX, sharedDirID, userID string) (memberRecord, error)
	UpdateMemberRole(ctx context.Context, db dbTX, sharedDirID, userID, role string) error
	RemoveMember(ctx context.Context, db dbTX, sharedDirID, userID string) error
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
