package favorites

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sharedspace/internal/access"
	"sharedspace/internal/apperror"
)

type Service struct {
	beginTx       beginTxFunc
	db            dbTX
	repo          RepositoryInterface
	accessChecker access.AccessChecker
}

func NewService(pool *pgxpool.Pool, repo RepositoryInterface, accessChecker access.AccessChecker) *Service {
	beginTx := func(ctx context.Context, opts pgx.TxOptions) (transaction, error) {
		tx, err := pool.BeginTx(ctx, opts)
		if err != nil {
			return nil, err
		}
		return txWrapper{Tx: tx}, nil
	}
	return &Service{beginTx: beginTx, db: pool, repo: repo, accessChecker: accessChecker}
}

func (s *Service) Add(ctx context.Context, userID, fileID string) error {
	dirID, err := s.repo.FindFileByID(ctx, s.db, fileID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperror.NotFound("файл не найден")
		}
		return apperror.WrapInternal("проверка существования файла", err)
	}

	ok, err := s.accessChecker.Can(ctx, userID, dirID, access.ActionView)
	if err != nil {
		return err
	}
	if !ok {
		return apperror.Forbidden("доступ запрещён")
	}

	if err := s.repo.Insert(ctx, s.db, userID, fileID); err != nil {
		return apperror.WrapInternal("добавление в избранное", err)
	}

	return nil
}

func (s *Service) Remove(ctx context.Context, userID, fileID string) error {
	if _, err := s.repo.FindFileByID(ctx, s.db, fileID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperror.NotFound("файл не найден")
		}
		return apperror.WrapInternal("проверка существования файла", err)
	}

	if err := s.repo.Delete(ctx, s.db, userID, fileID); err != nil {
		return apperror.WrapInternal("удаление из избранного", err)
	}

	return nil
}

func (s *Service) List(ctx context.Context, userID string, limit int, cursor string) (FavoritesListResponse, error) {
	if limit == 0 {
		records, err := s.repo.FindAllByUserID(ctx, s.db, userID, 0)
		if err != nil {
			return FavoritesListResponse{}, apperror.WrapInternal("получение списка избранного", err)
		}
		favorites := make([]FavoriteFileResponse, 0, len(records))
		for _, rec := range records {
			favorites = append(favorites, toFavoriteResponse(rec))
		}
		return FavoritesListResponse{Favorites: favorites}, nil
	}

	var records []favoriteFileRecord
	var err error

	if cursor == "" {
		records, err = s.repo.FindAllByUserID(ctx, s.db, userID, limit+1)
	} else {
		parts := strings.SplitN(cursor, "|", 2)
		if len(parts) != 2 {
			return FavoritesListResponse{}, apperror.Validation("некорректный курсор")
		}
		cursorTime, err := time.Parse(time.RFC3339Nano, parts[0])
		if err != nil {
			return FavoritesListResponse{}, apperror.Validation("некорректный курсор")
		}
		records, err = s.repo.FindAllByUserIDAfterCursor(ctx, s.db, userID, cursorTime, parts[1], limit)
	}
	if err != nil {
		return FavoritesListResponse{}, apperror.WrapInternal("получение списка избранного", err)
	}

	hasMore := len(records) > limit
	if hasMore {
		records = records[:limit]
	}

	favorites := make([]FavoriteFileResponse, 0, len(records))
	for _, rec := range records {
		favorites = append(favorites, toFavoriteResponse(rec))
	}

	resp := FavoritesListResponse{Favorites: favorites}

	if hasMore && len(records) > 0 {
		last := records[len(records)-1]
		nextCursor := last.FavoritedAt.UTC().Format(time.RFC3339Nano) + "|" + last.ID
		resp.NextCursor = &nextCursor
	}

	return resp, nil
}

func toFavoriteResponse(f favoriteFileRecord) FavoriteFileResponse {
	return FavoriteFileResponse{
		ID:          f.ID,
		Filename:    f.Filename,
		Extension:   f.Extension,
		MimeType:    f.MimeType,
		Size:        f.Size,
		DirectoryID: f.DirectoryID,
		OwnerID:     f.OwnerID,
		CreatedAt:   f.CreatedAt,
		UpdatedAt:   f.UpdatedAt,
		FavoritedAt: f.FavoritedAt,
	}
}
