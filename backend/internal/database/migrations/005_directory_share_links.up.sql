ALTER TABLE share_links ADD COLUMN directory_id uuid REFERENCES directories(id) ON DELETE CASCADE;
ALTER TABLE share_links ALTER COLUMN file_id DROP NOT NULL;
ALTER TABLE share_links ADD CONSTRAINT share_links_target_check
  CHECK ((file_id IS NOT NULL AND directory_id IS NULL) OR (file_id IS NULL AND directory_id IS NOT NULL));
CREATE INDEX idx_share_links_directory ON share_links(directory_id);
