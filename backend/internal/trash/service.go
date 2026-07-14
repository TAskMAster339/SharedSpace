package trash

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sharedspace/internal/apperror"
	"sharedspace/internal/sharelinks"
)

type Service struct {
	beginTx       beginTxFunc
	db            dbTX
	repo          RepositoryInterface
	storage       StorageClient
	shareLinkRepo *sharelinks.Repository
}

func NewService(pool *pgxpool.Pool, repo RepositoryInterface, storage StorageClient, shareLinkRepo *sharelinks.Repository) *Service {
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
		storage:       storage,
		shareLinkRepo: shareLinkRepo,
	}
}

func (s *Service) GetTrashList(ctx context.Context, userID string, params TrashPaginationParams) (TrashListResponse, error) {
	dirsLimit := params.DirsLimit
	filesLimit := params.FilesLimit

	if dirsLimit == 0 && filesLimit == 0 {
		return s.getAllTrash(ctx, userID)
	}

	if dirsLimit == 0 {
		dirsLimit = 20
	}
	if filesLimit == 0 {
		filesLimit = 20
	}

	var dirs []deletedDirectoryRecord
	var nextDirsCursor string
	var dirsHasMore bool
	var err error

	if params.DirsCursor != "" {
		cursorParts := strings.SplitN(params.DirsCursor, "|", 2)
		if len(cursorParts) != 2 {
			return TrashListResponse{}, apperror.Validation("некорректный курсор для директорий")
		}
		dirs, dirsHasMore, nextDirsCursor, err = s.repo.FindDeletedDirectoriesPaginated(ctx, s.db, userID, dirsLimit, cursorParts[0], cursorParts[1])
	} else {
		dirs, dirsHasMore, nextDirsCursor, err = s.repo.FindDeletedDirectoriesPaginated(ctx, s.db, userID, dirsLimit, "", "")
	}
	if err != nil {
		return TrashListResponse{}, apperror.WrapInternal("ошибка получения удалённых директорий", err)
	}

	var files []deletedFileRecord
	var nextFilesCursor string
	var filesHasMore bool

	if params.FilesCursor != "" {
		cursorParts := strings.SplitN(params.FilesCursor, "|", 2)
		if len(cursorParts) != 2 {
			return TrashListResponse{}, apperror.Validation("некорректный курсор для файлов")
		}
		files, filesHasMore, nextFilesCursor, err = s.repo.FindDeletedFilesPaginated(ctx, s.db, userID, filesLimit, cursorParts[0], cursorParts[1])
	} else {
		files, filesHasMore, nextFilesCursor, err = s.repo.FindDeletedFilesPaginated(ctx, s.db, userID, filesLimit, "", "")
	}
	if err != nil {
		return TrashListResponse{}, apperror.WrapInternal("ошибка получения удалённых файлов", err)
	}

	allDeletedDirIDs := make(map[string]bool)
	for _, d := range dirs {
		allDeletedDirIDs[d.ID] = true
	}

	items := make([]TrashItem, 0, len(dirs)+len(files))
	var totalSize int64

	for _, d := range dirs {
		subtreeIDs, err := s.repo.FindDeletedSubtreeIDs(ctx, s.db, []string{d.ID})
		if err != nil {
			return TrashListResponse{}, apperror.WrapInternal("ошибка получения поддерева", err)
		}

		for _, id := range subtreeIDs {
			allDeletedDirIDs[id] = true
		}

		subtreeFiles, err := s.repo.FindFilesInDeletedDirs(ctx, s.db, subtreeIDs)
		if err != nil {
			return TrashListResponse{}, apperror.WrapInternal("ошибка получения файлов в поддереве", err)
		}

		var dirSize int64
		for _, f := range subtreeFiles {
			dirSize += f.Size
		}

		items = append(items, TrashItem{
			ID:        d.ID,
			Name:      d.Name,
			Type:      "directory",
			OwnerID:   d.OwnerID,
			ParentID:  d.ParentID,
			Size:      dirSize,
			DeletedAt: *d.DeletedAt,
		})
		totalSize += dirSize
	}

	for _, f := range files {
		if !allDeletedDirIDs[f.DirectoryID] {
			items = append(items, TrashItem{
				ID:        f.ID,
				Name:      f.Filename,
				Type:      "file",
				OwnerID:   f.OwnerID,
				ParentID:  &f.DirectoryID,
				Size:      f.Size,
				DeletedAt: *f.DeletedAt,
			})
			totalSize += f.Size
		}
	}

	resp := TrashListResponse{
		Items:     items,
		TotalSize: totalSize,
		Count:     len(items),
	}

	if dirsHasMore && nextDirsCursor != "" {
		resp.NextDirsCursor = &nextDirsCursor
	}
	if filesHasMore && nextFilesCursor != "" {
		resp.NextFilesCursor = &nextFilesCursor
	}

	return resp, nil
}

func (s *Service) getAllTrash(ctx context.Context, userID string) (TrashListResponse, error) {
	dirs, err := s.repo.FindRootDeletedDirectories(ctx, s.db, userID)
	if err != nil {
		return TrashListResponse{}, apperror.WrapInternal("ошибка получения удалённых директорий", err)
	}

	files, err := s.repo.FindDeletedFiles(ctx, s.db, userID)
	if err != nil {
		return TrashListResponse{}, apperror.WrapInternal("ошибка получения удалённых файлов", err)
	}

	allDeletedDirIDs := make(map[string]bool)
	for _, d := range dirs {
		allDeletedDirIDs[d.ID] = true
	}

	items := make([]TrashItem, 0, len(dirs)+len(files))
	var totalSize int64

	for _, d := range dirs {
		subtreeIDs, err := s.repo.FindDeletedSubtreeIDs(ctx, s.db, []string{d.ID})
		if err != nil {
			return TrashListResponse{}, apperror.WrapInternal("ошибка получения поддерева", err)
		}

		for _, id := range subtreeIDs {
			allDeletedDirIDs[id] = true
		}

		subtreeFiles, err := s.repo.FindFilesInDeletedDirs(ctx, s.db, subtreeIDs)
		if err != nil {
			return TrashListResponse{}, apperror.WrapInternal("ошибка получения файлов в поддереве", err)
		}

		var dirSize int64
		for _, f := range subtreeFiles {
			dirSize += f.Size
		}

		items = append(items, TrashItem{
			ID:        d.ID,
			Name:      d.Name,
			Type:      "directory",
			OwnerID:   d.OwnerID,
			ParentID:  d.ParentID,
			Size:      dirSize,
			DeletedAt: *d.DeletedAt,
		})
		totalSize += dirSize
	}

	for _, f := range files {
		if !allDeletedDirIDs[f.DirectoryID] {
			items = append(items, TrashItem{
				ID:        f.ID,
				Name:      f.Filename,
				Type:      "file",
				OwnerID:   f.OwnerID,
				ParentID:  &f.DirectoryID,
				Size:      f.Size,
				DeletedAt: *f.DeletedAt,
			})
			totalSize += f.Size
		}
	}

	return TrashListResponse{
		Items:     items,
		TotalSize: totalSize,
		Count:     len(items),
	}, nil
}

func (s *Service) ClearTrash(ctx context.Context, userID string, itemIDs []string) error {
	if len(itemIDs) == 0 {
		return s.clearAllTrash(ctx, userID)
	}

	return s.clearSelectedItems(ctx, userID, itemIDs)
}

func (s *Service) clearAllTrash(ctx context.Context, userID string) error {
	dirs, err := s.repo.FindRootDeletedDirectories(ctx, s.db, userID)
	if err != nil {
		return apperror.WrapInternal("ошибка получения удалённых директорий", err)
	}

	files, err := s.repo.FindDeletedFiles(ctx, s.db, userID)
	if err != nil {
		return apperror.WrapInternal("ошибка получения удалённых файлов", err)
	}

	dirIDs := make([]string, len(dirs))
	for i, d := range dirs {
		dirIDs[i] = d.ID
	}

	var allDirIDs []string
	for _, dirID := range dirIDs {
		subtree, err := s.repo.FindDeletedSubtreeIDs(ctx, s.db, []string{dirID})
		if err != nil {
			return apperror.WrapInternal("ошибка получения поддерева", err)
		}
		allDirIDs = append(allDirIDs, subtree...)
	}

	filesInDirs, err := s.repo.FindFilesInDeletedDirs(ctx, s.db, allDirIDs)
	if err != nil {
		return apperror.WrapInternal("ошибка получения файлов в директориях", err)
	}

	allFiles := make([]fileForDeleteRecord, 0, len(files)+len(filesInDirs))
	seen := make(map[string]bool, len(files)+len(filesInDirs))
	for _, f := range files {
		if !seen[f.ID] {
			seen[f.ID] = true
			allFiles = append(allFiles, fileForDeleteRecord{
				ID:        f.ID,
				ObjectKey: f.ObjectKey,
				Size:      f.Size,
				OwnerID:   f.OwnerID,
			})
		}
	}
	for _, f := range filesInDirs {
		if !seen[f.ID] {
			seen[f.ID] = true
			allFiles = append(allFiles, f)
		}
	}

	fileIDs := make([]string, 0, len(allFiles))
	for _, f := range allFiles {
		fileIDs = append(fileIDs, f.ID)
	}

	return s.deleteItems(ctx, allDirIDs, fileIDs, allFiles)
}

func (s *Service) clearSelectedItems(ctx context.Context, userID string, itemIDs []string) error {
	var dirIDs, fileIDs []string

	for _, id := range itemIDs {
		dir, err := s.repo.FindDeletedDirectoryByID(ctx, s.db, id)
		if err == nil {
			if dir.OwnerID != userID {
				return apperror.Forbidden("доступ запрещён")
			}
			dirIDs = append(dirIDs, id)
			continue
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return apperror.WrapInternal("ошибка поиска директории", err)
		}

		file, err := s.repo.FindDeletedFileByID(ctx, s.db, id)
		if err == nil {
			if file.OwnerID != userID {
				return apperror.Forbidden("доступ запрещён")
			}
			fileIDs = append(fileIDs, id)
			continue
		}
		if errors.Is(err, pgx.ErrNoRows) {
			return apperror.NotFound("элемент не найден")
		}
		return apperror.WrapInternal("ошибка поиска файла", err)
	}

	var allDirIDs []string
	for _, dirID := range dirIDs {
		subtree, err := s.repo.FindDeletedSubtreeIDs(ctx, s.db, []string{dirID})
		if err != nil {
			return apperror.WrapInternal("ошибка получения поддерева", err)
		}
		allDirIDs = append(allDirIDs, subtree...)
	}

	filesInDirs, err := s.repo.FindFilesInDeletedDirs(ctx, s.db, allDirIDs)
	if err != nil {
		return apperror.WrapInternal("ошибка получения файлов в директориях", err)
	}

	selectedFiles, err := s.repo.FindDeletedFilesByIDs(ctx, s.db, fileIDs)
	if err != nil {
		return apperror.WrapInternal("ошибка получения выбранных файлов", err)
	}

	allFiles := make([]fileForDeleteRecord, 0, len(filesInDirs)+len(selectedFiles))
	seen := make(map[string]bool, len(filesInDirs)+len(selectedFiles))
	for _, f := range filesInDirs {
		if !seen[f.ID] {
			seen[f.ID] = true
			allFiles = append(allFiles, f)
		}
	}
	for _, f := range selectedFiles {
		if !seen[f.ID] {
			seen[f.ID] = true
			allFiles = append(allFiles, fileForDeleteRecord{
				ID:        f.ID,
				ObjectKey: f.ObjectKey,
				Size:      f.Size,
				OwnerID:   f.OwnerID,
			})
		}
	}

	allFileIDs := make([]string, 0, len(allFiles))
	for _, f := range allFiles {
		allFileIDs = append(allFileIDs, f.ID)
	}

	return s.deleteItems(ctx, allDirIDs, allFileIDs, allFiles)
}

func (s *Service) deleteItems(ctx context.Context, dirIDs, fileIDs []string, files []fileForDeleteRecord) error {
	freedByOwner := map[string]int64{}
	for _, f := range files {
		freedByOwner[f.OwnerID] += f.Size
	}

	tx, err := s.beginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return apperror.WrapInternal("ошибка начала транзакции", err)
	}
	defer tx.Rollback(ctx)

	fileCounts, err := s.shareLinkRepo.DeleteByFileIDs(ctx, tx, fileIDs)
	if err != nil {
		return apperror.WrapInternal("ошибка удаления ссылок файлов", err)
	}
	dirCounts, err := s.shareLinkRepo.DeleteByDirectoryIDs(ctx, tx, dirIDs)
	if err != nil {
		return apperror.WrapInternal("ошибка удаления ссылок директорий", err)
	}
	for k, v := range dirCounts {
		fileCounts[k] += v
	}
	if err := s.shareLinkRepo.DecrementShareLinksCounts(ctx, tx, fileCounts); err != nil {
		return apperror.WrapInternal("ошибка обновления счётчика ссылок", err)
	}

	if len(fileIDs) > 0 {
		if err := s.repo.ClearFiles(ctx, tx, fileIDs); err != nil {
			return apperror.WrapInternal("ошибка удаления файлов", err)
		}
	}

	if len(dirIDs) > 0 {
		if err := s.repo.ClearDirectories(ctx, tx, dirIDs); err != nil {
			return apperror.WrapInternal("ошибка удаления директорий", err)
		}
	}

	for ownerID, freed := range freedByOwner {
		if freed > 0 {
			if err := s.repo.AddUserStorageUsed(ctx, tx, ownerID, -freed); err != nil {
				return apperror.WrapInternal("ошибка обновления использованного места", err)
			}
		}
	}

	for _, f := range files {
		if err := s.storage.Delete(ctx, f.ObjectKey); err != nil {
			return apperror.WrapInternal("ошибка удаления файла из хранилища", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return apperror.WrapInternal("ошибка сохранения изменений", err)
	}

	return nil
}
