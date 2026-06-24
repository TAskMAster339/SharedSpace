package access

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"sharedspace/internal/apperror"
)

type dbExecutor interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

type Repository struct{}

func NewRepository() *Repository {
	return &Repository{}
}

func (r *Repository) GetDirectoryInfo(ctx context.Context, db dbExecutor, directoryID string) (ownerID string, sharedDirectoryID *string, err error) {
	var sharedID *string
	err = db.QueryRow(ctx, `
		SELECT d.owner_id, sd.id
		FROM directories d
		LEFT JOIN shared_directories sd ON sd.directory_id = d.id
		WHERE d.id = $1
	`, directoryID).Scan(&ownerID, &sharedID)

	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil, apperror.NotFound("директория не найдена")
	}
	if err != nil {
		return "", nil, apperror.WrapInternal("не удалось получить информацию о директории", err)
	}

	return ownerID, sharedID, nil
}

func (r *Repository) GetUserRole(ctx context.Context, db dbExecutor, userID, sharedDirectoryID string) (Role, error) {
	var dbRole string
	err := db.QueryRow(ctx, `
		SELECT COALESCE(sdm.role, 'admin')
		FROM shared_directories sd
		LEFT JOIN shared_directory_members sdm ON sdm.shared_directory_id = sd.id AND sdm.user_id = $1
		WHERE sd.id = $2 AND (sd.owner_id = $1 OR sdm.user_id IS NOT NULL)
	`, userID, sharedDirectoryID).Scan(&dbRole)

	if errors.Is(err, pgx.ErrNoRows) {
		return "", apperror.Forbidden("вы не являетесь участником этой общей директории")
	}
	if err != nil {
		return "", apperror.WrapInternal("не удалось получить роль пользователя", err)
	}

	return Role(dbRole), nil
}
