package files

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"

	"sharedspace/internal/access"
	"sharedspace/internal/apperror"
)

const (
	previewGrantIssuer       = "sharedspace-office-preview"
	sharedPreviewGrantIssuer = "sharedspace-office-share-preview"
)

type officePreviewGrant struct {
	FileID    string `json:"file_id"`
	Key       string `json:"object_key"`
	Format    string `json:"format"`
	LinkID    string `json:"link_id,omitempty"`
	LinkProof string `json:"link_proof,omitempty"`
	jwt.RegisteredClaims
}

func (s *DocumentService) StartPreview(ctx context.Context, fileID, user, username, theme string) (DocumentEditorSession, error) {
	if !s.enabled {
		return DocumentEditorSession{}, apperror.New("предпросмотр офисных файлов недоступен", "editor_disabled", http.StatusServiceUnavailable)
	}
	file, err := s.requireAccessibleFile(ctx, s.db, fileID, user, access.ActionView)
	if err != nil {
		return DocumentEditorSession{}, err
	}
	expires := time.Now().Add(editorGrantTTL)
	grant := officePreviewGrant{
		RegisteredClaims: jwt.RegisteredClaims{Issuer: previewGrantIssuer, Subject: user, ExpiresAt: jwt.NewNumericDate(expires)},
	}
	return s.startReadOnlyPreview(ctx, file, grant, user, username, theme)
}

func (s *DocumentService) StartSharedPreview(ctx context.Context, token, password string, authenticated bool, theme string) (DocumentEditorSession, error) {
	if !s.enabled || s.shareLinks == nil {
		return DocumentEditorSession{}, apperror.New("предпросмотр офисных файлов недоступен", "editor_disabled", http.StatusServiceUnavailable)
	}
	link, err := s.shareLinks.AuthorizeOfficePreview(ctx, token, password, authenticated, s.secret)
	if err != nil {
		return DocumentEditorSession{}, err
	}
	file, err := s.findSharedPreviewFile(ctx, link.FileID)
	if err != nil {
		return DocumentEditorSession{}, err
	}
	expires := time.Now().Add(editorGrantTTL)
	if link.ExpiresAt != nil && link.ExpiresAt.Before(expires) {
		expires = *link.ExpiresAt
	}
	grant := officePreviewGrant{
		LinkID: link.ID, LinkProof: link.Proof,
		RegisteredClaims: jwt.RegisteredClaims{Issuer: sharedPreviewGrantIssuer, ExpiresAt: jwt.NewNumericDate(expires)},
	}
	return s.startReadOnlyPreview(ctx, file, grant, "", "", theme)
}

func (s *DocumentService) findSharedPreviewFile(ctx context.Context, id string) (fileRecord, error) {
	file, err := s.files.FindByID(ctx, s.db, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return fileRecord{}, apperror.NotFound("файл не найден")
	}
	return file, err
}

func (s *DocumentService) startReadOnlyPreview(ctx context.Context, file fileRecord, grant officePreviewGrant, user, username, theme string) (DocumentEditorSession, error) {
	extension := ExtractExtension(file.Filename)
	if officeFormats[extension].documentType == "" {
		return DocumentEditorSession{}, apperror.New("предпросмотр этого формата недоступен", "unsupported_document", http.StatusUnsupportedMediaType)
	}
	matches, err := matchesDocumentHistory(ctx, s.db, file)
	if err != nil {
		return DocumentEditorSession{}, err
	}
	if !matches {
		return DocumentEditorSession{}, apperror.Conflict("расширение файла не совпадает с форматом сохранённой версии")
	}
	grant.FileID, grant.Key, grant.Format = file.ID, file.ObjectKey, extension
	source, err := s.officeSource("api/v1/office/preview-source", grant)
	if err != nil {
		return DocumentEditorSession{}, err
	}
	cacheKey := "preview:" + file.ID + ":" + file.ObjectKey + ":" + extension
	if grant.LinkID != "" {
		cacheKey += ":" + grant.LinkID + ":" + grant.LinkProof
	}
	sum := sha256.Sum256([]byte(cacheKey))
	return s.officeConfig(file, hex.EncodeToString(sum[:]), source, user, username, theme, false, grant.ExpiresAt.Time)
}

func (s *DocumentService) previewSourceFile(ctx context.Context, token string) (fileRecord, error) {
	var grant officePreviewGrant
	if err := s.parseOfficeToken(token, &grant, jwt.WithExpirationRequired()); err != nil {
		return fileRecord{}, err
	}
	var file fileRecord
	var err error
	switch grant.Issuer {
	case previewGrantIssuer:
		file, err = s.requireAccessibleFile(ctx, s.db, grant.FileID, grant.Subject, access.ActionView)
	case sharedPreviewGrantIssuer:
		if s.shareLinks == nil {
			return fileRecord{}, apperror.NotFound("ссылка недоступна")
		}
		if err := s.shareLinks.VerifyOfficePreview(ctx, grant.LinkID, grant.FileID, grant.LinkProof, s.secret); err != nil {
			return fileRecord{}, err
		}
		file, err = s.findSharedPreviewFile(ctx, grant.FileID)
	default:
		return fileRecord{}, apperror.Unauthorized("недействительная подпись предпросмотра")
	}
	if err != nil {
		return file, err
	}
	if file.ObjectKey != grant.Key || ExtractExtension(file.Filename) != grant.Format {
		return file, apperror.Conflict("документ изменился")
	}
	return file, nil
}
