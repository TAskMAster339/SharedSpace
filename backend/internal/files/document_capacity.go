package files

import (
	"context"
	"net/http"

	"github.com/google/uuid"

	"sharedspace/internal/apperror"
)

const officeCapacity = 10

const officeLeaseDuration = "5 minutes"

const activeOfficeLeases = `WITH active_leases AS (
	SELECT l.id, l.editor_key, l.editor_user_id
	FROM office_session_leases l
	LEFT JOIN document_edit_sessions s ON s.key = l.editor_key
	LEFT JOIN document_edit_members m ON m.session_key = l.editor_key AND m.user_id = l.editor_user_id
	WHERE s.closed_at IS NULL AND (l.expires_at > now() OR m.connected)
)`

func admitOfficeSession(ctx context.Context, tx dbTX, editorKey, userID string) (string, error) {
	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended('sharedspace.office.capacity', 0))"); err != nil {
		return "", err
	}
	if _, err := tx.Exec(ctx, activeOfficeLeases+` DELETE FROM office_session_leases
		WHERE id NOT IN (SELECT id FROM active_leases)`); err != nil {
		return "", err
	}

	var occupied int
	err := tx.QueryRow(ctx, activeOfficeLeases+`, untracked_editors AS (
		SELECT m.session_key, m.user_id
		FROM document_edit_members m JOIN document_edit_sessions s ON s.key = m.session_key
		WHERE s.closed_at IS NULL AND (m.connected OR m.reserved_until > now())
			AND NOT EXISTS (SELECT 1 FROM active_leases l WHERE l.editor_key = m.session_key AND l.editor_user_id = m.user_id)
			AND (m.session_key, m.user_id) IS DISTINCT FROM (NULLIF($1, '')::uuid, NULLIF($2, '')::uuid)
	)
	SELECT (SELECT count(*) FROM active_leases) + (SELECT count(*) FROM untracked_editors)`, editorKey, userID).Scan(&occupied)
	if err != nil {
		return "", err
	}
	if occupied >= officeCapacity {
		return "", apperror.New("все места для работы с офисными файлами заняты. Попробуйте позже", "office_capacity", http.StatusTooManyRequests)
	}

	id := uuid.NewString()
	_, err = tx.Exec(ctx, `INSERT INTO office_session_leases (id, editor_key, editor_user_id, expires_at)
		VALUES ($1, NULLIF($2, '')::uuid, NULLIF($3, '')::uuid, now() + $4::text::interval)`, id, editorKey, userID, officeLeaseDuration)
	return id, err
}

func (s *DocumentService) renewOfficeLease(ctx context.Context, id string) error {
	result, err := s.db.Exec(ctx, activeOfficeLeases+` UPDATE office_session_leases
		SET expires_at = now() + $2::text::interval WHERE id = $1 AND id IN (SELECT id FROM active_leases)`, id, officeLeaseDuration)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return officeLeaseExpired()
	}
	return nil
}

func (s *DocumentService) releaseOfficeLease(ctx context.Context, id string) error {
	_, err := s.db.Exec(ctx, "DELETE FROM office_session_leases WHERE id = $1", id)
	return err
}

func (s *DocumentService) checkOfficeLease(ctx context.Context, id string) error {
	if id == "" {
		return nil
	}
	var active bool
	if err := s.db.QueryRow(ctx, activeOfficeLeases+" SELECT EXISTS (SELECT 1 FROM active_leases WHERE id = $1)", id).Scan(&active); err != nil {
		return err
	}
	if !active {
		return officeLeaseExpired()
	}
	return nil
}

func officeLeaseExpired() error {
	return apperror.New("сеанс завершён. Откройте файл снова", "office_lease_expired", http.StatusGone)
}
