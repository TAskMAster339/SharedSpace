CREATE TABLE background_jobs (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind text NOT NULL,
    payload jsonb NOT NULL,
    request_key text,
    active_key text,
    state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'running', 'succeeded', 'failed')),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    finished_at timestamptz,
    attempts integer NOT NULL DEFAULT 0,
    lease_token uuid,
    lease_until timestamptz,
    result jsonb,
    error jsonb
);

CREATE UNIQUE INDEX background_jobs_request ON background_jobs (owner_id, request_key) WHERE request_key IS NOT NULL;
CREATE UNIQUE INDEX background_jobs_active ON background_jobs (owner_id, kind, active_key)
    WHERE active_key IS NOT NULL AND state IN ('queued', 'running');
CREATE INDEX background_jobs_ready ON background_jobs (available_at, created_at) WHERE state = 'queued';
CREATE INDEX background_jobs_leases ON background_jobs (lease_until) WHERE state = 'running';
CREATE INDEX background_jobs_finished ON background_jobs (finished_at) WHERE finished_at IS NOT NULL;

ALTER TABLE file_previews ADD COLUMN source_object_key text;
