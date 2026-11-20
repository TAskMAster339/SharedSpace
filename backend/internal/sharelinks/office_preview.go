package sharelinks

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"sharedspace/internal/apperror"
)

type OfficePreviewLink struct {
	ID, FileID string
	ExpiresAt  *time.Time
	Proof      string
}

func (s *Service) AuthorizeOfficePreview(ctx context.Context, token, password string, authenticated bool, secret []byte) (OfficePreviewLink, error) {
	link, err := s.repo.FindByToken(ctx, s.db, token)
	if err := checkOfficePreviewLink(link, err); err != nil {
		return OfficePreviewLink{}, err
	}
	if err := s.checkLinkAccess(link, password, authenticated); err != nil {
		return OfficePreviewLink{}, err
	}
	return OfficePreviewLink{ID: link.ID, FileID: *link.FileID, ExpiresAt: link.ExpiresAt, Proof: officePreviewProof(link, secret)}, nil
}

func (s *Service) VerifyOfficePreview(ctx context.Context, linkID, fileID, proof string, secret []byte) error {
	link, err := s.repo.FindByID(ctx, s.db, linkID)
	if err := checkOfficePreviewLink(link, err); err != nil {
		return err
	}
	if *link.FileID != fileID || !hmac.Equal([]byte(proof), []byte(officePreviewProof(link, secret))) {
		return apperror.NotFound("ссылка недоступна")
	}
	return nil
}

func checkOfficePreviewLink(link shareLinkRecord, err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return apperror.NotFound("ссылка недоступна")
	}
	if err != nil {
		return apperror.WrapInternal("поиск ссылки", err)
	}
	if !link.IsActive || link.FileID == nil || (link.ExpiresAt != nil && !time.Now().Before(*link.ExpiresAt)) {
		return apperror.NotFound("ссылка недоступна")
	}
	return nil
}

func officePreviewProof(link shareLinkRecord, secret []byte) string {
	proof := hmac.New(sha256.New, secret)
	proof.Write([]byte("office-share:" + link.ID + ":" + link.AccessType + ":"))
	if link.PasswordHash != nil {
		proof.Write([]byte(*link.PasswordHash))
	}
	return hex.EncodeToString(proof.Sum(nil))
}
