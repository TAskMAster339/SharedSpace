ALTER TABLE directories
    ADD COLUMN IF NOT EXISTS files_count int NOT NULL DEFAULT 0;

WITH RECURSIVE subtree AS (
    SELECT id AS root_id, id AS node_id
    FROM directories
    UNION ALL
    SELECT s.root_id, d.id
    FROM directories d
    JOIN subtree s ON d.parent_id = s.node_id
),
counts AS (
    SELECT s.root_id AS directory_id, COUNT(f.id) AS cnt
    FROM subtree s
    LEFT JOIN files f ON f.directory_id = s.node_id AND f.deleted_at IS NULL
    GROUP BY s.root_id
)
UPDATE directories d
SET files_count = counts.cnt
FROM counts
WHERE d.id = counts.directory_id;