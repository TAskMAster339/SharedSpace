package access

import (
	"context"

	"sharedspace/internal/apperror"
)

type Checker struct {
	repo RepositoryInterface
	db   dbExecutor
}

func NewChecker(db dbExecutor, repo RepositoryInterface) *Checker {
	return &Checker{db: db, repo: repo}
}

func (c *Checker) Can(ctx context.Context, userID, directoryID string, action Action) (bool, error) {
	ownerID, sharedDirID, err := c.repo.GetDirectoryInfo(ctx, c.db, directoryID)
	if err != nil {
		return false, err
	}

	if userID == ownerID {
		return true, nil
	}

	if sharedDirID == nil {
		return false, apperror.Forbidden("доступ запрещён")
	}

	role, err := c.repo.GetUserRole(ctx, c.db, userID, *sharedDirID)
	if err != nil {
		return false, err
	}

	return Can(role, action), nil
}

func (c *Checker) GetPermissions(ctx context.Context, userID, directoryID string) (*Permissions, error) {
	ownerID, sharedDirID, err := c.repo.GetDirectoryInfo(ctx, c.db, directoryID)
	if err != nil {
		return nil, err
	}

	if userID == ownerID {
		return &Permissions{
			View:         true,
			Download:     true,
			Upload:       true,
			CreateFolder: true,
			Delete:       true,
			Invite:       true,
			ChangeRole:   true,
			RemoveMember: true,
			DeleteDir:    true,
			CreateLink:   true,
		}, nil
	}

	if sharedDirID == nil {
		return nil, nil
	}

	role, err := c.repo.GetUserRole(ctx, c.db, userID, *sharedDirID)
	if err != nil {
		return nil, err
	}

	perms := GetPermissions(role)
	return &perms, nil
}

func (c *Checker) GetSharedDirectoryID(ctx context.Context, userID, directoryID string) (*string, error) {
	ownerID, sharedDirID, err := c.repo.GetDirectoryInfo(ctx, c.db, directoryID)
	if err != nil {
		return nil, err
	}

	if userID == ownerID {
		return sharedDirID, nil
	}

	if sharedDirID == nil {
		return nil, nil
	}

	role, err := c.repo.GetUserRole(ctx, c.db, userID, *sharedDirID)
	if err != nil {
		return nil, err
	}

	if role == "" {
		return nil, nil
	}

	return sharedDirID, nil
}
