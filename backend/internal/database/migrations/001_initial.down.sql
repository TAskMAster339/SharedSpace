-- ============================================================
-- SharedSpace — откат миграции 001_initial
-- Порядок обратный созданию (FK → таблицы)
-- ============================================================

DROP TABLE IF EXISTS file_conversions       CASCADE;
DROP TABLE IF EXISTS directory_invitations   CASCADE;
DROP TABLE IF EXISTS share_links            CASCADE;
DROP TABLE IF EXISTS favorite_files          CASCADE;
DROP TABLE IF EXISTS files                   CASCADE;
DROP TABLE IF EXISTS shared_directory_members CASCADE;
DROP TABLE IF EXISTS shared_directories      CASCADE;
DROP TABLE IF EXISTS directories             CASCADE;
DROP TABLE IF EXISTS refresh_tokens          CASCADE;
DROP TABLE IF EXISTS users                   CASCADE;

-- DROP EXTENSION IF EXISTS pgcrypto;  -- не дропаем, т.к. может использоваться другими
