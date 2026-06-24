package favorites

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sharedspace/internal/apperror"
)

type Service struct {
	beginTx beginTxFunc
	db      dbTX
	repo    RepositoryInterface
}

func NewService(pool *pgxpool.Pool, repo RepositoryInterface) *Service {
	beginTx := func(ctx context.Context, opts pgx.TxOptions) (transaction, error) {
		tx, err := pool.BeginTx(ctx, opts)
		if err != nil {
			return nil, err
		}
		return txWrapper{Tx: tx}, nil
	}
	return &Service{beginTx: beginTx, db: pool, repo: repo}
}

func (s *Service) Add(ctx context.Context, userID, fileID string) error {
	if err := s.repo.FindFileByID(ctx, s.db, fileID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperror.NotFound("файл не найден")
		}
		return apperror.WrapInternal("проверка существования файла", err)
	}

	if err := s.repo.Insert(ctx, s.db, userID, fileID); err != nil {
		return apperror.WrapInternal("добавление в избранное", err)
	}

	return nil
}

func (s *Service) Remove(ctx context.Context, userID, fileID string) error {
	if err := s.repo.FindFileByID(ctx, s.db, fileID); err != nil {
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

func (s *Service) List(ctx context.Context, userID string, limit int) (FavoritesListResponse, error) {
	records, err := s.repo.FindAllByUserID(ctx, s.db, userID, limit)
	if err != nil {
		return FavoritesListResponse{}, apperror.WrapInternal("получение списка избранного", err)
	}

	favorites := make([]FavoriteFileResponse, 0, len(records))
	for _, rec := range records {
		favorites = append(favorites, toFavoriteResponse(rec))
	}

	return FavoritesListResponse{Favorites: favorites}, nil
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
