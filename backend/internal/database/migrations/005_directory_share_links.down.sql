DROP INDEX IF EXISTS idx_share_links_directory;
ALTER TABLE share_links DROP CONSTRAINT IF EXISTS share_links_target_check;
ALTER TABLE share_links ALTER COLUMN file_id SET NOT NULL;
ALTER TABLE share_links DROP COLUMN IF EXISTS directory_id;
