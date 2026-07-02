# Сущности базы данных

## ER-диаграмма

![ER-диаграмма](/docs/images/ER.jpg)

## Таблицы

### `users` — Пользователи

| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | Уникальный идентификатор |
| username | varchar(50) UNIQUE | Имя пользователя |
| first_name | varchar(50) | Имя |
| second_name | varchar(50) | Фамилия |
| email | varchar(255) UNIQUE | Email |
| password_hash | varchar(255) | Хэш пароля (bcrypt) |
| storage_quota | bigint | Квота хранилища (байты) |
| storage_used | bigint | Использовано (байты) |
| shared_dirs_count | int | Количество общих директорий |
| shared_dirs_quota | int | Лимит общих директорий (5) |
| share_links_count | int | Количество ссылок |
| share_links_quota | int | Лимит ссылок (100) |
| created_at | timestamptz | Дата создания |
| updated_at | timestamptz | Дата обновления |

### `refresh_tokens` — Refresh токены

| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | ID токена |
| user_id | uuid FK→users | Владелец токена (CASCADE) |
| token_hash | varchar(255) UNIQUE | SHA-256 хэш токена |
| user_agent | varchar(255) | User-Agent |
| ip_address | varchar(45) | IP адрес |
| expires_at | timestamptz | Срок истечения |
| revoked_at | timestamptz? | Дата отзыва |
| created_at | timestamptz | Дата создания |

### `directories` — Директории

| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | ID директории |
| name | varchar(255) | Название |
| owner_id | uuid FK→users | Владелец (CASCADE) |
| parent_id | uuid FK→directories? | Родительская директория |
| type | varchar(20) | `root` или `regular` |
| files_count | int | Количество файлов |
| created_at | timestamptz | Дата создания |
| updated_at | timestamptz | Дата обновления |
| deleted_at | timestamptz? | Мягкое удаление |

### `shared_directories` — Общие директории

| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | ID записи |
| directory_id | uuid UNIQUE FK→directories | Директория |
| owner_id | uuid FK→users | Владелец |
| created_at | timestamptz | Дата создания |

### `shared_directory_members` — Участники общих директорий

| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | ID записи |
| shared_directory_id | uuid FK→shared_directories | Общая директория |
| user_id | uuid FK→users | Пользователь |
| role | varchar(20) | Роль: `viewer`, `editor`, `admin` |
| joined_at | timestamptz | Дата присоединения |

**Unique constraint**: (shared_directory_id, user_id)

### `files` — Файлы

| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | ID файла |
| directory_id | uuid FK→directories | Родительская директория |
| owner_id | uuid FK→users | Владелец |
| filename | varchar(255) | Имя файла |
| extension | varchar(20) | Расширение |
| mime_type | varchar(255) | MIME-тип |
| size | bigint | Размер (байты) |
| object_key | text UNIQUE | Ключ в MinIO |
| created_at | timestamptz | Дата создания |
| updated_at | timestamptz | Дата обновления |
| deleted_at | timestamptz? | Мягкое удаление |

### `favorite_files` — Избранные файлы

| Поле | Тип | Описание |
|------|-----|----------|
| user_id | uuid FK→users (PK) | Пользователь |
| file_id | uuid FK→files (PK) | Файл |
| created_at | timestamptz | Дата добавления |

### `share_links` — Публичные ссылки

| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | ID ссылки |
| file_id | uuid FK→files? | Файл |
| directory_id | uuid FK→directories? | Директория |
| token | varchar(64) UNIQUE | Уникальный токен |
| access_type | varchar(20) | `public` или `authenticated` |
| created_by | uuid FK→users | Создатель |
| expires_at | timestamptz? | Срок действия |
| password_hash | varchar(255)? | Хэш пароля |
| created_at | timestamptz | Дата создания |

**Constraint**: ровно одно из file_id/directory_id должно быть заполнено.

### `directory_invitations` — Приглашения в общие директории

| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | ID приглашения |
| shared_directory_id | uuid FK→shared_directories | Общая директория |
| invited_user_id | uuid FK→users | Приглашаемый пользователь |
| invited_by | uuid FK→users | Кто пригласил |
| role | varchar(20) | Предлагаемая роль |
| status | varchar(20) | Статус: `pending`, `accepted`, `declined`, `revoked` |
| created_at | timestamptz | Дата создания |

### `file_conversions` — Конвертации файлов

| Поле | Тип | Описание |
|------|-----|----------|
| id | uuid PK | ID конвертации |
| source_file_id | uuid FK→files | Исходный файл |
| result_file_id | uuid FK→files | Результат |
| source_format | varchar(20) | Исходный формат |
| target_format | varchar(20) | Целевой формат |
| created_by | uuid FK→users | Кто конвертировал |
| created_at | timestamptz | Дата конвертации |

## Связи

- `users` 1→N `refresh_tokens` — у пользователя может быть много refresh токенов
- `users` 1→N `directories` — пользователь владеет множеством директорий
- `directories` 1→N `directories` (self-ref) — вложенность директорий
- `directories` 1→N `files` — в директории много файлов
- `shared_directories` 1→N `shared_directory_members` — у общей директории много участников
- `files` N→M `users` (через `favorite_files`) — файлы в избранном
- `share_links` → `files` OR `directories` — ссылка ведёт на файл или директорию

## Связанные страницы

- [Архитектура](architecture.md)
- [API Эндпоинты](api-endpoints.md)
