DROP TRIGGER files_enforce_audio_directory_content ON files;
DROP FUNCTION enforce_audio_directory_content();
DROP TABLE directory_covers;
DROP TRIGGER directories_provision_music ON directories;
DROP FUNCTION provision_music_directory_after_root_insert();
DROP FUNCTION provision_music_directory(uuid, uuid);
DROP INDEX directories_one_music_root_per_owner;
ALTER TABLE directories
    DROP CONSTRAINT directories_music_root_attributes,
    DROP COLUMN is_music_root,
    DROP COLUMN purpose;
