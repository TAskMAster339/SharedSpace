ALTER TABLE users
    ADD COLUMN IF NOT EXISTS share_links_count int NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS share_links_quota int NOT NULL DEFAULT 100;

UPDATE users u
SET share_links_count = (
    SELECT COUNT(*) FROM share_links sl WHERE sl.created_by = u.id
);
