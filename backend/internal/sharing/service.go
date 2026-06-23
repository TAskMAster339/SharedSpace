package sharing

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
	return &Service{
		beginTx: beginTx,
		db:      pool,
		repo:    repo,
	}
}

func (s *Service) GetSharedWithMe(ctx context.Context, userID string) ([]SharedDirectoryResponse, error) {
	records, err := s.repo.FindByMember(ctx, s.db, userID)
	if err != nil {
		return nil, apperror.WrapInternal("ошибка поиска общих директорий", err)
	}

	resp := make([]SharedDirectoryResponse, 0, len(records))
	for _, r := range records {
		resp = append(resp, SharedDirectoryResponse{
			ID:          r.ID,
			DirectoryID: r.DirectoryID,
			Name:        r.Name,
			OwnerID:     r.OwnerID,
			OwnerName:   r.OwnerName,
			Role:        Role(r.Role),
			CreatedAt:   r.CreatedAt,
		})
	}
	return resp, nil
}

func (s *Service) GetMembers(ctx context.Context, userID, sharedDirID string) ([]MemberResponse, error) {
	sd, err := s.repo.FindByID(ctx, s.db, sharedDirID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperror.NotFound("общая директория не найдена")
		}
		return nil, apperror.WrapInternal("ошибка поиска общей директории", err)
	}

	if sd.OwnerID != userID {
		members, err := s.repo.FindMembers(ctx, s.db, sharedDirID)
		if err != nil {
			return nil, apperror.WrapInternal("ошибка поиска участников", err)
		}
		var isMember bool
		for _, m := range members {
			if m.UserID == userID {
				isMember = true
				break
			}
		}
		if !isMember {
			return nil, apperror.Forbidden("доступ запрещён")
		}
		return toMemberResponses(members), nil
	}

	members, err := s.repo.FindMembers(ctx, s.db, sharedDirID)
	if err != nil {
		return nil, apperror.WrapInternal("ошибка поиска участников", err)
	}
	return toMemberResponses(members), nil
}

func toMemberResponses(records []memberRecord) []MemberResponse {
	resp := make([]MemberResponse, 0, len(records))
	for _, m := range records {
		resp = append(resp, MemberResponse{
			ID:       m.ID,
			UserID:   m.UserID,
			Username: m.Username,
			Role:     Role(m.Role),
			JoinedAt: m.JoinedAt,
		})
	}
	return resp
}
