# Миграции базы данных

## Общая информация

Миграции находятся в `backend/migrations/` и применяются автоматически при запуске сервера через `database.Migrate()`.

**Движок:** кастомный (не external-инструмент), читает `.up.sql` файлы из директории, сортирует по имени, применяет невыполненные миграции.

## Структура файла

Каждая миграция — обычный SQL-файл:

```
backend/migrations/
  001_create_users.up.sql
  002_create_share_links_password.up.sql
  003_add_quota_columns.up.sql
  004_add_files_count.up.sql
  005_add_directory_share_links.up.sql
  006_add_share_links_quota.up.sql
```

### Правила именования

```
<номер>_<описание>.up.sql
```

- **Номер**: трёхзначный (001, 002, ...), определяет порядок применения
- **Описание**: snake_case, краткое описание изменений
- **Только `.up.sql`**: откат миграций (`.down.sql`) не поддерживается

## Таблица `schema_migrations`

PostgreSQL таблица для отслеживания применённых миграций:

```sql
CREATE TABLE schema_migrations (
    filename   varchar(255) PRIMARY KEY,
    applied_at timestamptz  NOT NULL DEFAULT NOW()
);
```

## Как создать новую миграцию

1. Определить номер: `ls backend/migrations/*.up.sql | wc -l` и прибавить 1
2. Создать файл: `006_my_change.up.sql`
3. Написать SQL (в транзакции, если нужно):

```sql
-- 006_add_share_links_quota.up.sql
ALTER TABLE users
  ADD COLUMN share_links_count  int  NOT NULL DEFAULT 0,
  ADD COLUMN share_links_quota  int  NOT NULL DEFAULT 100;
```

4. Перезапустить бэкенд — миграция применится автоматически

## Правила и рекомендации

- **Не редактировать** уже применённые миграции — создавайте новые
- Все изменения должны быть **идемпотентными** (используйте `IF NOT EXISTS`, `IF EXISTS`)
- Для новых таблиц: всегда используйте `uuid` PK с `gen_random_uuid()`
- Для внешних ключей: `uuid FK REFERENCES table (id) ON DELETE CASCADE` (кроме особых случаев)
- Для уникальных полей: `UNIQUE` constraint на уровне таблицы с именем
- Используйте `CREATE INDEX CONCURRENTLY` для больших таблиц (но в миграциях без CONCURRENTLY, т.к. они не в транзакции)

## Существующие миграции

| Файл | Что делает |
|------|------------|
| `001_create_users.up.sql` | Создание таблиц users, refresh_tokens, directories, files, shared_directories, shared_directory_members, favorite_files |
| `002_create_share_links_password.up.sql` | Добавление password_hash в share_links |
| `003_add_quota_columns.up.sql` | Добавление shared_dirs_count, shared_dirs_quota в users |
| `004_add_files_count.up.sql` | Добавление files_count в directories |
| `005_add_directory_share_links.up.sql` | Добавление directory_id в share_links (опционально file_id или directory_id) |
| `006_add_share_links_quota.up.sql` | Добавление share_links_count, share_links_quota в users |

## Связанные страницы

- [Сущности БД](entities.md) — описание всех таблиц
- [Архитектура](architecture.md) — как подключается БД
