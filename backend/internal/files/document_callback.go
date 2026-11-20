package files

import (
	"archive/zip"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"sharedspace/internal/access"
	"sharedspace/internal/apperror"
)

const documentObjectPrefix = "docx-versions/"

type officeEvent struct {
	Key    string   `json:"key"`
	Status int      `json:"status"`
	URL    string   `json:"url"`
	Users  []string `json:"users"`
}

type officeCallbackClaims struct {
	Payload officeEvent `json:"payload"`
	jwt.RegisteredClaims
}

func (s *DocumentService) ProcessCallback(ctx context.Context, token string) error {
	var claims officeCallbackClaims
	if err := s.parseOfficeToken(token, &claims); err != nil {
		return err
	}
	event := claims.Payload
	if _, err := uuid.Parse(event.Key); err != nil {
		return apperror.Validation("некорректный ключ сессии")
	}
	switch event.Status {
	case 1:
		return s.syncDocumentPresence(ctx, event)
	case 4:
		_, err := s.db.Exec(ctx, `UPDATE document_edit_sessions SET closed_at = now()
			WHERE key = $1 AND closed_at IS NULL AND result_url IS NULL AND pending_key IS NULL`, event.Key)
		return err
	case 2, 3:
		resolved, err := s.resultDownloadURL(event.URL)
		if err != nil {
			return err
		}
		// Persist the notification before attempting network I/O so the worker
		// can resume after a transient failure or process restart.
		if _, err := s.db.Exec(ctx, `UPDATE document_edit_sessions SET result_url = $2
			WHERE key = $1 AND closed_at IS NULL AND pending_key IS NULL`, event.Key, resolved.String()); err != nil {
			return err
		}
		return s.finishDocument(ctx, event.Key)
	case 6, 7:
		// Force-save does not conclude this editing session.
		return nil
	default:
		return apperror.Validation("неизвестное событие редактора")
	}
}

func (s *DocumentService) syncDocumentPresence(ctx context.Context, event officeEvent) error {
	if event.Users == nil {
		return apperror.Validation("редактор не передал список подключений")
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	session, err := sessionByKey(ctx, tx, event.Key, true)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}

	var unadmitted []string
	if session.ClosedAt != nil || session.FileID == nil || session.ResultURL != nil || session.PendingKey != nil {
		unadmitted = event.Users
	} else {
		err = tx.QueryRow(ctx, `SELECT ARRAY(SELECT DISTINCT p FROM unnest($2::text[]) p
			WHERE NOT EXISTS (SELECT 1 FROM document_edit_members
			WHERE session_key = $1 AND user_id::text = p AND (connected OR reserved_until > now())))`,
			event.Key, event.Users).Scan(&unadmitted)
		if err != nil {
			return err
		}
		// Keep recently disconnected users' seats through the editor's
		// reconnection window, including tabs whose opening token has expired.
		_, err = tx.Exec(ctx, `UPDATE document_edit_members SET
			connected = user_id::text = ANY($2) AND NOT (user_id::text = ANY($3)),
			participated = participated OR (user_id::text = ANY($2) AND NOT (user_id::text = ANY($3))),
			reserved_until = CASE WHEN connected AND NOT (user_id::text = ANY($2))
				THEN greatest(reserved_until, now() + interval '2 minutes') ELSE reserved_until END
			WHERE session_key = $1`, event.Key, event.Users, unadmitted)
		if err != nil {
			return err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	if len(unadmitted) > 0 {
		commandCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		defer cancel()
		return s.dropEditors(commandCtx, event.Key, unadmitted)
	}
	return nil
}

func (s *DocumentService) resultDownloadURL(raw string) (*url.URL, error) {
	target, err := url.Parse(raw)
	if err != nil || target.User != nil || target.Fragment != "" || path.Clean(target.Path) != target.Path || !strings.HasPrefix(target.Path, "/cache/files/") ||
		(target.Scheme != s.public.Scheme || !strings.EqualFold(target.Host, s.public.Host)) &&
			(target.Scheme != s.internal.Scheme || !strings.EqualFold(target.Host, s.internal.Host)) {
		return nil, apperror.Validation("редактор передал недопустимый адрес результата")
	}
	// Always download over the configured server-to-server connection.
	target.Scheme, target.Host = s.internal.Scheme, s.internal.Host
	return target, nil
}

func (s *DocumentService) finishDocument(ctx context.Context, key string) error {
	session, err := sessionByKey(ctx, s.db, key, false)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && session.ClosedAt != nil) {
		return nil
	}
	if err != nil {
		return err
	}
	if session.PendingKey == nil && session.ResultURL != nil {
		if err := s.stageDocument(ctx, session); err != nil {
			return err
		}
	}
	return s.publishDocument(ctx, session)
}

func (s *DocumentService) stageDocument(ctx context.Context, session documentSession) error {
	target, err := s.resultDownloadURL(*session.ResultURL)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		return err
	}
	resp, err := s.client.Do(req)
	if err != nil {
		// The URL carries the Document Server's private download signature.
		return errors.New("не удалось скачать результат из редактора")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK || resp.ContentLength > maxFileSize {
		return fmt.Errorf("редактор вернул недоступный или слишком большой результат (HTTP %d)", resp.StatusCode)
	}
	tmp, err := os.CreateTemp("", "sharedspace-docx-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	defer tmp.Close()
	size, err := io.Copy(tmp, io.LimitReader(resp.Body, maxFileSize+1))
	if err != nil {
		return err
	}
	if size > maxFileSize {
		return errors.New("документ превышает 100 МБ")
	}
	if err := validateDOCX(tmp, size); err != nil {
		return err
	}
	if _, err := tmp.Seek(0, io.SeekStart); err != nil {
		return err
	}
	objectKey := documentObjectPrefix + uuid.NewString()
	if err := s.storage.Upload(ctx, objectKey, tmp, size, docxMIME); err != nil {
		return err
	}
	// Each attempt uses a unique key. The orphan sweep handles interrupted
	// attempts, including a database error with an unknown commit outcome.
	_, err = s.db.Exec(ctx, `UPDATE document_edit_sessions SET pending_key = $2, pending_size = $3, result_url = NULL
		WHERE key = $1 AND closed_at IS NULL AND pending_key IS NULL`, session.Key, objectKey, size)
	return err
}

func validateDOCX(file io.ReaderAt, size int64) error {
	z, err := zip.NewReader(file, size)
	if err != nil {
		return fmt.Errorf("редактор вернул некорректный DOCX: %w", err)
	}
	var contentTypes, document bool
	for _, entry := range z.File {
		switch entry.Name {
		case "[Content_Types].xml":
			contentTypes = true
		case "word/document.xml":
			document = true
		}
	}
	if !contentTypes || !document {
		return errors.New("в результате отсутствуют обязательные части DOCX")
	}
	return nil
}

func (s *DocumentService) publishDocument(ctx context.Context, initial documentSession) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Lock in the same order as session creation and restore.
	var file fileRecord
	if initial.FileID != nil {
		err = s.lockDocument(ctx, tx, *initial.FileID)
		if appErr, ok := apperror.From(err); err == nil {
			file, err = s.files.FindByID(ctx, tx, *initial.FileID)
		} else if ok && appErr.Status() == http.StatusNotFound {
			err = nil
		}
		if err != nil {
			return err
		}
	}
	session, err := sessionByKey(ctx, tx, initial.Key, true)
	if err != nil || session.ClosedAt != nil || session.PendingKey == nil {
		return err
	}
	if file.ID == "" || !isDOCX(file) || file.DirectoryID != session.DirectoryID || file.ObjectKey != session.BaseKey {
		// Retain the result for operator recovery when the original file was
		// moved, removed, or replaced while the document was being saved.
		if _, err := tx.Exec(ctx, `UPDATE document_edit_sessions SET closed_at = now() WHERE key = $1`, session.Key); err != nil {
			return err
		}
		return tx.Commit(ctx)
	}
	names, err := s.documentContributors(ctx, tx, session)
	if err != nil {
		return err
	}
	if len(names) == 0 {
		// No current editor can authorize publishing this session.
		if _, err := tx.Exec(ctx, `UPDATE document_edit_sessions SET closed_at = now() WHERE key = $1`, session.Key); err != nil {
			return err
		}
		return tx.Commit(ctx)
	}
	if err := s.publishVersion(ctx, tx, file, *session.PendingKey, *session.PendingSize, names); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE document_edit_sessions SET closed_at = now(), pending_key = NULL, pending_size = NULL WHERE key = $1`, session.Key); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *DocumentService) documentContributors(ctx context.Context, tx pgx.Tx, session documentSession) ([]string, error) {
	rows, err := tx.Query(ctx, `SELECT user_id, username FROM document_edit_members
		WHERE session_key = $1 AND participated ORDER BY username, user_id`, session.Key)
	if err != nil {
		return nil, err
	}
	type contributor struct{ id, name string }
	users, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (contributor, error) {
		var user contributor
		err := row.Scan(&user.id, &user.name)
		return user, err
	})
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(users))
	for _, user := range users {
		allowed, err := documentAllowed(ctx, tx, user.id, session.DirectoryID, access.ActionEditContent)
		if err != nil {
			return nil, err
		}
		if allowed {
			names = append(names, user.name)
		}
	}
	return names, nil
}
