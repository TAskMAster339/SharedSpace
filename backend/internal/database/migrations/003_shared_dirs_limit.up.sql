ALTER TABLE users
    ADD COLUMN IF NOT EXISTS shared_dirs_count int NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS shared_dirs_quota int NOT NULL DEFAULT 5;

UPDATE users u
SET shared_dirs_count = (
    SELECT COUNT(*) FROM shared_directories sd WHERE sd.owner_id = u.id
);