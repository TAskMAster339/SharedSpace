package dirs

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
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

func (s *Service) GetRootContents(ctx context.Context, userID string) (DirectoryContentsResponse, error) {
	root, err := s.repo.FindRootByOwner(ctx, s.db, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return DirectoryContentsResponse{}, apperror.NotFound("root directory not found")
		}
		return DirectoryContentsResponse{}, apperror.WrapInternal("find root directory", err)
	}
	return s.loadContents(ctx, root)
}

func (s *Service) GetContents(ctx context.Context, userID, dirID string) (DirectoryContentsResponse, error) {
	dir, err := s.repo.FindByID(ctx, s.db, dirID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return DirectoryContentsResponse{}, apperror.NotFound("directory not found")
		}
		return DirectoryContentsResponse{}, apperror.WrapInternal("find directory", err)
	}
	if dir.OwnerID != userID {
		return DirectoryContentsResponse{}, apperror.Forbidden("access denied")
	}
	return s.loadContents(ctx, dir)
}

func (s *Service) GetByID(ctx context.Context, userID, dirID string) (DirectoryResponse, error) {
	dir, err := s.repo.FindByID(ctx, s.db, dirID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return DirectoryResponse{}, apperror.NotFound("directory not found")
		}
		return DirectoryResponse{}, apperror.WrapInternal("find directory", err)
	}
	if dir.OwnerID != userID {
		return DirectoryResponse{}, apperror.Forbidden("access denied")
	}
	return toDirectoryResponse(dir), nil
}

func (s *Service) Create(ctx context.Context, userID string, req CreateDirectoryRequest) (DirectoryResponse, error) {
	req.Name = strings.TrimSpace(req.Name)
	req.ParentID = strings.TrimSpace(req.ParentID)

	if req.Name == "" {
		return DirectoryResponse{}, apperror.Validation("name is required")
	}
	if req.ParentID == "" {
		return DirectoryResponse{}, apperror.Validation("parent_id is required")
	}

	parent, err := s.repo.FindByID(ctx, s.db, req.ParentID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return DirectoryResponse{}, apperror.NotFound("parent directory not found")
		}
		return DirectoryResponse{}, apperror.WrapInternal("find parent directory", err)
	}
	if parent.OwnerID != userID {
		return DirectoryResponse{}, apperror.Forbidden("access denied")
	}

	if _, err := s.repo.FindByNameAndParent(ctx, s.db, req.Name, req.ParentID, userID); err == nil {
		return DirectoryResponse{}, apperror.Conflict("a directory with this name already exists in the parent")
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return DirectoryResponse{}, apperror.WrapInternal("check duplicate name", err)
	}

	tx, err := s.beginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return DirectoryResponse{}, apperror.WrapInternal("begin transaction", err)
	}
	defer tx.Rollback(ctx)

	dir, err := s.repo.Create(ctx, tx, req.Name, userID, req.ParentID)
	if err != nil {
		if isUniqueViolation(err) {
			return DirectoryResponse{}, apperror.Conflict("a directory with this name already exists")
		}
		return DirectoryResponse{}, apperror.WrapInternal("create directory", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return DirectoryResponse{}, apperror.WrapInternal("commit create directory", err)
	}

	return toDirectoryResponse(dir), nil
}

func (s *Service) Update(ctx context.Context, userID, dirID string, req UpdateDirectoryRequest) (DirectoryResponse, error) {
	if req.Name != nil {
		trimmed := strings.TrimSpace(*req.Name)
		req.Name = &trimmed
		if *req.Name == "" {
			return DirectoryResponse{}, apperror.Validation("name cannot be empty")
		}
	}
	if req.ParentID != nil {
		trimmed := strings.TrimSpace(*req.ParentID)
		req.ParentID = &trimmed
	}

	if req.Name == nil && req.ParentID == nil {
		return DirectoryResponse{}, apperror.Validation("at least one field (name or parent_id) is required")
	}

	dir, err := s.repo.FindByID(ctx, s.db, dirID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return DirectoryResponse{}, apperror.NotFound("directory not found")
		}
		return DirectoryResponse{}, apperror.WrapInternal("find directory", err)
	}
	if dir.OwnerID != userID {
		return DirectoryResponse{}, apperror.Forbidden("access denied")
	}
	if dir.Type == "root" {
		return DirectoryResponse{}, apperror.Forbidden("cannot rename or move the root directory")
	}

	targetParent := dir.ParentID
	if req.ParentID != nil {
		targetParent = req.ParentID
	}
	targetName := dir.Name
	if req.Name != nil {
		targetName = *req.Name
	}

	if targetParent != nil {
		parent, err := s.repo.FindByID(ctx, s.db, *targetParent)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return DirectoryResponse{}, apperror.NotFound("target parent directory not found")
			}
			return DirectoryResponse{}, apperror.WrapInternal("find target parent", err)
		}
		if parent.OwnerID != userID {
			return DirectoryResponse{}, apperror.Forbidden("access denied to target parent")
		}
	}

	if _, err := s.repo.FindByNameAndParent(ctx, s.db, targetName, *targetParent, userID); err == nil {
		return DirectoryResponse{}, apperror.Conflict("a directory with this name already exists at the target location")
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return DirectoryResponse{}, apperror.WrapInternal("check duplicate name", err)
	}

	tx, err := s.beginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return DirectoryResponse{}, apperror.WrapInternal("begin transaction", err)
	}
	defer tx.Rollback(ctx)

	updated, err := s.repo.UpdateNameAndParent(ctx, tx, dirID, req.Name, req.ParentID)
	if err != nil {
		if isUniqueViolation(err) {
			return DirectoryResponse{}, apperror.Conflict("a directory with this name already exists at the target location")
		}
		return DirectoryResponse{}, apperror.WrapInternal("update directory", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return DirectoryResponse{}, apperror.WrapInternal("commit update directory", err)
	}

	return toDirectoryResponse(updated), nil
}

func (s *Service) loadContents(ctx context.Context, dir directoryRecord) (DirectoryContentsResponse, error) {
	subdirs, err := s.repo.FindSubdirectories(ctx, s.db, dir.ID)
	if err != nil {
		return DirectoryContentsResponse{}, apperror.WrapInternal("find subdirectories", err)
	}

	files, err := s.repo.FindFiles(ctx, s.db, dir.ID)
	if err != nil {
		return DirectoryContentsResponse{}, apperror.WrapInternal("find files", err)
	}

	subdirResponses := make([]DirectoryResponse, 0, len(subdirs))
	for _, sd := range subdirs {
		subdirResponses = append(subdirResponses, toDirectoryResponse(sd))
	}

	fileItems := make([]FileItem, 0, len(files))
	for _, f := range files {
		fileItems = append(fileItems, FileItem{
			ID:        f.ID,
			Filename:  f.Filename,
			Extension: f.Extension,
			MimeType:  f.MimeType,
			Size:      f.Size,
			CreatedAt: f.CreatedAt,
			UpdatedAt: f.UpdatedAt,
		})
	}

	return DirectoryContentsResponse{
		ID:             dir.ID,
		Name:           dir.Name,
		Subdirectories: subdirResponses,
		Files:          fileItems,
	}, nil
}

func toDirectoryResponse(d directoryRecord) DirectoryResponse {
	return DirectoryResponse{
		ID:        d.ID,
		Name:      d.Name,
		OwnerID:   d.OwnerID,
		ParentID:  d.ParentID,
		Type:      d.Type,
		CreatedAt: d.CreatedAt,
		UpdatedAt: d.UpdatedAt,
	}
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
