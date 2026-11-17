-- Cached logical size: active source files in the whole subtree. Preview objects
-- and files in trash are excluded. Readers never walk the subtree to get a size.
ALTER TABLE directories ADD COLUMN size_bytes bigint NOT NULL DEFAULT 0
    CHECK (size_bytes >= 0);

WITH RECURSIVE subtree(root_id, node_id) AS (
    SELECT id, id FROM directories
    UNION
    SELECT s.root_id, d.id FROM subtree s JOIN directories d ON d.parent_id = s.node_id
), totals AS (
    SELECT s.root_id, COALESCE(SUM(f.size), 0)::bigint AS bytes
    FROM subtree s LEFT JOIN files f ON f.directory_id = s.node_id AND f.deleted_at IS NULL
    GROUP BY s.root_id
)
UPDATE directories d SET size_bytes = t.bytes FROM totals t WHERE d.id = t.root_id;

-- File statements may run concurrently. Tree moves/deletes take the exclusive
-- side of this lock BEFORE taking row locks, so an upload cannot use an old path.
CREATE FUNCTION lock_directory_size_topology() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_TABLE_NAME = 'files' THEN
        PERFORM pg_advisory_xact_lock_shared(73421, 11);
    ELSE
        PERFORM pg_advisory_xact_lock(73421, 11);
    END IF;
    RETURN NULL;
END;
$$;
CREATE TRIGGER files_size_topology BEFORE INSERT OR UPDATE OR DELETE ON files
    FOR EACH STATEMENT EXECUTE FUNCTION lock_directory_size_topology();
CREATE TRIGGER directories_size_move_lock BEFORE UPDATE OF parent_id ON directories
    FOR EACH STATEMENT EXECUTE FUNCTION lock_directory_size_topology();
CREATE TRIGGER directories_size_delete_lock BEFORE DELETE ON directories
    FOR EACH STATEMENT EXECUTE FUNCTION lock_directory_size_topology();

CREATE FUNCTION apply_directory_size_deltas(ids uuid[], amounts bigint[]) RETURNS void LANGUAGE plpgsql AS $$
DECLARE item record;
BEGIN
    -- Combine both paths before updating: common ancestors receive the net delta.
    -- Lock roots first (UUID order), then walk down, keeping concurrent updates
    -- in a consistent order. UPDATE ... + delta prevents lost increments.
    FOR item IN
        WITH RECURSIVE changes AS (
            SELECT d.id, d.parent_id, x.delta, 0 AS depth, ARRAY[d.id] AS visited
            FROM unnest(ids, amounts) AS x(id, delta) JOIN directories d ON d.id = x.id
            WHERE x.delta <> 0
            UNION ALL
            SELECT d.id, d.parent_id, c.delta, c.depth + 1, c.visited || d.id
            FROM changes c JOIN directories d ON d.id = c.parent_id
            WHERE NOT d.id = ANY(c.visited)
        ), totals AS (
            SELECT id, parent_id, SUM(delta)::bigint AS delta, MAX(depth) AS depth
            FROM changes GROUP BY id, parent_id
        )
        SELECT * FROM totals WHERE delta <> 0
        ORDER BY (parent_id IS NOT NULL), CASE WHEN parent_id IS NULL THEN 0 ELSE -depth END, id
    LOOP
        UPDATE directories SET size_bytes = size_bytes + item.delta WHERE id = item.id;
    END LOOP;
END;
$$;

-- Transition tables batch all affected files in one statement. Bulk trash and
-- restore update each ancestor once, rather than once per file.
CREATE FUNCTION update_directory_sizes_from_files() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ids uuid[]; amounts bigint[];
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT array_agg(directory_id), array_agg(bytes) INTO ids, amounts FROM (
            SELECT directory_id, SUM(size)::bigint AS bytes FROM new_files
            WHERE deleted_at IS NULL GROUP BY directory_id
        ) x;
    ELSIF TG_OP = 'DELETE' THEN
        SELECT array_agg(directory_id), array_agg(bytes) INTO ids, amounts FROM (
            SELECT directory_id, -SUM(size)::bigint AS bytes FROM old_files
            WHERE deleted_at IS NULL GROUP BY directory_id
        ) x;
    ELSE
        SELECT array_agg(directory_id), array_agg(bytes) INTO ids, amounts FROM (
            SELECT directory_id, SUM(bytes)::bigint AS bytes FROM (
                SELECT directory_id, size AS bytes FROM new_files WHERE deleted_at IS NULL
                UNION ALL
                SELECT directory_id, -size AS bytes FROM old_files WHERE deleted_at IS NULL
            ) delta GROUP BY directory_id HAVING SUM(bytes) <> 0
        ) x;
    END IF;
    PERFORM apply_directory_size_deltas(ids, amounts);
    RETURN NULL;
END;
$$;
CREATE TRIGGER files_size_insert AFTER INSERT ON files REFERENCING NEW TABLE AS new_files
    FOR EACH STATEMENT EXECUTE FUNCTION update_directory_sizes_from_files();
CREATE TRIGGER files_size_update AFTER UPDATE ON files REFERENCING OLD TABLE AS old_files NEW TABLE AS new_files
    FOR EACH STATEMENT EXECUTE FUNCTION update_directory_sizes_from_files();
CREATE TRIGGER files_size_delete AFTER DELETE ON files REFERENCING OLD TABLE AS old_files
    FOR EACH STATEMENT EXECUTE FUNCTION update_directory_sizes_from_files();

CREATE FUNCTION validate_directory_size_parent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.parent_id IS NOT DISTINCT FROM OLD.parent_id THEN RETURN NEW; END IF;
    IF EXISTS (
        WITH RECURSIVE ancestors AS (
            SELECT id, parent_id FROM directories WHERE id = NEW.parent_id
            UNION
            SELECT d.id, d.parent_id FROM directories d JOIN ancestors a ON d.id = a.parent_id
        ) SELECT 1 FROM ancestors WHERE id = NEW.id
    ) THEN
        RAISE EXCEPTION 'directory cannot be moved into its own subtree'
            USING ERRCODE = '23514', CONSTRAINT = 'directories_acyclic';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER directories_size_parent_check BEFORE UPDATE OF parent_id ON directories
    FOR EACH ROW EXECUTE FUNCTION validate_directory_size_parent();

CREATE FUNCTION update_directory_sizes_from_move() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.parent_id IS DISTINCT FROM NEW.parent_id THEN
        PERFORM apply_directory_size_deltas(
            ARRAY[OLD.parent_id, NEW.parent_id], ARRAY[-NEW.size_bytes, NEW.size_bytes]);
    END IF;
    RETURN NULL;
END;
$$;
CREATE TRIGGER directories_size_move AFTER UPDATE OF parent_id ON directories
    FOR EACH ROW EXECUTE FUNCTION update_directory_sizes_from_move();

-- Cascading deletes can remove a path before its file triggers run. Reconcile
-- only surviving ancestors after all cascades, using direct files + cached
-- child sizes. Deferral also handles account deletion and arbitrary delete order.
CREATE FUNCTION reconcile_directory_sizes_after_delete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item record;
BEGIN
    FOR item IN
        WITH RECURSIVE ancestors AS (
            SELECT id, parent_id, 0 AS depth, ARRAY[id] AS visited FROM directories WHERE id = OLD.parent_id
            UNION ALL
            SELECT d.id, d.parent_id, a.depth + 1, a.visited || d.id
            FROM directories d JOIN ancestors a ON d.id = a.parent_id
            WHERE NOT d.id = ANY(a.visited)
        ) SELECT id FROM ancestors ORDER BY depth
    LOOP
        UPDATE directories SET size_bytes =
            COALESCE((SELECT SUM(size) FROM files WHERE directory_id = item.id AND deleted_at IS NULL), 0) +
            COALESCE((SELECT SUM(size_bytes) FROM directories WHERE parent_id = item.id), 0)
        WHERE id = item.id;
    END LOOP;
    RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER directories_size_delete AFTER DELETE ON directories
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reconcile_directory_sizes_after_delete();
