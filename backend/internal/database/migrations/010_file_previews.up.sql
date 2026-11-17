CREATE TABLE file_previews (
    file_id uuid PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
    object_key text UNIQUE NOT NULL,
    size bigint NOT NULL CHECK (size > 0),
    mime_type text NOT NULL DEFAULT 'image/jpeg',
    created_at timestamptz NOT NULL DEFAULT now()
);
