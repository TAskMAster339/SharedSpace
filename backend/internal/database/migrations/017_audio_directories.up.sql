ALTER TABLE directories
    ADD COLUMN purpose text NOT NULL DEFAULT 'general'
        CHECK (purpose IN ('general', 'audio')),
    ADD COLUMN is_music_root boolean NOT NULL DEFAULT false,
    ADD CONSTRAINT directories_music_root_attributes CHECK (
        NOT is_music_root OR (
            purpose = 'audio' AND type = 'regular' AND name = 'Музыка'
            AND parent_id IS NOT NULL AND deleted_at IS NULL
        )
    );

CREATE UNIQUE INDEX directories_one_music_root_per_owner
    ON directories(owner_id) WHERE is_music_root;

CREATE FUNCTION provision_music_directory(root_id uuid, root_owner_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    existing_id uuid;
    replacement text;
    suffix integer := 2;
BEGIN
    IF EXISTS (SELECT 1 FROM directories WHERE owner_id = root_owner_id AND is_music_root) THEN
        RETURN;
    END IF;

    SELECT id INTO existing_id FROM directories
    WHERE owner_id = root_owner_id AND parent_id = root_id
      AND name = 'Музыка' AND deleted_at IS NULL;

    IF existing_id IS NOT NULL THEN
        LOOP
            replacement := 'Музыка (' || suffix || ')';
            EXIT WHEN NOT EXISTS (
                SELECT 1 FROM directories
                WHERE owner_id = root_owner_id AND parent_id = root_id
                  AND name = replacement AND deleted_at IS NULL
            );
            suffix := suffix + 1;
        END LOOP;
        UPDATE directories SET name = replacement, updated_at = now() WHERE id = existing_id;
    END IF;

    INSERT INTO directories (name, owner_id, parent_id, purpose, is_music_root)
    VALUES ('Музыка', root_owner_id, root_id, 'audio', true);
END;
$$;

SELECT provision_music_directory(id, owner_id)
FROM directories WHERE type = 'root' AND deleted_at IS NULL;

CREATE FUNCTION provision_music_directory_after_root_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM provision_music_directory(NEW.id, NEW.owner_id);
    RETURN NEW;
END;
$$;

CREATE TRIGGER directories_provision_music
AFTER INSERT ON directories
FOR EACH ROW WHEN (NEW.type = 'root' AND NEW.deleted_at IS NULL)
EXECUTE FUNCTION provision_music_directory_after_root_insert();

CREATE TABLE directory_covers (
    directory_id uuid PRIMARY KEY REFERENCES directories(id) ON DELETE CASCADE,
    original_key text NOT NULL UNIQUE,
    preview_key text NOT NULL UNIQUE
);

CREATE FUNCTION enforce_audio_directory_content()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.mime_type NOT IN ('audio/mpeg', 'audio/aac', 'audio/mp4', 'audio/flac', 'audio/wav', 'audio/ogg')
       AND EXISTS (SELECT 1 FROM directories WHERE id = NEW.directory_id AND purpose = 'audio') THEN
        RAISE EXCEPTION 'unsupported file type in audio directory' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER files_enforce_audio_directory_content
BEFORE INSERT OR UPDATE OF directory_id, mime_type ON files
FOR EACH ROW EXECUTE FUNCTION enforce_audio_directory_content();
