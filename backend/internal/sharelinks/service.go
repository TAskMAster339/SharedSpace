package sharelinks

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"sharedspace/internal/access"
	"sharedspace/internal/apperror"
)

const tokenBytes = 32

type Service struct {
	beginTx       beginTxFunc
	db            dbTX
	repo          RepositoryInterface
	storage       StorageClient
	accessChecker access.AccessChecker
}

func NewService(pool *pgxpool.Pool, repo RepositoryInterface, storage StorageClient, accessChecker access.AccessChecker) *Service {
	beginTx := func(ctx context.Context, opts pgx.TxOptions) (transaction, error) {
		tx, err := pool.BeginTx(ctx, opts)
		if err != nil {
			return nil, err
		}
		return txWrapper{Tx: tx}, nil
	}
	return &Service{beginTx: beginTx, db: pool, repo: repo, storage: storage, accessChecker: accessChecker}
}

func (s *Service) Create(ctx context.Context, userID, fileID string, req CreateShareLinkRequest) (ShareLinkResponse, error) {
	if req.AccessType != "public" && req.AccessType != "authenticated" {
		return ShareLinkResponse{}, apperror.Validation("access_type должен быть 'public' или 'authenticated'")
	}

	file, err := s.repo.GetFileByID(ctx, s.db, fileID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ShareLinkResponse{}, apperror.NotFound("файл не найден")
		}
		return ShareLinkResponse{}, apperror.WrapInternal("поиск файла", err)
	}

	ok, err := s.accessChecker.Can(ctx, userID, file.DirectoryID, access.ActionCreateLink)
	if err != nil {
		return ShareLinkResponse{}, err
	}
	if !ok {
		return ShareLinkResponse{}, apperror.Forbidden("доступ запрещён")
	}

	return s.createLink(ctx, userID, &fileID, nil, req)
}

func (s *Service) CreateForDirectory(ctx context.Context, userID, dirID string, req CreateShareLinkRequest) (ShareLinkResponse, error) {
	if req.AccessType != "public" && req.AccessType != "authenticated" {
		return ShareLinkResponse{}, apperror.Validation("access_type должен быть 'public' или 'authenticated'")
	}

	_, err := s.repo.GetDirectoryByID(ctx, s.db, dirID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ShareLinkResponse{}, apperror.NotFound("директория не найдена")
		}
		return ShareLinkResponse{}, apperror.WrapInternal("поиск директории", err)
	}

	ok, err := s.accessChecker.Can(ctx, userID, dirID, access.ActionCreateLink)
	if err != nil {
		return ShareLinkResponse{}, err
	}
	if !ok {
		return ShareLinkResponse{}, apperror.Forbidden("доступ запрещён")
	}

	return s.createLink(ctx, userID, nil, &dirID, req)
}

func (s *Service) createLink(ctx context.Context, userID string, fileID, dirID *string, req CreateShareLinkRequest) (ShareLinkResponse, error) {
	token, err := generateToken()
	if err != nil {
		return ShareLinkResponse{}, apperror.WrapInternal("генерация токена", err)
	}

	var expiresAt *time.Time
	if req.ExpiresAt != nil && *req.ExpiresAt != "" {
		t, err := time.Parse(time.RFC3339, *req.ExpiresAt)
		if err != nil {
			return ShareLinkResponse{}, apperror.Validation("некорректный формат expires_at, используйте RFC3339")
		}
		expiresAt = &t
	}

	var passwordHash *string
	if req.Password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			return ShareLinkResponse{}, apperror.WrapInternal("хеширование пароля", err)
		}
		h := string(hash)
		passwordHash = &h
	}

	record := shareLinkRecord{
		FileID:       fileID,
		DirectoryID:  dirID,
		Token:        token,
		AccessType:   req.AccessType,
		CreatedBy:    userID,
		ExpiresAt:    expiresAt,
		PasswordHash: passwordHash,
	}

	saved, err := s.repo.Create(ctx, s.db, record)
	if err != nil {
		return ShareLinkResponse{}, apperror.WrapInternal("создание ссылки", err)
	}

	return toResponse(saved), nil
}

func (s *Service) ListByFile(ctx context.Context, userID, fileID string, limit int) ([]ShareLinkResponse, error) {
	file, err := s.repo.GetFileByID(ctx, s.db, fileID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperror.NotFound("файл не найден")
		}
		return nil, apperror.WrapInternal("поиск файла", err)
	}

	ok, err := s.accessChecker.Can(ctx, userID, file.DirectoryID, access.ActionView)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, apperror.Forbidden("доступ запрещён")
	}

	links, err := s.repo.FindByFileID(ctx, s.db, fileID, limit)
	if err != nil {
		return nil, apperror.WrapInternal("получение списка ссылок", err)
	}

	resp := make([]ShareLinkResponse, 0, len(links))
	for _, l := range links {
		resp = append(resp, toResponse(l))
	}
	return resp, nil
}

func (s *Service) ListByDirectory(ctx context.Context, userID, dirID string, limit int) ([]ShareLinkResponse, error) {
	_, err := s.repo.GetDirectoryByID(ctx, s.db, dirID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperror.NotFound("директория не найдена")
		}
		return nil, apperror.WrapInternal("поиск директории", err)
	}

	ok, err := s.accessChecker.Can(ctx, userID, dirID, access.ActionView)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, apperror.Forbidden("доступ запрещён")
	}

	links, err := s.repo.FindByDirectoryID(ctx, s.db, dirID, limit)
	if err != nil {
		return nil, apperror.WrapInternal("получение списка ссылок", err)
	}

	resp := make([]ShareLinkResponse, 0, len(links))
	for _, l := range links {
		resp = append(resp, toResponse(l))
	}
	return resp, nil
}

func (s *Service) Update(ctx context.Context, userID, linkID string, req UpdateShareLinkRequest) (ShareLinkResponse, error) {
	link, err := s.repo.FindByID(ctx, s.db, linkID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ShareLinkResponse{}, apperror.NotFound("ссылка не найдена")
		}
		return ShareLinkResponse{}, apperror.WrapInternal("поиск ссылки", err)
	}

	if link.CreatedBy != userID {
		var dirID string
		if link.FileID != nil {
			file, err := s.repo.GetFileByID(ctx, s.db, *link.FileID)
			if err != nil {
				return ShareLinkResponse{}, apperror.WrapInternal("поиск файла", err)
			}
			dirID = file.DirectoryID
		} else if link.DirectoryID != nil {
			dirID = *link.DirectoryID
		}
		ok, err := s.accessChecker.Can(ctx, userID, dirID, access.ActionDelete)
		if err != nil {
			return ShareLinkResponse{}, err
		}
		if !ok {
			return ShareLinkResponse{}, apperror.Forbidden("доступ запрещён")
		}
	}

	accessType := link.AccessType
	if req.AccessType != nil {
		if *req.AccessType != "public" && *req.AccessType != "authenticated" {
			return ShareLinkResponse{}, apperror.Validation("access_type должен быть 'public' или 'authenticated'")
		}
		accessType = *req.AccessType
	}

	var expiresAt *time.Time
	if req.ExpiresAt != nil {
		if *req.ExpiresAt == "" {
			expiresAt = nil
		} else {
			t, err := time.Parse(time.RFC3339, *req.ExpiresAt)
			if err != nil {
				return ShareLinkResponse{}, apperror.Validation("некорректный формат expires_at, используйте RFC3339")
			}
			expiresAt = &t
		}
	} else {
		expiresAt = link.ExpiresAt
	}

	var passwordHash *string
	if req.Password != nil {
		if *req.Password == "" {
			passwordHash = nil
		} else {
			hash, err := bcrypt.GenerateFromPassword([]byte(*req.Password), bcrypt.DefaultCost)
			if err != nil {
				return ShareLinkResponse{}, apperror.WrapInternal("хеширование пароля", err)
			}
			h := string(hash)
			passwordHash = &h
		}
	} else {
		passwordHash = link.PasswordHash
	}

	updated := shareLinkRecord{
		AccessType:   accessType,
		ExpiresAt:    expiresAt,
		PasswordHash: passwordHash,
	}

	saved, err := s.repo.Update(ctx, s.db, linkID, updated)
	if err != nil {
		return ShareLinkResponse{}, apperror.WrapInternal("обновление ссылки", err)
	}

	return toResponse(saved), nil
}

func (s *Service) Delete(ctx context.Context, userID, linkID string) error {
	link, err := s.repo.FindByID(ctx, s.db, linkID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperror.NotFound("ссылка не найдена")
		}
		return apperror.WrapInternal("поиск ссылки", err)
	}

	if link.CreatedBy != userID {
		var dirID string
		if link.FileID != nil {
			file, err := s.repo.GetFileByID(ctx, s.db, *link.FileID)
			if err != nil {
				return apperror.WrapInternal("поиск файла", err)
			}
			dirID = file.DirectoryID
		} else if link.DirectoryID != nil {
			dirID = *link.DirectoryID
		}
		ok, err := s.accessChecker.Can(ctx, userID, dirID, access.ActionDelete)
		if err != nil {
			return err
		}
		if !ok {
			return apperror.Forbidden("доступ запрещён")
		}
	}

	if err := s.repo.Delete(ctx, s.db, linkID); err != nil {
		return apperror.WrapInternal("удаление ссылки", err)
	}
	return nil
}

func (s *Service) Resolve(ctx context.Context, token, password string, authenticated bool) (FileContentResponse, error) {
	link, err := s.repo.FindByToken(ctx, s.db, token)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return FileContentResponse{}, apperror.NotFound("ссылка не найдена")
		}
		return FileContentResponse{}, apperror.WrapInternal("поиск ссылки", err)
	}

	if link.FileID == nil {
		return FileContentResponse{}, apperror.NotFound("неверный тип ссылки")
	}

	if err := s.checkLinkAccess(link, password, authenticated); err != nil {
		return FileContentResponse{}, err
	}

	file, err := s.repo.GetFileByID(ctx, s.db, *link.FileID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return FileContentResponse{}, apperror.NotFound("файл не найден")
		}
		return FileContentResponse{}, apperror.WrapInternal("поиск файла", err)
	}

	username, err := s.repo.GetUsernameByID(ctx, s.db, file.OwnerID)
	if err != nil {
		username = ""
	}

	url, err := s.storage.PresignedGetURL(ctx, file.ObjectKey, 24*time.Hour)
	if err != nil {
		return FileContentResponse{}, apperror.WrapInternal("генерация ссылки", err)
	}

	return FileContentResponse{
		URL:           url,
		FileID:        file.ID,
		Filename:      file.Filename,
		Extension:     file.Extension,
		MimeType:      file.MimeType,
		Size:          file.Size,
		OwnerUsername: username,
		CreatedAt:     file.CreatedAt,
	}, nil
}

func (s *Service) ResolveDirectory(ctx context.Context, token, password string, authenticated bool, params ResolveDirectoryParams) (DirectoryContentResponse, error) {
	link, err := s.repo.FindByToken(ctx, s.db, token)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return DirectoryContentResponse{}, apperror.NotFound("ссылка не найдена")
		}
		return DirectoryContentResponse{}, apperror.WrapInternal("поиск ссылки", err)
	}

	if link.DirectoryID == nil {
		return DirectoryContentResponse{}, apperror.NotFound("неверный тип ссылки")
	}

	if err := s.checkLinkAccess(link, password, authenticated); err != nil {
		return DirectoryContentResponse{}, err
	}

	targetDirID := *link.DirectoryID
	if params.SubDirID != "" {
		isSub, err := s.repo.IsSubdirectory(ctx, s.db, *link.DirectoryID, params.SubDirID)
		if err != nil {
			return DirectoryContentResponse{}, apperror.WrapInternal("проверка поддиректории", err)
		}
		if !isSub {
			return DirectoryContentResponse{}, apperror.Forbidden("доступ к поддиректории запрещён")
		}
		targetDirID = params.SubDirID
	}

	dir, err := s.repo.GetDirectoryByID(ctx, s.db, targetDirID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return DirectoryContentResponse{}, apperror.NotFound("директория не найдена")
		}
		return DirectoryContentResponse{}, apperror.WrapInternal("поиск директории", err)
	}

	username, err := s.repo.GetUsernameByID(ctx, s.db, dir.OwnerID)
	if err != nil {
		username = ""
	}

	dirsLimit := params.DirsLimit
	filesLimit := params.FilesLimit

	if dirsLimit == 0 && filesLimit == 0 {
		dirsLimit = 100
		filesLimit = 100
	}
	if dirsLimit == 0 {
		dirsLimit = 100
	}
	if filesLimit == 0 {
		filesLimit = 100
	}

	var subdirItems []DirectorySubdir
	var nextDirsCursor string

	if params.DirsCursor != "" {
		cursorParts := strings.SplitN(params.DirsCursor, "|", 2)
		if len(cursorParts) != 2 {
			return DirectoryContentResponse{}, apperror.Validation("некорректный курсор для директорий")
		}
		var subdirs []dirSubdirRecord
		var dirsHasMore bool
		subdirs, dirsHasMore, nextDirsCursor, err = s.repo.GetDirectorySubdirsAfterCursor(ctx, s.db, targetDirID, cursorParts[0], cursorParts[1], dirsLimit)
		if err != nil {
			return DirectoryContentResponse{}, apperror.WrapInternal("поиск поддиректорий", err)
		}
		_ = dirsHasMore
		subdirItems = make([]DirectorySubdir, 0, len(subdirs))
		for _, sd := range subdirs {
			subdirItems = append(subdirItems, DirectorySubdir{ID: sd.ID, Name: sd.Name})
		}
	} else {
		var subdirs []dirSubdirRecord
		var dirsHasMore bool
		var dirsNextCursor string
		subdirs, dirsHasMore, dirsNextCursor, err = s.repo.GetDirectorySubdirsAfterCursor(ctx, s.db, targetDirID, "", "", dirsLimit)
		if err != nil {
			return DirectoryContentResponse{}, apperror.WrapInternal("поиск поддиректорий", err)
		}
		subdirItems = make([]DirectorySubdir, 0, len(subdirs))
		for _, sd := range subdirs {
			subdirItems = append(subdirItems, DirectorySubdir{ID: sd.ID, Name: sd.Name})
		}
		if dirsHasMore {
			nextDirsCursor = dirsNextCursor
		}
	}

	var fileItems []DirectoryFileItem
	var nextFilesCursor string

	if params.FilesCursor != "" {
		cursorParts := strings.SplitN(params.FilesCursor, "|", 2)
		if len(cursorParts) != 2 {
			return DirectoryContentResponse{}, apperror.Validation("некорректный курсор для файлов")
		}
		var files []dirFileRecord
		var filesHasMore bool
		files, filesHasMore, nextFilesCursor, err = s.repo.GetDirectoryFilesAfterCursor(ctx, s.db, targetDirID, cursorParts[0], cursorParts[1], filesLimit)
		if err != nil {
			return DirectoryContentResponse{}, apperror.WrapInternal("поиск файлов", err)
		}
		_ = filesHasMore
		fileItems = make([]DirectoryFileItem, 0, len(files))
		for _, f := range files {
			url, urlErr := s.storage.PresignedGetURL(ctx, f.ObjectKey, 24*time.Hour)
			if urlErr != nil {
				continue
			}
			fileItems = append(fileItems, DirectoryFileItem{
				ID: f.ID, Filename: f.Filename, Extension: f.Extension,
				MimeType: f.MimeType, Size: f.Size, URL: url, CreatedAt: f.CreatedAt,
			})
		}
	} else {
		var files []dirFileRecord
		var filesHasMore bool
		var filesNextCursor string
		files, filesHasMore, filesNextCursor, err = s.repo.GetDirectoryFilesAfterCursor(ctx, s.db, targetDirID, "", "", filesLimit)
		if err != nil {
			return DirectoryContentResponse{}, apperror.WrapInternal("поиск файлов", err)
		}
		fileItems = make([]DirectoryFileItem, 0, len(files))
		for _, f := range files {
			url, urlErr := s.storage.PresignedGetURL(ctx, f.ObjectKey, 24*time.Hour)
			if urlErr != nil {
				continue
			}
			fileItems = append(fileItems, DirectoryFileItem{
				ID: f.ID, Filename: f.Filename, Extension: f.Extension,
				MimeType: f.MimeType, Size: f.Size, URL: url, CreatedAt: f.CreatedAt,
			})
		}
		if filesHasMore {
			nextFilesCursor = filesNextCursor
		}
	}

	return DirectoryContentResponse{
		ID:              dir.ID,
		Name:            dir.Name,
		Token:           link.Token,
		Subdirectories:  subdirItems,
		Files:           fileItems,
		OwnerUsername:   username,
		NextDirsCursor:  nextDirsCursor,
		NextFilesCursor: nextFilesCursor,
	}, nil
}

func (s *Service) checkLinkAccess(link shareLinkRecord, password string, authenticated bool) error {
	if link.AccessType == "authenticated" && !authenticated {
		return apperror.Unauthorized("требуется авторизация")
	}

	if link.ExpiresAt != nil && link.ExpiresAt.Before(time.Now()) {
		return apperror.NotFound("срок действия ссылки истёк")
	}

	if link.PasswordHash != nil && *link.PasswordHash != "" {
		if err := bcrypt.CompareHashAndPassword([]byte(*link.PasswordHash), []byte(password)); err != nil {
			return apperror.Forbidden("неверный пароль")
		}
	}

	return nil
}

func generateToken() (string, error) {
	b := make([]byte, tokenBytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func toResponse(l shareLinkRecord) ShareLinkResponse {
	var expiresAt *string
	if l.ExpiresAt != nil {
		s := l.ExpiresAt.Format(time.RFC3339)
		expiresAt = &s
	}

	return ShareLinkResponse{
		ID:          l.ID,
		FileID:      l.FileID,
		DirectoryID: l.DirectoryID,
		Token:       l.Token,
		AccessType:  l.AccessType,
		CreatedBy:   l.CreatedBy,
		ExpiresAt:   expiresAt,
		HasPassword: l.PasswordHash != nil && *l.PasswordHash != "",
		CreatedAt:   l.CreatedAt,
	}
}
