CREATE TABLE office_session_leases (
    id uuid PRIMARY KEY,
    editor_key uuid REFERENCES document_edit_sessions(key) ON DELETE CASCADE,
    editor_user_id uuid,
    expires_at timestamptz NOT NULL,
    CHECK ((editor_key IS NULL) = (editor_user_id IS NULL))
);

CREATE INDEX office_session_leases_editor ON office_session_leases (editor_key, editor_user_id);
