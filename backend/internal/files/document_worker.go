package files

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"

	"sharedspace/internal/access"
)

func (s *DocumentService) StartWorker(ctx context.Context) {
	go func() {
		presence := time.NewTicker(5 * time.Second)
		cleanup := time.NewTicker(cleanupPeriod)
		defer presence.Stop()
		defer cleanup.Stop()
		var cursor string
		for {
			select {
			case <-ctx.Done():
				return
			case <-presence.C:
				if len(s.secret) != 0 {
					runCtx, cancel := context.WithTimeout(ctx, time.Minute)
					s.reconcileDocuments(runCtx)
					cancel()
				}
			case <-cleanup.C:
				runCtx, cancel := context.WithTimeout(ctx, cleanupTimeout)
				cursor = s.cleanupDocumentVersions(runCtx, cursor)
				cancel()
			}
		}
	}()
}

func (s *DocumentService) reconcileDocuments(ctx context.Context) {
	// Reservations for unopened editors expire on their own.
	if _, err := s.db.Exec(ctx, `UPDATE document_edit_sessions s SET closed_at = now()
		WHERE closed_at IS NULL AND result_url IS NULL AND pending_key IS NULL
		AND last_grant_at < now() - interval '2 minutes'
		AND NOT EXISTS (SELECT 1 FROM document_edit_members m WHERE m.session_key = s.key
			AND (m.participated OR m.reserved_until > now()))`); err != nil {
		log.Printf("document reservation cleanup: %v", err)
	}
	rows, err := s.db.Query(ctx, "SELECT "+sessionColumns+" FROM document_edit_sessions WHERE closed_at IS NULL ORDER BY created_at")
	if err != nil {
		log.Printf("document session lookup: %v", err)
		return
	}
	sessions, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (documentSession, error) { return readDocumentSession(row) })
	if err != nil {
		log.Printf("document sessions: %v", err)
		return
	}
	for _, session := range sessions {
		if ctx.Err() != nil {
			return
		}
		err := s.dropRevokedDocumentUsers(ctx, session)
		if err != nil {
			log.Printf("document access reconciliation %s: %v", session.Key, err)
		}
		// Retry pending saves independently of other active sessions.
		if session.PendingKey != nil || session.ResultURL != nil {
			attempt, cancel := context.WithTimeout(ctx, 12*time.Second)
			err := s.finishDocument(attempt, session.Key)
			cancel()
			if err != nil {
				log.Printf("document save pending %s: %v", session.Key, err)
			}
		}
	}
}

func (s *DocumentService) dropRevokedDocumentUsers(ctx context.Context, session documentSession) error {
	rows, err := s.db.Query(ctx, `SELECT user_id FROM document_edit_members WHERE session_key = $1 AND connected`, session.Key)
	if err != nil {
		return err
	}
	users, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil || len(users) == 0 {
		return err
	}
	invalid := session.FileID == nil
	if !invalid {
		file, err := s.files.FindByID(ctx, s.db, *session.FileID)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		invalid = errors.Is(err, pgx.ErrNoRows) || ExtractExtension(file.Filename) != session.Format || file.DirectoryID != session.DirectoryID || file.ObjectKey != session.BaseKey
	}
	revoked := make([]string, 0, len(users))
	for _, user := range users {
		if invalid {
			revoked = append(revoked, user)
			continue
		}
		allowed, err := documentAllowed(ctx, s.db, user, session.DirectoryID, access.ActionEditContent)
		if err != nil {
			return err
		}
		if !allowed {
			revoked = append(revoked, user)
		}
	}
	if len(revoked) == 0 {
		return nil
	}
	commandCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return s.dropEditors(commandCtx, session.Key, revoked)
}

func (s *DocumentService) dropEditors(ctx context.Context, key string, users []string) error {
	command := map[string]any{"c": "drop", "key": key, "users": users}
	payload := jwt.MapClaims{"payload": command, "operation": "command", "exp": time.Now().Add(time.Minute).Unix()}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, payload).SignedString(s.secret)
	if err != nil {
		return err
	}
	location := s.internal.JoinPath("command")
	location.RawQuery = url.Values{"shardkey": {key}}.Encode()
	body, err := json.Marshal(command)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, location.String(), bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("document command returned HTTP %d", resp.StatusCode)
	}
	var result struct {
		Error *int `json:"error"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 64<<10)).Decode(&result); err != nil {
		return err
	}
	if result.Error == nil {
		return errors.New("missing document command status")
	}
	if *result.Error != 0 {
		return fmt.Errorf("document command error %d", *result.Error)
	}
	return nil
}

func (s *DocumentService) cleanupDocumentVersions(ctx context.Context, cursor string) string {
	// Closed unpublished results can be recovered for seven days when a file
	// moved or its last editor lost access; deletion ends that retention.
	if _, err := s.db.Exec(ctx, `DELETE FROM document_edit_sessions WHERE
		(closed_at IS NOT NULL AND (file_id IS NULL OR closed_at < now() - interval '7 days'))`); err != nil {
		log.Printf("document session cleanup: %v", err)
	}
	rows, err := s.db.Query(ctx, `SELECT object_key FROM file_version_cleanup
		WHERE eligible_at <= now() ORDER BY eligible_at LIMIT 500`)
	if err != nil {
		log.Printf("document cleanup queue: %v", err)
		return cursor
	}
	keys, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		log.Printf("document cleanup queue: %v", err)
		return cursor
	}
	for _, key := range keys {
		if err := s.removeUnreferencedVersion(ctx, key); err != nil {
			log.Printf("document cleanup %s: %v", key, err)
			continue
		}
		if _, err := s.db.Exec(ctx, `DELETE FROM file_version_cleanup WHERE object_key = $1 AND eligible_at <= now()`, key); err != nil {
			log.Printf("document cleanup queue %s: %v", key, err)
		}
	}
	// Sweep objects uploaded before an interrupted or duplicate stage request.
	keys, next, err := s.storage.ListOldObjectPage(ctx, documentObjectPrefix, cursor, time.Now().Add(-time.Hour), 500)
	if err != nil {
		log.Printf("document orphan listing: %v", err)
		return cursor
	}
	for _, key := range keys {
		if err := s.removeUnreferencedVersion(ctx, key); err != nil {
			log.Printf("document orphan %s: %v", key, err)
		}
	}
	return next
}

func (s *DocumentService) removeUnreferencedVersion(ctx context.Context, key string) error {
	var referenced bool
	err := s.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM files WHERE object_key = $1)
		OR EXISTS (SELECT 1 FROM file_versions WHERE object_key = $1)
		OR EXISTS (SELECT 1 FROM document_edit_sessions WHERE pending_key = $1)`, key).Scan(&referenced)
	if err != nil || referenced {
		return err
	}
	return s.storage.Delete(ctx, key)
}
