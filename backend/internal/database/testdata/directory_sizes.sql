BEGIN;
CREATE FUNCTION pg_temp.fixture_id(n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS 'SELECT md5(n::text)::uuid';
CREATE FUNCTION pg_temp.assert_directory_sizes() RETURNS void LANGUAGE plpgsql AS $$
DECLARE mismatch record;
BEGIN
    WITH RECURSIVE subtree(root_id, node_id) AS (
        SELECT id, id FROM directories
        UNION
        SELECT s.root_id, d.id FROM subtree s JOIN directories d ON d.parent_id = s.node_id
    ), expected AS (
        SELECT s.root_id, COALESCE(SUM(f.size), 0)::bigint AS bytes
        FROM subtree s LEFT JOIN files f ON f.directory_id = s.node_id AND f.deleted_at IS NULL
        GROUP BY s.root_id
    )
    SELECT d.name, d.size_bytes AS actual, e.bytes AS expected INTO mismatch
    FROM directories d JOIN expected e ON e.root_id = d.id WHERE d.size_bytes <> e.bytes LIMIT 1;
    IF FOUND THEN RAISE EXCEPTION 'size mismatch for %: got %, expected %', mismatch.name, mismatch.actual, mismatch.expected; END IF;
END;
$$;

INSERT INTO users(id,username,email,password_hash,storage_quota,storage_used) VALUES
(pg_temp.fixture_id(1),'sizes-one','sizes-one@example.com','test',1000000,0),
(pg_temp.fixture_id(2),'sizes-two','sizes-two@example.com','test',1000000,0);
INSERT INTO directories(id,name,owner_id,parent_id,type) VALUES
(pg_temp.fixture_id(10),'root-one',pg_temp.fixture_id(1),NULL,'root'),
(pg_temp.fixture_id(20),'root-two',pg_temp.fixture_id(2),NULL,'root');
INSERT INTO directories(id,name,owner_id,parent_id) VALUES
(pg_temp.fixture_id(11),'a',pg_temp.fixture_id(1),pg_temp.fixture_id(10)),
(pg_temp.fixture_id(12),'b',pg_temp.fixture_id(1),pg_temp.fixture_id(10)),
(pg_temp.fixture_id(13),'nested',pg_temp.fixture_id(1),pg_temp.fixture_id(11));
INSERT INTO files(id,directory_id,owner_id,filename,extension,mime_type,size,object_key) VALUES
(pg_temp.fixture_id(101),pg_temp.fixture_id(11),pg_temp.fixture_id(1),'one.jpg','jpg','image/jpeg',120,'sizes/one'),
(pg_temp.fixture_id(102),pg_temp.fixture_id(13),pg_temp.fixture_id(1),'two.mp4','mp4','video/mp4',300,'sizes/two'),
(pg_temp.fixture_id(103),pg_temp.fixture_id(10),pg_temp.fixture_id(1),'zero.txt','txt','text/plain',0,'sizes/zero');
SELECT pg_temp.assert_directory_sizes();
-- Previews do not count towards folder sizes.
INSERT INTO file_previews(file_id,object_key,size) VALUES (pg_temp.fixture_id(101),'previews/sizes.jpg',40);
SELECT pg_temp.assert_directory_sizes();
-- Metadata-only updates, conversion/new files, replacement, same-parent move.
UPDATE files SET filename='renamed.jpg' WHERE id=pg_temp.fixture_id(101);
UPDATE files SET size=400 WHERE id=pg_temp.fixture_id(102);
UPDATE files SET directory_id=directory_id;
SELECT pg_temp.assert_directory_sizes();
-- File moves with common ancestors, followed by a move across roots.
UPDATE files SET directory_id=pg_temp.fixture_id(12) WHERE id=pg_temp.fixture_id(101);
SELECT pg_temp.assert_directory_sizes();
UPDATE files SET directory_id=pg_temp.fixture_id(20) WHERE id=pg_temp.fixture_id(101);
SELECT pg_temp.assert_directory_sizes();
-- Moving the entire subtree changes its old and new ancestors, never its own size.
UPDATE directories SET parent_id=pg_temp.fixture_id(12) WHERE id=pg_temp.fixture_id(11);
SELECT pg_temp.assert_directory_sizes();
UPDATE directories SET parent_id=pg_temp.fixture_id(20) WHERE id=pg_temp.fixture_id(12);
SELECT pg_temp.assert_directory_sizes();
-- Reject cycles at the database boundary, too.
DO $$ BEGIN
    BEGIN
        UPDATE directories SET parent_id=pg_temp.fixture_id(13) WHERE id=pg_temp.fixture_id(12);
        RAISE EXCEPTION 'cycle was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END $$;
SELECT pg_temp.assert_directory_sizes();
-- Soft-delete/restore and repeated requests must not double-count.
UPDATE files SET deleted_at=now() WHERE id=pg_temp.fixture_id(102);
UPDATE files SET deleted_at=now() WHERE id=pg_temp.fixture_id(102);
SELECT pg_temp.assert_directory_sizes();
UPDATE files SET deleted_at=NULL WHERE id=pg_temp.fixture_id(102);
UPDATE files SET deleted_at=NULL WHERE id=pg_temp.fixture_id(102);
SELECT pg_temp.assert_directory_sizes();
SAVEPOINT before_changes;
UPDATE files SET size=9999;
SELECT pg_temp.assert_directory_sizes();
ROLLBACK TO SAVEPOINT before_changes;
SELECT pg_temp.assert_directory_sizes();
-- A file trashed earlier must remain in trash when its folder is restored.
UPDATE files SET deleted_at='2000-01-01T00:00:00Z' WHERE id=pg_temp.fixture_id(102);
INSERT INTO files(id,directory_id,owner_id,filename,extension,mime_type,size,object_key)
VALUES(pg_temp.fixture_id(104),pg_temp.fixture_id(13),pg_temp.fixture_id(1),'live.txt','txt','text/plain',70,'sizes/live');
-- A folder and all descendants go to trash and back in one transaction.
UPDATE files SET deleted_at='2026-01-01T00:00:00Z' WHERE directory_id IN (pg_temp.fixture_id(11),pg_temp.fixture_id(12),pg_temp.fixture_id(13)) AND deleted_at IS NULL;
UPDATE directories SET deleted_at=now() WHERE id IN (pg_temp.fixture_id(11),pg_temp.fixture_id(12),pg_temp.fixture_id(13));
SELECT pg_temp.assert_directory_sizes();
UPDATE files SET deleted_at=NULL WHERE directory_id IN (pg_temp.fixture_id(11),pg_temp.fixture_id(12),pg_temp.fixture_id(13)) AND deleted_at='2026-01-01T00:00:00Z';
UPDATE directories SET deleted_at=NULL WHERE id IN (pg_temp.fixture_id(11),pg_temp.fixture_id(12),pg_temp.fixture_id(13));
SELECT pg_temp.assert_directory_sizes();
DO $$ BEGIN
 IF (SELECT deleted_at IS NULL FROM files WHERE id=pg_temp.fixture_id(102)) THEN RAISE EXCEPTION 'older trash was restored'; END IF;
END $$;
-- Hard-delete a live subtree. Flush deferred reconciliation just as COMMIT does.
DELETE FROM directories WHERE id IN (pg_temp.fixture_id(13),pg_temp.fixture_id(12),pg_temp.fixture_id(11));
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.assert_directory_sizes();
SET CONSTRAINTS ALL DEFERRED;
-- Hard-delete an active file, then the account: cascade paths must remain safe.
DELETE FROM files WHERE id=pg_temp.fixture_id(101);
SELECT pg_temp.assert_directory_sizes();
INSERT INTO directories(id,name,owner_id,parent_id) VALUES
(pg_temp.fixture_id(14),'owned-in-another-tree',pg_temp.fixture_id(1),pg_temp.fixture_id(20));
INSERT INTO files(directory_id,owner_id,filename,extension,mime_type,size,object_key) VALUES
(pg_temp.fixture_id(14),pg_temp.fixture_id(2),'foreign-owned-file','txt','text/plain',80,'sizes/foreign'),
(pg_temp.fixture_id(20),pg_temp.fixture_id(1),'owned-file-in-shared-tree','txt','text/plain',90,'sizes/owned');
SELECT pg_temp.assert_directory_sizes();
DELETE FROM users WHERE id=pg_temp.fixture_id(1);
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.assert_directory_sizes();
COMMIT;
