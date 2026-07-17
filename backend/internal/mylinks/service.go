package mylinks

import (
	"context"
	"strings"
	"time"

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

func (s *Service) List(ctx context.Context, userID string, limit int, cursor string) (LinksListResponse, error) {
	if limit == 0 {
		records, err := s.repo.FindAllByUserID(ctx, s.db, userID, 0)
		if err != nil {
			return LinksListResponse{}, apperror.WrapInternal("получение списка ссылок", err)
		}
		return LinksListResponse{Items: toResponses(records)}, nil
	}

	var records []linkItemRecord
	var err error

	if cursor == "" {
		records, err = s.repo.FindAllByUserID(ctx, s.db, userID, limit+1)
	} else {
		parts := strings.SplitN(cursor, "|", 2)
		if len(parts) != 2 {
			return LinksListResponse{}, apperror.Validation("некорректный курсор")
		}
		cursorTime, err := time.Parse(time.RFC3339Nano, parts[0])
		if err != nil {
			return LinksListResponse{}, apperror.Validation("некорректный курсор")
		}
		records, err = s.repo.FindAllByUserIDAfterCursor(ctx, s.db, userID, cursorTime, parts[1], limit)
	}
	if err != nil {
		return LinksListResponse{}, apperror.WrapInternal("получение списка ссылок", err)
	}

	hasMore := len(records) > limit
	if hasMore {
		records = records[:limit]
	}

	resp := LinksListResponse{Items: toResponses(records)}

	if hasMore && len(records) > 0 {
		last := records[len(records)-1]
		nextCursor := last.LinkCreatedAt.UTC().Format(time.RFC3339Nano) + "|" + last.LinkID
		resp.NextCursor = &nextCursor
	}

	return resp, nil
}

func toResponses(records []linkItemRecord) []LinkItemResponse {
	if len(records) == 0 {
		return nil
	}
	items := make([]LinkItemResponse, len(records))
	for i, rec := range records {
		items[i] = LinkItemResponse{
			ID:            rec.ID,
			ItemType:      rec.ItemType,
			Filename:      rec.Filename,
			Extension:     rec.Extension,
			MimeType:      rec.MimeType,
			Size:          rec.Size,
			DirectoryID:   rec.DirectoryID,
			OwnerID:       rec.OwnerID,
			CreatedAt:     rec.CreatedAt,
			UpdatedAt:     rec.UpdatedAt,
			LinkToken:     rec.LinkToken,
			LinkID:        rec.LinkID,
			IsActive:      rec.IsActive,
			LinkCreatedAt: rec.LinkCreatedAt,
		}
	}
	return items
}
