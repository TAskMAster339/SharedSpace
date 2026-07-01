ALTER TABLE users
    DROP COLUMN IF EXISTS share_links_count,
    DROP COLUMN IF EXISTS share_links_quota;
