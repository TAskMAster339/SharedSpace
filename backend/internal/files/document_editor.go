package files

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sharedspace/internal/access"
	"sharedspace/internal/apperror"
)

const (
	editorLimit    = 5
	editorGrantTTL = 2 * time.Minute
)

type DocumentEditorOptions struct {
	Enabled     bool
	PublicURL   string
	InternalURL string
	StorageURL  string
	Secret      string
}

type DocumentService struct {
	db                         *pgxpool.Pool
	files                      *Repository
	storage                    StorageClient
	client                     *http.Client
	public, internal, callback *url.URL
	secret                     []byte
	enabled                    bool
}

func NewDocumentService(db *pgxpool.Pool, repo *Repository, storage StorageClient, opts DocumentEditorOptions) (*DocumentService, error) {
	s := &DocumentService{
		db: db, files: repo, storage: storage, enabled: opts.Enabled,
		secret: []byte(opts.Secret),
		client: &http.Client{
			Timeout:       45 * time.Second,
			CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		},
	}
	if !opts.Enabled && opts.Secret == "" {
		return s, nil
	}
	if len(s.secret) < 32 {
		return nil, errors.New("OFFICE_JWT_SECRET must be at least 32 bytes")
	}
	for _, setting := range []struct {
		name, value string
		target      **url.URL
	}{
		{"OFFICE_PUBLIC_URL", opts.PublicURL, &s.public},
		{"OFFICE_INTERNAL_URL", opts.InternalURL, &s.internal},
		{"OFFICE_STORAGE_URL", opts.StorageURL, &s.callback},
	} {
		parsed, err := url.Parse(setting.value)
		if err != nil || (parsed.Scheme != "https" && parsed.Scheme != "http") ||
			parsed.Hostname() == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
			return nil, fmt.Errorf("%s must be an HTTP(S) URL without credentials, query or fragment", setting.name)
		}
		*setting.target = parsed
	}
	if (s.public.Path != "" && s.public.Path != "/") || (s.internal.Path != "" && s.internal.Path != "/") {
		return nil, errors.New("ONLYOFFICE URLs must point to the root of the Document Server")
	}
	return s, nil
}

type DocumentEditorSession struct {
	ScriptURL string         `json:"script_url"`
	Config    map[string]any `json:"config"`
}

type documentSession struct {
	Key         string
	FileID      *string
	DirectoryID string
	BaseKey     string
	ResultURL   *string
	PendingKey  *string
	PendingSize *int64
	ClosedAt    *time.Time
}

const sessionColumns = "key, file_id, directory_id, base_object_key, result_url, pending_key, pending_size, closed_at"

func readDocumentSession(row pgx.Row) (documentSession, error) {
	var session documentSession
	err := row.Scan(&session.Key, &session.FileID, &session.DirectoryID, &session.BaseKey, &session.ResultURL, &session.PendingKey, &session.PendingSize, &session.ClosedAt)
	return session, err
}

func activeDocumentSession(ctx context.Context, tx dbTX, id string) (documentSession, error) {
	return readDocumentSession(tx.QueryRow(ctx, "SELECT "+sessionColumns+
		" FROM document_edit_sessions WHERE file_id = $1 AND closed_at IS NULL FOR UPDATE", id))
}

func sessionByKey(ctx context.Context, tx dbTX, key string, lock bool) (documentSession, error) {
	sql := "SELECT " + sessionColumns + " FROM document_edit_sessions WHERE key = $1"
	if lock {
		sql += " FOR UPDATE"
	}
	return readDocumentSession(tx.QueryRow(ctx, sql, key))
}

func (s *DocumentService) StartSession(ctx context.Context, fileID, userID, username string) (DocumentEditorSession, error) {
	if !s.enabled {
		return DocumentEditorSession{}, apperror.New("редактор недоступен", "editor_disabled", http.StatusServiceUnavailable)
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return DocumentEditorSession{}, err
	}
	defer tx.Rollback(ctx)
	if err := s.lockDocument(ctx, tx, fileID); err != nil {
		return DocumentEditorSession{}, err
	}
	file, err := s.requireFile(ctx, tx, fileID, userID, access.ActionEditContent)
	if err != nil {
		return DocumentEditorSession{}, err
	}

	session, err := activeDocumentSession(ctx, tx, fileID)
	if errors.Is(err, pgx.ErrNoRows) {
		session.Key = uuid.NewString()
		session.DirectoryID, session.BaseKey = file.DirectoryID, file.ObjectKey
		_, err = tx.Exec(ctx, `INSERT INTO document_edit_sessions (key, file_id, directory_id, base_object_key)
			VALUES ($1, $2, $3, $4)`, session.Key, fileID, file.DirectoryID, file.ObjectKey)
	}
	if err != nil {
		return DocumentEditorSession{}, err
	}
	if session.ResultURL != nil || session.PendingKey != nil || session.DirectoryID != file.DirectoryID || session.BaseKey != file.ObjectKey {
		return DocumentEditorSession{}, apperror.New("документ сохраняется, попробуйте позже", "document_saving", http.StatusConflict)
	}
	var occupied int
	var ownPlace bool
	if err := tx.QueryRow(ctx, `SELECT count(*), COALESCE(bool_or(user_id = $2), false)
		FROM document_edit_members WHERE session_key = $1 AND (connected OR reserved_until > now())`,
		session.Key, userID).Scan(&occupied, &ownPlace); err != nil {
		return DocumentEditorSession{}, err
	}
	if occupied >= editorLimit && !ownPlace {
		return DocumentEditorSession{}, apperror.New("документ уже редактируют пять участников", "document_editor_limit", http.StatusConflict)
	}
	if _, err := tx.Exec(ctx, `UPDATE document_edit_sessions SET last_grant_at=now() WHERE key=$1`, session.Key); err != nil {
		return DocumentEditorSession{}, err
	}
	expires := time.Now().Add(editorGrantTTL)
	if _, err := tx.Exec(ctx, `INSERT INTO document_edit_members (session_key, user_id, username, reserved_until)
		VALUES ($1, $2, $3, $4) ON CONFLICT (session_key, user_id) DO UPDATE
		SET reserved_until = EXCLUDED.reserved_until, username = EXCLUDED.username`, session.Key, userID, username, expires); err != nil {
		return DocumentEditorSession{}, err
	}
	result, err := s.editorConfig(file, session.Key, userID, username, expires)
	if err != nil {
		return DocumentEditorSession{}, err
	}
	return result, tx.Commit(ctx)
}

type documentSourceGrant struct {
	Session string `json:"session"`
	jwt.RegisteredClaims
}

func (s *DocumentService) editorConfig(file fileRecord, key, user, username string, expires time.Time) (DocumentEditorSession, error) {
	grant := documentSourceGrant{Session: key, RegisteredClaims: jwt.RegisteredClaims{
		Issuer: "sharedspace-docx-source", Subject: user, ExpiresAt: jwt.NewNumericDate(expires),
	}}
	grantToken, err := jwt.NewWithClaims(jwt.SigningMethodHS256, grant).SignedString(s.secret)
	if err != nil {
		return DocumentEditorSession{}, err
	}
	source := s.callback.JoinPath("api/v1/office/source")
	source.RawQuery = url.Values{"grant": {grantToken}}.Encode()
	config := jwt.MapClaims{
		"documentType": "word", "type": "desktop",
		"document": map[string]any{"fileType": "docx", "key": key, "title": file.Filename, "url": source.String()},
		"editorConfig": map[string]any{
			"mode": "edit", "lang": "ru", "callbackUrl": s.callback.JoinPath("api/v1/office/callback").String(),
			"user":          map[string]string{"id": user, "name": username},
			"customization": map[string]bool{"forcesave": false, "plugins": false, "macros": false},
			"coEditing":     map[string]any{"mode": "fast", "change": false},
		},
		"exp": expires.Unix(),
	}
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, config).SignedString(s.secret)
	if err != nil {
		return DocumentEditorSession{}, err
	}
	config["token"] = signed
	return DocumentEditorSession{
		ScriptURL: s.public.JoinPath("web-apps/apps/api/documents/api.js").String(),
		Config:    config,
	}, nil
}

func (s *DocumentService) parseOfficeToken(token string, claims jwt.Claims, opts ...jwt.ParserOption) error {
	opts = append(opts, jwt.WithValidMethods([]string{"HS256"}))
	_, err := jwt.ParseWithClaims(token, claims, func(*jwt.Token) (any, error) { return s.secret, nil }, opts...)
	if err != nil || len(s.secret) == 0 {
		return apperror.Unauthorized("недействительная подпись редактора")
	}
	return nil
}

func (s *DocumentService) sourceFile(ctx context.Context, token string) (fileRecord, error) {
	var grant documentSourceGrant
	if err := s.parseOfficeToken(token, &grant, jwt.WithIssuer("sharedspace-docx-source"), jwt.WithExpirationRequired()); err != nil {
		return fileRecord{}, err
	}
	if _, err := uuid.Parse(grant.Session); err != nil {
		return fileRecord{}, apperror.Unauthorized("недействительная ссылка редактора")
	}
	session, err := sessionByKey(ctx, s.db, grant.Session, false)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && (session.FileID == nil || session.ClosedAt != nil)) {
		return fileRecord{}, apperror.NotFound("сессия документа закрыта")
	}
	if err != nil {
		return fileRecord{}, err
	}
	file, err := s.requireFile(ctx, s.db, *session.FileID, grant.Subject, access.ActionEditContent)
	if err != nil {
		return file, err
	}
	if file.DirectoryID != session.DirectoryID || file.ObjectKey != session.BaseKey {
		return file, apperror.Conflict("документ изменился")
	}
	return file, nil
}

func bearerToken(value string) string {
	scheme, token, ok := strings.Cut(value, " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") {
		return ""
	}
	return token
}
