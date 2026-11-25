package access

import (
	"context"
	"errors"
	"slices"

	"github.com/jackc/pgx/v5"

	"sharedspace/internal/apperror"
)

type AccountRole string

const (
	AccountRoleCommon  AccountRole = "common"
	AccountRolePremium AccountRole = "premium"
	AccountRoleAdmin   AccountRole = "admin"
)

type AccountRoleChecker struct {
	db dbExecutor
}

func NewAccountRoleChecker(db dbExecutor) *AccountRoleChecker {
	return &AccountRoleChecker{db: db}
}

func (c *AccountRoleChecker) HasRole(ctx context.Context, userID string, allowed ...AccountRole) (bool, error) {
	if userID == "" || len(allowed) == 0 {
		return false, nil
	}

	var role string
	err := c.db.QueryRow(ctx, "SELECT role::text FROM users WHERE id = $1", userID).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, apperror.WrapInternal("не удалось получить роль аккаунта", err)
	}

	switch accountRole := AccountRole(role); accountRole {
	case AccountRoleCommon, AccountRolePremium, AccountRoleAdmin:
		return slices.Contains(allowed, accountRole), nil
	default:
		return false, nil
	}
}
