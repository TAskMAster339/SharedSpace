package dirs

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

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
	storage       StorageClient
}

func NewService(pool *pgxpool.Pool, repo RepositoryInterface, sharingRepo SharingRepository, accessChecker access.AccessChecker, storage StorageClient) *Service {
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
		storage:       storage,
	}
}

func (s *Service) GetRootContents(ctx context.Context, userID string, params ContentsPaginationParams) (*DirectoryContentsResponse, error) {
	root, err := s.repo.FindRootByOwner(ctx, s.db, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperror.NotFound("корневая директория не найдена")
		}
		return nil, apperror.WrapInternal("ошибка поиска корневой директории", err)
	}
	return s.loadContentsPaginated(ctx, userID, root, params)
}

func (s *Service) GetContents(ctx context.Context, userID, dirID string, params ContentsPaginationParams) (*DirectoryContentsResponse, error) {
	dir, err := s.repo.FindByID(ctx, s.db, dirID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperror.NotFound("директория не найдена")
		}
		return nil, apperror.WrapInternal("ошибка поиска директории", err)
	}
	ok, err := s.accessChecker.Can(ctx, userID, dirID, access.ActionView)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, apperror.Forbidden("доступ запрещён")
	}
	return s.loadContentsPaginated(ctx, userID, dir, params)
}

func (s *Service) loadContentsPaginated(ctx context.Context, userID string, dir directoryRecord, params ContentsPaginationParams) (*DirectoryContentsResponse, error) {
	dirsLimit := params.DirsLimit
	filesLimit := params.FilesLimit

	if dirsLimit == 0 && filesLimit == 0 {
		resp, err := s.loadContents(ctx, userID, dir)
		if err != nil {
			return nil, err
		}
		return &resp, nil
	}

	if dirsLimit == 0 {
		dirsLimit = 20
	}
	if filesLimit == 0 {
		filesLimit = 20
	}

	var subdirs []directoryRecord
	var nextDirsCursor string
	var dirsHasMore bool
	var err error

	if params.DirsCursor != "" {
		cursorParts := strings.SplitN(params.DirsCursor, "|", 2)
		if len(cursorParts) != 2 {
			return nil, apperror.Validation("некорректный курсор для директорий")
		}
		subdirs, dirsHasMore, nextDirsCursor, err = s.repo.FindSubdirectoriesAfterCursor(ctx, s.db, dir.ID, cursorParts[0], cursorParts[1], dirsLimit)
	} else {
		subdirs, dirsHasMore, nextDirsCursor, err = s.repo.FindSubdirectoriesAfterCursor(ctx, s.db, dir.ID, "", "", dirsLimit)
	}
	if err != nil {
		return nil, apperror.WrapInternal("ошибка поиска поддиректорий", err)
	}

	var files []fileRecord
	var nextFilesCursor string
	var filesHasMore bool

	if params.FilesCursor != "" {
		cursorParts := strings.SplitN(params.FilesCursor, "|", 2)
		if len(cursorParts) != 2 {
			return nil, apperror.Validation("некорректный курсор для файлов")
		}
		files, filesHasMore, nextFilesCursor, err = s.repo.FindFilesAfterCursor(ctx, s.db, dir.ID, cursorParts[0], cursorParts[1], filesLimit)
	} else {
		files, filesHasMore, nextFilesCursor, err = s.repo.FindFilesAfterCursor(ctx, s.db, dir.ID, "", "", filesLimit)
	}
	if err != nil {
		return nil, apperror.WrapInternal("ошибка поиска файлов", err)
	}

	subdirResponses := make([]DirectoryResponse, 0, len(subdirs))
	for _, sd := range subdirs {
		subdirResponses = append(subdirResponses, s.toDirectoryResponse(ctx, userID, sd))
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

	dirIDs := make([]string, len(subdirs))
	for i, sd := range subdirs {
		dirIDs[i] = sd.ID
	}
	fileIDs := make([]string, len(files))
	for i, f := range files {
		fileIDs[i] = f.ID
	}

	fileLinks, dirLinks, err := s.repo.CheckShareLinks(ctx, s.db, fileIDs, dirIDs)
	if err == nil {
		for i := range subdirResponses {
			subdirResponses[i].HasShareLinks = dirLinks[subdirResponses[i].ID]
		}
		for i := range fileItems {
			fileItems[i].HasShareLinks = fileLinks[fileItems[i].ID]
		}
	}

	resp := &DirectoryContentsResponse{
		ID:             dir.ID,
		Name:           dir.Name,
		Subdirectories: subdirResponses,
		Files:          fileItems,
	}

	if dirsHasMore && nextDirsCursor != "" {
		resp.NextDirsCursor = &nextDirsCursor
	}
	if filesHasMore && nextFilesCursor != "" {
		resp.NextFilesCursor = &nextFilesCursor
	}

	return resp, nil
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
	resp := s.toDirectoryResponse(ctx, userID, dir)
	_, dirLinks, err := s.repo.CheckShareLinks(ctx, s.db, nil, []string{dirID})
	if err == nil {
		resp.HasShareLinks = dirLinks[dirID]
	}
	return resp, nil
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
		if err := s.repo.RecalcSharedDirsCount(ctx, tx, userID); err != nil {
			return DirectoryResponse{}, apperror.WrapInternal("ошибка обновления счётчика", err)
		}
		count, quota, err := s.repo.GetSharedDirsStats(ctx, tx, userID)
		if err != nil {
			return DirectoryResponse{}, apperror.WrapInternal("ошибка получения статистики общих директорий", err)
		}
		if count >= quota {
			return DirectoryResponse{}, apperror.Validation(
				fmt.Sprintf("достигнут лимит общих директорий (%d из %d)", count, quota),
			)
		}
		if err := s.sharingRepo.CreateShared(ctx, tx, dir.ID, userID); err != nil {
			return DirectoryResponse{}, apperror.WrapInternal("ошибка создания общей директории", err)
		}
		if err := s.repo.IncrementSharedDirsCount(ctx, tx, userID); err != nil {
			return DirectoryResponse{}, apperror.WrapInternal("ошибка обновления счётчика", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return DirectoryResponse{}, apperror.WrapInternal("ошибка сохранения директории", err)
	}

	return s.toDirectoryResponse(ctx, userID, dir), nil
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
	// rename-only: check ActionRename; move: check ActionDelete
	checkAction := access.ActionRename
	if req.ParentID != nil {
		checkAction = access.ActionDelete
	}
	ok, err := s.accessChecker.Can(ctx, userID, dirID, checkAction)
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
		if *req.ParentID == dirID {
			return DirectoryResponse{}, apperror.Validation("нельзя переместить папку саму в себя")
		}
		targetParent = req.ParentID
	}
	targetName := dir.Name
	if req.Name != nil {
		targetName = *req.Name
	}

	if req.ParentID != nil && targetParent != nil {
		_, err := s.repo.FindByID(ctx, s.db, *targetParent)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return DirectoryResponse{}, apperror.NotFound("целевая родительская директория не найдена")
			}
			return DirectoryResponse{}, apperror.WrapInternal("ошибка поиска целевой родительской директории", err)
		}

		descendantIDs, err := s.repo.FindSubtreeIDs(ctx, s.db, dirID)
		if err != nil {
			return DirectoryResponse{}, apperror.WrapInternal("ошибка проверки вложенности директорий", err)
		}
		for _, id := range descendantIDs {
			if id == *targetParent {
				return DirectoryResponse{}, apperror.Validation("нельзя переместить папку в одну из её вложенных папок")
			}
		}

		ok, err = s.accessChecker.Can(ctx, userID, *targetParent, access.ActionCreateFolder)
		if err != nil {
			return DirectoryResponse{}, err
		}
		if !ok {
			return DirectoryResponse{}, apperror.Forbidden("доступ к целевой родительской директории запрещён")
		}
	}

	if _, err := s.repo.FindByNameAndParent(ctx, s.db, targetName, *targetParent, dir.OwnerID); err == nil {
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

	return s.toDirectoryResponse(ctx, userID, updated), nil
}

func (s *Service) loadContents(ctx context.Context, userID string, dir directoryRecord) (DirectoryContentsResponse, error) {
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
		subdirResponses = append(subdirResponses, s.toDirectoryResponse(ctx, userID, sd))
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

	dirIDs := make([]string, len(subdirs))
	for i, sd := range subdirs {
		dirIDs[i] = sd.ID
	}
	fileIDs := make([]string, len(files))
	for i, f := range files {
		fileIDs[i] = f.ID
	}

	fileLinks, dirLinks, err := s.repo.CheckShareLinks(ctx, s.db, fileIDs, dirIDs)
	if err == nil {
		for i := range subdirResponses {
			subdirResponses[i].HasShareLinks = dirLinks[subdirResponses[i].ID]
		}
		for i := range fileItems {
			fileItems[i].HasShareLinks = fileLinks[fileItems[i].ID]
		}
	}

	return DirectoryContentsResponse{
		ID:             dir.ID,
		Name:           dir.Name,
		Subdirectories: subdirResponses,
		Files:          fileItems,
	}, nil
}

func (s *Service) GetPath(ctx context.Context, userID, dirID string) (DirectoryPathResponse, error) {
	_, err := s.repo.FindByID(ctx, s.db, dirID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return DirectoryPathResponse{}, apperror.NotFound("директория не найдена")
		}
		return DirectoryPathResponse{}, apperror.WrapInternal("ошибка поиска директории", err)
	}
	ok, err := s.accessChecker.Can(ctx, userID, dirID, access.ActionView)
	if err != nil {
		return DirectoryPathResponse{}, err
	}
	if !ok {
		return DirectoryPathResponse{}, apperror.Forbidden("доступ запрещён")
	}

	ancestors, err := s.repo.FindAncestorsPath(ctx, s.db, dirID)
	if err != nil {
		return DirectoryPathResponse{}, apperror.WrapInternal("ошибка построения пути", err)
	}

	// Find the breadcrumb root: either the topmost shared ancestor or the root dir
	startIdx := 0
	for i, a := range ancestors {
		if a.IsShared {
			startIdx = i
			break
		}
	}

	path := make([]BreadcrumbItem, 0, len(ancestors)-startIdx)
	for _, a := range ancestors[startIdx:] {
		path = append(path, BreadcrumbItem{
			ID:       a.ID,
			Name:     a.Name,
			Type:     a.Type,
			IsShared: a.IsShared,
		})
	}

	return DirectoryPathResponse{Path: path}, nil
}

func (s *Service) toDirectoryResponse(ctx context.Context, userID string, d directoryRecord) DirectoryResponse {
	perms, _ := s.accessChecker.GetPermissions(ctx, userID, d.ID)
	sharedDirID, _ := s.accessChecker.GetSharedDirectoryID(ctx, userID, d.ID)
	return DirectoryResponse{
		ID:                d.ID,
		Name:              d.Name,
		OwnerID:           d.OwnerID,
		ParentID:          d.ParentID,
		Type:              d.Type,
		FilesCount:        d.FilesCount,
		CreatedAt:         d.CreatedAt,
		UpdatedAt:         d.UpdatedAt,
		Permissions:       perms,
		SharedDirectoryID: sharedDirID,
	}
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

func (s *Service) SoftDelete(ctx context.Context, userID, dirID string) error {
	dir, err := s.repo.FindByIDAnyState(ctx, s.db, dirID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperror.NotFound("директория не найдена")
		}
		return apperror.WrapInternal("поиск директории", err)
	}
	ok, err := s.accessChecker.Can(ctx, userID, dirID, access.ActionDelete)
	if err != nil {
		return err
	}
	if !ok {
		return apperror.Forbidden("доступ запрещён")
	}
	if dir.Type == "root" {
		return apperror.Forbidden("нельзя удалить корневую директорию")
	}
	if dir.DeletedAt != nil {
		return apperror.Validation("директория уже в корзине")
	}

	ids, err := s.repo.FindSubtreeIDs(ctx, s.db, dirID)
	if err != nil {
		return apperror.WrapInternal("обход поддерева", err)
	}

	aliveFiles, err := s.repo.FindFilesInDirs(ctx, s.db, ids)
	if err != nil {
		return apperror.WrapInternal("поиск активных файлов", err)
	}

	tx, err := s.beginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return apperror.WrapInternal("начало транзакции", err)
	}
	defer tx.Rollback(ctx)

	at := time.Now().UTC()
	if err := s.repo.SoftDeleteFilesInDirs(ctx, tx, ids, at); err != nil {
		return apperror.WrapInternal("удаление файлов", err)
	}
	if err := s.repo.SoftDeleteSubtree(ctx, tx, ids, at); err != nil {
		return apperror.WrapInternal("удаление директорий", err)
	}

	if len(aliveFiles) > 0 && dir.ParentID != nil {
		if err := s.repo.IncrementFilesCount(ctx, tx, *dir.ParentID, -len(aliveFiles)); err != nil {
			return apperror.WrapInternal("обновление счётчика файлов", err)
		}
	}

	if err := s.repo.RecalcSharedDirsCount(ctx, tx, dir.OwnerID); err != nil {
		return apperror.WrapInternal("обновление счётчика общих директорий", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return apperror.WrapInternal("сохранение", err)
	}
	return nil
}

func (s *Service) Restore(ctx context.Context, userID, dirID string) error {
	dir, err := s.repo.FindByIDAnyState(ctx, s.db, dirID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperror.NotFound("директория не найдена")
		}
		return apperror.WrapInternal("поиск директории", err)
	}
	ok, err := s.accessChecker.Can(ctx, userID, dirID, access.ActionDelete)
	if err != nil {
		return err
	}
	if !ok {
		return apperror.Forbidden("доступ запрещён")
	}
	if dir.DeletedAt == nil {
		return apperror.Validation("директория не в корзине")
	}

	if dir.ParentID != nil {
		parent, err := s.repo.FindByIDAnyState(ctx, s.db, *dir.ParentID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return apperror.Conflict("родитель не существует")
			}
			return apperror.WrapInternal("поиск родителя", err)
		}
		if parent.DeletedAt != nil {
			return apperror.Conflict("сначала восстановите родительскую директорию")
		}

		if _, err := s.repo.FindByNameAndParent(ctx, s.db, dir.Name, *dir.ParentID, dir.OwnerID); err == nil {
			return apperror.Conflict("невозможно восстановить директорию: директория с таким именем уже существует")
		}
	}

	isShared, err := s.sharingRepo.FindByDirectoryID(ctx, s.db, dirID)
	if err != nil {
		return apperror.WrapInternal("проверка общей директории", err)
	}

	ids, err := s.repo.FindSubtreeIDs(ctx, s.db, dirID)
	if err != nil {
		return apperror.WrapInternal("обход поддерева", err)
	}

	tx, err := s.beginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return apperror.WrapInternal("начало транзакции", err)
	}
	defer tx.Rollback(ctx)

	if isShared {
		if err := s.repo.RecalcSharedDirsCount(ctx, tx, dir.OwnerID); err != nil {
			return apperror.WrapInternal("обновление счётчика", err)
		}
		count, quota, err := s.repo.GetSharedDirsStats(ctx, tx, dir.OwnerID)
		if err != nil {
			return apperror.WrapInternal("получение статистики общих директорий", err)
		}
		if count >= quota {
			return apperror.Validation(
				fmt.Sprintf("невозможно восстановить директорию: достигнут лимит %d/%d", count, quota),
			)
		}
	}

	restoredFiles, err := s.repo.FindDeletedFilesInDirs(ctx, s.db, ids)
	if err != nil {
		return apperror.WrapInternal("поиск восстанавливаемых файлов", err)
	}

	if err := s.repo.RestoreFilesInDirs(ctx, tx, ids, *dir.DeletedAt); err != nil {
		return apperror.WrapInternal("восстановление файлов", err)
	}
	if err := s.repo.RestoreSubtree(ctx, tx, ids); err != nil {
		return apperror.WrapInternal("восстановление директорий", err)
	}

	if len(restoredFiles) > 0 && dir.ParentID != nil {
		if err := s.repo.IncrementFilesCount(ctx, tx, *dir.ParentID, len(restoredFiles)); err != nil {
			return apperror.WrapInternal("обновление счётчика файлов", err)
		}
	}

	if err := s.repo.RecalcSharedDirsCount(ctx, tx, dir.OwnerID); err != nil {
		return apperror.WrapInternal("обновление счётчика общих директорий", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return apperror.WrapInternal("сохранение", err)
	}
	return nil
}

func (s *Service) PermanentDelete(ctx context.Context, userID, dirID string) error {
	dir, err := s.repo.FindByIDAnyState(ctx, s.db, dirID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperror.NotFound("директория не найдена")
		}
		return apperror.WrapInternal("поиск директории", err)
	}
	ok, err := s.accessChecker.Can(ctx, userID, dirID, access.ActionDelete)
	if err != nil {
		return err
	}
	if !ok {
		return apperror.Forbidden("доступ запрещён")
	}
	if dir.Type == "root" {
		return apperror.Forbidden("нельзя удалить корневую директорию")
	}

	ids, err := s.repo.FindSubtreeIDs(ctx, s.db, dirID)
	if err != nil {
		return apperror.WrapInternal("обход поддерева", err)
	}

	alive, err := s.repo.FindFilesInDirs(ctx, s.db, ids)
	if err != nil {
		return apperror.WrapInternal("поиск файлов", err)
	}
	deleted, err := s.repo.FindDeletedFilesInDirs(ctx, s.db, ids)
	if err != nil {
		return apperror.WrapInternal("поиск удалённых файлов", err)
	}
	allFiles := append(alive, deleted...)

	freedByOwner := map[string]int64{}
	for _, f := range allFiles {
		freedByOwner[f.OwnerID] += f.Size
	}

	tx, err := s.beginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return apperror.WrapInternal("начало транзакции", err)
	}
	defer tx.Rollback(ctx)

	if err := s.repo.HardDeleteSubtree(ctx, tx, ids); err != nil {
		return apperror.WrapInternal("удаление директорий", err)
	}
	for owner, freed := range freedByOwner {
		if freed > 0 {
			if err := s.repo.AddUserStorageUsed(ctx, tx, owner, -freed); err != nil {
				return apperror.WrapInternal("обновление объёма", err)
			}
		}
	}
	for _, f := range allFiles {
		if err := s.storage.Delete(ctx, f.ObjectKey); err != nil {
			return apperror.WrapInternal("удаление объекта из хранилища", err)
		}
	}

	if len(alive) > 0 && dir.ParentID != nil {
		if err := s.repo.IncrementFilesCount(ctx, tx, *dir.ParentID, -len(alive)); err != nil {
			return apperror.WrapInternal("обновление счётчика файлов", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return apperror.WrapInternal("сохранение", err)
	}
	return nil
}
