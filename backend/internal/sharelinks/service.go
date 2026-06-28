package sharelinks

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
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

	ok, err := s.accessChecker.Can(ctx, userID, file.DirectoryID, access.ActionUpload)
	if err != nil {
		return ShareLinkResponse{}, err
	}
	if !ok {
		return ShareLinkResponse{}, apperror.Forbidden("доступ запрещён")
	}

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

func (s *Service) Update(ctx context.Context, userID, linkID string, req UpdateShareLinkRequest) (ShareLinkResponse, error) {
	link, err := s.repo.FindByID(ctx, s.db, linkID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ShareLinkResponse{}, apperror.NotFound("ссылка не найдена")
		}
		return ShareLinkResponse{}, apperror.WrapInternal("поиск ссылки", err)
	}

	file, err := s.repo.GetFileByID(ctx, s.db, link.FileID)
	if err != nil {
		return ShareLinkResponse{}, apperror.WrapInternal("поиск файла", err)
	}

	if link.CreatedBy != userID {
		ok, err := s.accessChecker.Can(ctx, userID, file.DirectoryID, access.ActionDelete)
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
		file, err := s.repo.GetFileByID(ctx, s.db, link.FileID)
		if err != nil {
			return apperror.WrapInternal("поиск файла", err)
		}
		ok, err := s.accessChecker.Can(ctx, userID, file.DirectoryID, access.ActionDelete)
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

	if link.AccessType == "authenticated" && !authenticated {
		return FileContentResponse{}, apperror.Unauthorized("требуется авторизация")
	}

	if link.ExpiresAt != nil && link.ExpiresAt.Before(time.Now()) {
		return FileContentResponse{}, apperror.NotFound("срок действия ссылки истёк")
	}

	if link.PasswordHash != nil && *link.PasswordHash != "" {
		if err := bcrypt.CompareHashAndPassword([]byte(*link.PasswordHash), []byte(password)); err != nil {
			return FileContentResponse{}, apperror.Forbidden("неверный пароль")
		}
	}

	file, err := s.repo.GetFileByID(ctx, s.db, link.FileID)
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
		Token:       l.Token,
		AccessType:  l.AccessType,
		CreatedBy:   l.CreatedBy,
		ExpiresAt:   expiresAt,
		HasPassword: l.PasswordHash != nil && *l.PasswordHash != "",
		CreatedAt:   l.CreatedAt,
	}
}
