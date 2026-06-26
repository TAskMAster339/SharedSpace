package access

import "context"

type RepositoryInterface interface {
	GetUserRole(ctx context.Context, db dbExecutor, userID, sharedDirectoryID string) (Role, error)
	GetDirectoryInfo(ctx context.Context, db dbExecutor, directoryID string) (ownerID string, sharedDirectoryID *string, err error)
}

type AccessChecker interface {
	Can(ctx context.Context, userID, directoryID string, action Action) (bool, error)
	GetPermissions(ctx context.Context, userID, directoryID string) (*Permissions, error)
}
