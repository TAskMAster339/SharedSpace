-- ============================================================
-- SharedSpace — схема БД (PostgreSQL)
-- Запускается как есть. Таблицы создаются в порядке зависимостей,
-- внешние ключи описаны inline, перечисления — через CHECK.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- для gen_random_uuid() на старых версиях PG

-- ------------------------------------------------------------
-- Пользователи
-- ------------------------------------------------------------
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username      varchar(50)  UNIQUE NOT NULL,
  first_name    varchar(50),
  second_name   varchar(50),
  email         varchar(255) UNIQUE NOT NULL,
  password_hash varchar(255) NOT NULL,
  storage_quota bigint       NOT NULL,
  storage_used  bigint       NOT NULL,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Refresh-токены (access-токены не храним — они stateless)
-- token_hash = хеш токена, а не сам токен
-- ------------------------------------------------------------
CREATE TABLE refresh_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash varchar(255) UNIQUE NOT NULL,
  user_agent varchar(255),
  ip_address varchar(45),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

-- ------------------------------------------------------------
-- Виртуальные директории (дерево через parent_id)
-- parent_id = NULL -> корневая папка
-- deleted_at <> NULL -> в корзине
-- ------------------------------------------------------------
CREATE TABLE directories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       varchar(255) NOT NULL,
  owner_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id  uuid REFERENCES directories(id) ON DELETE CASCADE,
  type       varchar(20) NOT NULL DEFAULT 'regular'
               CHECK (type IN ('root', 'regular')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX idx_directories_owner  ON directories(owner_id);
CREATE INDEX idx_directories_parent ON directories(parent_id);
-- запрет дублей имён в одной папке (только среди не удалённых)
CREATE UNIQUE INDEX idx_directories_unique_name
  ON directories(owner_id, parent_id, name)
  WHERE deleted_at IS NULL;

-- ------------------------------------------------------------
-- Общая директория: директория становится общей,
-- когда у неё появляется запись здесь
-- ------------------------------------------------------------
CREATE TABLE shared_directories (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  directory_id uuid UNIQUE NOT NULL REFERENCES directories(id) ON DELETE CASCADE,
  owner_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Участники общей директории и их роли
--  viewer  — просмотр/скачивание
--  editor  — viewer + загрузка файлов
--  admin   — полный контроль (правка, удаление, управление участниками)
-- ------------------------------------------------------------
CREATE TABLE shared_directory_members (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_directory_id uuid NOT NULL REFERENCES shared_directories(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role                varchar(20) NOT NULL
                        CHECK (role IN ('viewer', 'editor', 'admin')),
  joined_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shared_directory_id, user_id)
);

-- ------------------------------------------------------------
-- Файлы (метаданные; байты лежат в MinIO под object_key)
-- ------------------------------------------------------------
CREATE TABLE files (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  directory_id uuid NOT NULL REFERENCES directories(id) ON DELETE CASCADE,
  owner_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename     varchar(255) NOT NULL,
  extension    varchar(20)  NOT NULL,
  mime_type    varchar(255) NOT NULL,
  size         bigint NOT NULL,
  object_key   text UNIQUE NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE INDEX idx_files_directory ON files(directory_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_files_owner     ON files(owner_id);

-- ------------------------------------------------------------
-- Избранное (связка многие-ко-многим)
-- ------------------------------------------------------------
CREATE TABLE favorite_files (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_id    uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, file_id)
);

-- ------------------------------------------------------------
-- Ссылки общего доступа на файлы
-- ------------------------------------------------------------
CREATE TABLE share_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id     uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  token       varchar(64) UNIQUE NOT NULL,
  access_type varchar(20) NOT NULL
                CHECK (access_type IN ('public', 'authenticated')),
  created_by  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_share_links_file ON share_links(file_id);

-- ------------------------------------------------------------
-- Приглашения в общую директорию
-- ------------------------------------------------------------
CREATE TABLE directory_invitations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_directory_id uuid NOT NULL REFERENCES shared_directories(id) ON DELETE CASCADE,
  invited_user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role                varchar(20) NOT NULL
                        CHECK (role IN ('viewer', 'editor', 'admin')),
  status              varchar(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'accepted', 'declined', 'revoked')),
  created_at          timestamptz NOT NULL DEFAULT now()
);
-- нельзя создать два активных приглашения одному юзеру в одну папку
CREATE UNIQUE INDEX idx_invitations_unique_pending
  ON directory_invitations(shared_directory_id, invited_user_id)
  WHERE status = 'pending';

-- ------------------------------------------------------------
-- История конвертаций изображений
-- ------------------------------------------------------------
CREATE TABLE file_conversions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_file_id uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  result_file_id uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  source_format  varchar(20) NOT NULL,
  target_format  varchar(20) NOT NULL,
  created_by     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now()
);
