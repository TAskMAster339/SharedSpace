package dirs

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"sharedspace/internal/access"
	"sharedspace/internal/apperror"
)

type Service struct {
	beginTx       beginTxFunc
	db            dbTX
	repo          RepositoryInterface
	sharingRepo   SharingRepository
	accessChecker access.AccessChecker
}

func NewService(pool *pgxpool.Pool, repo RepositoryInterface, sharingRepo SharingRepository, accessChecker access.AccessChecker) *Service {
	beginTx := func(ctx context.Context, opts pgx.TxOptions) (transaction, error) {
		tx, err := pool.BeginTx(ctx, opts)
		if err != nil {
			return nil, err
		}
		return txWrapper{Tx: tx}, nil
	}
	return &Service{
		beginTx:       beginTx,
		db:            pool,
		repo:          repo,
		sharingRepo:   sharingRepo,
		accessChecker: accessChecker,
	}
}

func (s *Service) GetRootContents(ctx context.Context, userID string) (DirectoryContentsResponse, error) {
	root, err := s.repo.FindRootByOwner(ctx, s.db, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return DirectoryContentsResponse{}, apperror.NotFound("корневая директория не найдена")
		}
		return DirectoryContentsResponse{}, apperror.WrapInternal("ошибка поиска корневой директории", err)
	}
	return s.loadContents(ctx, root)
}

func (s *Service) GetContents(ctx context.Context, userID, dirID string) (DirectoryContentsResponse, error) {
	dir, err := s.repo.FindByID(ctx, s.db, dirID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return DirectoryContentsResponse{}, apperror.NotFound("директория не найдена")
		}
		return DirectoryContentsResponse{}, apperror.WrapInternal("ошибка поиска директории", err)
	}
	ok, err := s.accessChecker.Can(ctx, userID, dirID, access.ActionView)
	if err != nil {
		return DirectoryContentsResponse{}, err
	}
	if !ok {
		return DirectoryContentsResponse{}, apperror.Forbidden("доступ запрещён")
	}
	return s.loadContents(ctx, dir)
}

func (s *Service) GetByID(ctx context.Context, userID, dirID string) (DirectoryResponse, error) {
	dir, err := s.repo.FindByID(ctx, s.db, dirID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return DirectoryResponse{}, apperror.NotFound("директория не найдена")
		}
		return DirectoryResponse{}, apperror.WrapInternal("ошибка поиска директории", err)
	}
	ok, err := s.accessChecker.Can(ctx, userID, dirID, access.ActionView)
	if err != nil {
		return DirectoryResponse{}, err
	}
	if !ok {
		return DirectoryResponse{}, apperror.Forbidden("доступ запрещён")
	}
	return toDirectoryResponse(dir), nil
}

func (s *Service) Create(ctx context.Context, userID string, req CreateDirectoryRequest) (DirectoryResponse, error) {
	req.Name = strings.TrimSpace(req.Name)
	req.ParentID = strings.TrimSpace(req.ParentID)

	if req.Name == "" {
		return DirectoryResponse{}, apperror.Validation("название обязательно")
	}
	if req.ParentID == "" {
		return DirectoryResponse{}, apperror.Validation("parent_id обязателен")
	}

	_, err := s.repo.FindByID(ctx, s.db, req.ParentID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return DirectoryResponse{}, apperror.NotFound("родительская директория не найдена")
		}
		return DirectoryResponse{}, apperror.WrapInternal("ошибка поиска родительской директории", err)
	}
	ok, err := s.accessChecker.Can(ctx, userID, req.ParentID, access.ActionCreateFolder)
	if err != nil {
		return DirectoryResponse{}, err
	}
	if !ok {
		return DirectoryResponse{}, apperror.Forbidden("доступ запрещён")
	}

	if _, err := s.repo.FindByNameAndParent(ctx, s.db, req.Name, req.ParentID, userID); err == nil {
		return DirectoryResponse{}, apperror.Conflict("директория с таким названием уже существует в родительской")
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return DirectoryResponse{}, apperror.WrapInternal("ошибка проверки дубликата имени", err)
	}

	tx, err := s.beginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return DirectoryResponse{}, apperror.WrapInternal("ошибка начала транзакции", err)
	}
	defer tx.Rollback(ctx)

	dir, err := s.repo.Create(ctx, tx, req.Name, userID, req.ParentID)
	if err != nil {
		if isUniqueViolation(err) {
			return DirectoryResponse{}, apperror.Conflict("директория с таким названием уже существует")
		}
		return DirectoryResponse{}, apperror.WrapInternal("ошибка создания директории", err)
	}

	if req.Shared {
		if err := s.sharingRepo.CreateShared(ctx, tx, dir.ID, userID); err != nil {
			return DirectoryResponse{}, apperror.WrapInternal("ошибка создания общей директории", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return DirectoryResponse{}, apperror.WrapInternal("ошибка сохранения директории", err)
	}

	return toDirectoryResponse(dir), nil
}

func (s *Service) Update(ctx context.Context, userID, dirID string, req UpdateDirectoryRequest) (DirectoryResponse, error) {
	if req.Name != nil {
		trimmed := strings.TrimSpace(*req.Name)
		req.Name = &trimmed
		if *req.Name == "" {
			return DirectoryResponse{}, apperror.Validation("название не может быть пустым")
		}
	}
	if req.ParentID != nil {
		trimmed := strings.TrimSpace(*req.ParentID)
		req.ParentID = &trimmed
	}

	if req.Name == nil && req.ParentID == nil {
		return DirectoryResponse{}, apperror.Validation("требуется хотя бы одно поле (name или parent_id)")
	}

	dir, err := s.repo.FindByID(ctx, s.db, dirID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return DirectoryResponse{}, apperror.NotFound("директория не найдена")
		}
		return DirectoryResponse{}, apperror.WrapInternal("ошибка поиска директории", err)
	}
	ok, err := s.accessChecker.Can(ctx, userID, dirID, access.ActionDelete)
	if err != nil {
		return DirectoryResponse{}, err
	}
	if !ok {
		return DirectoryResponse{}, apperror.Forbidden("доступ запрещён")
	}
	if dir.Type == "root" {
		return DirectoryResponse{}, apperror.Forbidden("нельзя переименовать или переместить корневую директорию")
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
		_, err := s.repo.FindByID(ctx, s.db, *targetParent)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return DirectoryResponse{}, apperror.NotFound("целевая родительская директория не найдена")
			}
			return DirectoryResponse{}, apperror.WrapInternal("ошибка поиска целевой родительской директории", err)
		}
		ok, err = s.accessChecker.Can(ctx, userID, *targetParent, access.ActionCreateFolder)
		if err != nil {
			return DirectoryResponse{}, err
		}
		if !ok {
			return DirectoryResponse{}, apperror.Forbidden("доступ к целевой родительской директории запрещён")
		}
	}

	if _, err := s.repo.FindByNameAndParent(ctx, s.db, targetName, *targetParent, userID); err == nil {
		return DirectoryResponse{}, apperror.Conflict("директория с таким названием уже существует в целевом расположении")
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return DirectoryResponse{}, apperror.WrapInternal("ошибка проверки дубликата имени", err)
	}

	tx, err := s.beginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return DirectoryResponse{}, apperror.WrapInternal("ошибка начала транзакции", err)
	}
	defer tx.Rollback(ctx)

	updated, err := s.repo.UpdateNameAndParent(ctx, tx, dirID, req.Name, req.ParentID)
	if err != nil {
		if isUniqueViolation(err) {
			return DirectoryResponse{}, apperror.Conflict("директория с таким названием уже существует в целевом расположении")
		}
		return DirectoryResponse{}, apperror.WrapInternal("ошибка обновления директории", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return DirectoryResponse{}, apperror.WrapInternal("ошибка сохранения обновления директории", err)
	}

	return toDirectoryResponse(updated), nil
}

func (s *Service) loadContents(ctx context.Context, dir directoryRecord) (DirectoryContentsResponse, error) {
	subdirs, err := s.repo.FindSubdirectories(ctx, s.db, dir.ID)
	if err != nil {
		return DirectoryContentsResponse{}, apperror.WrapInternal("ошибка поиска поддиректорий", err)
	}

	files, err := s.repo.FindFiles(ctx, s.db, dir.ID)
	if err != nil {
		return DirectoryContentsResponse{}, apperror.WrapInternal("ошибка поиска файлов", err)
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
