package files

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"sharedspace/internal/access"
	"sharedspace/internal/apperror"
)

const previewGrantIssuer = "sharedspace-office-preview"

type officePreviewGrant struct {
	FileID string `json:"file_id"`
	Key    string `json:"object_key"`
	Format string `json:"format"`
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
	expires := time.Now().Add(editorGrantTTL)
	grant := officePreviewGrant{
		FileID: file.ID, Key: file.ObjectKey, Format: extension,
		RegisteredClaims: jwt.RegisteredClaims{Issuer: previewGrantIssuer, Subject: user, ExpiresAt: jwt.NewNumericDate(expires)},
	}
	source, err := s.officeSource("api/v1/office/preview-source", grant)
	if err != nil {
		return DocumentEditorSession{}, err
	}
	// Separate the saved snapshot cache from live editing sessions. A saved
	// version is immutable and publishing another version changes the key.
	sum := sha256.Sum256([]byte("preview:" + file.ID + ":" + file.ObjectKey + ":" + extension))
	return s.officeConfig(file, hex.EncodeToString(sum[:]), source, user, username, theme, false, expires)
}

func (s *DocumentService) previewSourceFile(ctx context.Context, token string) (fileRecord, error) {
	var grant officePreviewGrant
	if err := s.parseOfficeToken(token, &grant, jwt.WithIssuer(previewGrantIssuer), jwt.WithExpirationRequired()); err != nil {
		return fileRecord{}, err
	}
	file, err := s.requireAccessibleFile(ctx, s.db, grant.FileID, grant.Subject, access.ActionView)
	if err != nil {
		return file, err
	}
	if file.ObjectKey != grant.Key || ExtractExtension(file.Filename) != grant.Format {
		return file, apperror.Conflict("документ изменился")
	}
	return file, nil
}
