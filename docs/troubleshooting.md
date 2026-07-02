# Troubleshooting / FAQ

## Бэкенд

### Не стартует бэкенд

**Симптом:** `go run cmd/api/main.go` завершается с ошибкой подключения к БД.

**Причина 1:** PostgreSQL не запущен или недоступен.

**Решение:**
```bash
# Проверить, запущен ли PostgreSQL
systemctl status postgresql  # или docker ps

# Проверить DSN
echo $DATABASE_URL
# Должно быть: postgres://user:password@host:5432/sharedspace?sslmode=disable

# Проверить доступность
psql $DATABASE_URL -c "SELECT 1"
```

**Причина 2:** MinIO не запущен или недоступен.

**Решение:**
```bash
# Проверить MinIO
curl http://localhost:9000/minio/health/live

# При локальном запуске MINIO_ENDPOINT должен быть localhost:9000, не minio:9000
```

### 401 на все запросы

**Симптом:** После логина все запросы возвращают 401.

**Причина:** Access token истёк, а refresh token отсутствует в cookie.

**Решение:**
```javascript
// Проверить cookie в браузере
document.cookie.includes('refresh_token')

// Если нет — перелогиниться
```

### 403 Forbidden

**Симптом:** Нет доступа к файлу/директории.

**Причина:** Пользователь не владелец и не участник общей директории с нужными правами.

**Решение:** Проверить роль в общей директории. Роли: `admin` (полный доступ), `editor` (чтение/запись), `viewer` (только чтение).

### 409 Conflict при регистрации

**Симптом:** Ошибка «Email уже используется» или «Имя пользователя уже занято».

**Причина:** Email или username уже зарегистрированы.

**Решение:** Использовать другой email/username. Восстановить пароль через `/auth/login` (если это ваша учётная запись).

### Upload возвращает 413

**Симптом:** При загрузке большого файла ошибка 413.

**Причина:** Размер файла превышает лимит 100 MB или лимит nginx.

**Решение:**
- Файлы >100 MB не поддерживаются
- При использовании nginx: проверить `client_max_body_size` в конфиге

### Ошибка «Миграции не применились»

**Симптом:** В логах ошибка `migration failed`.

**Причина:** SQL-синтаксис в новой миграции или конфликт с existing data.

**Решение:**
```bash
# Проверить последнюю миграцию
psql $DATABASE_URL -c "SELECT * FROM schema_migrations ORDER BY filename;"

# Откатить последнюю вручную (если нужно)
# Удалить строку из schema_migrations и выполнить SQL вручную
```

---

## Фронтенд

### Не загружается приложение (белый экран)

**Симптом:** После `npm start` открывается пустая страница.

**Причина 1:** Бэкенд недоступен, hydrate не проходит.

**Решение:** Проверить, что бэкенд запущен и доступен по `REACT_APP_API_BASE_URL`.

```bash
curl http://localhost:8080/api/v1/auth/login -X POST -d '{}'
```

**Причина 2:** Ошибка в консоли браузера (CORS, 404)

**Решение:**
```javascript
// Открыть консоль браузера (F12) → Console
// Проверить вкладку Network — какой запрос падает
```

### Токен не обновляется

**Симптом:** Проходит 1 час после логина, и все запросы начинают падать с 401.

**Причина:** Cookie refresh_token удалена или заблокирована браузером.

**Решение:**
```javascript
// Проверить cookie
document.cookie.includes('refresh_token')

// Убедиться, что SameSite=Strict не блокирует кросс-доменные запросы
// Cookie выставляется с Secure — нужен HTTPS для локальной разработки?
```

### Drag-and-drop не работает

**Симптом:** Файлы не загружаются при перетаскивании.

**Причина:** Страница не обёрнута в `DropZoneWrapper`.

**Решение:** Проверьте `App.tsx` — страница должна быть внутри `<DropZoneWrapper>`.

Сейчас обёрнуты: `/dashboard`, `/directories/:id`, `/favorites`.

### Конвертация не поддерживается

**Симптом:** В модалке конвертации нет доступных форматов или ошибка.

**Причина:** Формат файла не поддерживается для конвертации.

**Проверка:**
```javascript
import { isConvertSupported } from '../constants/convertFormats';
isConvertSupported(mimeType, extension);  // true/false
```

Поддерживаемые форматы: PNG, JPEG, GIF, BMP, TIFF, WebP (изображения); MP4, AVI, WebM, MKV, MOV (видео); MP3, WAV, AAC, FLAC, OGG (аудио).

### Не приходит приглашение

**Симптом:** Пригласили пользователя, но он не видит его в `/invitations`.

**Причина:** Статус приглашения может быть не `pending`.

**Решение:**
```bash
# Проверить в БД
SELECT * FROM directory_invitations WHERE invited_user_id = '<user_id>';
# Статус должен быть 'pending'
```

---

## Docker

### Не стартует контейнер PostgreSQL

**Симптом:** `docker compose up` — postgres выходит с ошибкой.

**Решение:**
```bash
# Проверить логи
docker compose logs postgres

# Возможно, порт 5432 занят
sudo lsof -i :5432

# Сбросить volume
docker compose down -v && docker compose up
```

### MinIO возвращает 403

**Симптом:** Файлы не загружаются, в ответе 403 от MinIO.

**Причина 1:** `MINIO_PUBLIC_USE_SSL=true` при локальном запуске — presigned URL генерируются с HTTPS, но локальный сервер работает по HTTP, браузер блокирует mixed content.

**Решение 1:** В `.env` поставить `MINIO_PUBLIC_USE_SSL=false`.

**Причина 2:** Несовпадение endpoint'ов (internal vs public).

**Решение 2:**
- MinIO генерирует presigned URL на основе `MINIO_ENDPOINT`
- Клиент обращается по `MINIO_PUBLIC_ENDPOINT`
- Они должны указывать на один и тот же сервер MinIO
- Проверить `nginx-minio.conf` — правильно ли проксируются заголовки
