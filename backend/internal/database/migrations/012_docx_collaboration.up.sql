CREATE TABLE file_versions (
    file_id uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    number bigint NOT NULL CHECK (number > 0),
    object_key text NOT NULL,
    size bigint NOT NULL CHECK (size >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    contributors text[] NOT NULL DEFAULT '{}',
    PRIMARY KEY (file_id, number)
);

CREATE INDEX file_versions_object_key ON file_versions (object_key);

CREATE TABLE document_edit_sessions (
    key uuid PRIMARY KEY,
    file_id uuid REFERENCES files(id) ON DELETE SET NULL,
    directory_id uuid NOT NULL,
    base_object_key text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_grant_at timestamptz NOT NULL DEFAULT now(),
    closed_at timestamptz,
    result_url text,
    pending_key text,
    pending_size bigint,
    CHECK ((pending_key IS NULL) = (pending_size IS NULL))
);

CREATE UNIQUE INDEX document_edit_sessions_open
    ON document_edit_sessions (file_id) WHERE closed_at IS NULL;

CREATE TABLE document_edit_members (
    session_key uuid NOT NULL REFERENCES document_edit_sessions(key) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    username text NOT NULL,
    reserved_until timestamptz NOT NULL,
    connected boolean NOT NULL DEFAULT false,
    participated boolean NOT NULL DEFAULT false,
    PRIMARY KEY (session_key, user_id)
);

CREATE TABLE file_version_cleanup (
    object_key text PRIMARY KEY,
    eligible_at timestamptz NOT NULL DEFAULT now() + interval '1 hour'
);

CREATE FUNCTION queue_file_version_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO file_version_cleanup (object_key) VALUES (OLD.object_key)
        ON CONFLICT (object_key) DO UPDATE SET eligible_at = EXCLUDED.eligible_at;
    RETURN NULL;
END;
$$;

CREATE TRIGGER file_version_cleanup_after_delete
    AFTER DELETE ON file_versions FOR EACH ROW EXECUTE FUNCTION queue_file_version_cleanup();
