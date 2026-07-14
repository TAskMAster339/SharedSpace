ALTER TABLE share_links
    ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

UPDATE share_links SET is_active = true WHERE is_active IS NULL;
