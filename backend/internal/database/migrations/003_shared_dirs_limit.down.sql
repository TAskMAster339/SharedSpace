ALTER TABLE users
    DROP COLUMN IF EXISTS shared_dirs_count,
    DROP COLUMN IF EXISTS shared_dirs_quota;