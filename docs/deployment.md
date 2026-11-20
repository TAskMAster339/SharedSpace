# Деплой

## Production-окружение

### Требования

- Docker и Docker Compose **или** ручная установка:
  - Go 1.26+
  - Node 22+
  - PostgreSQL 15+
  - MinIO
  - ffmpeg
  - nginx
  - systemd (для демонизации бэкенда)

### Переменные окружения для прода

```bash
# Обязательно сменить!
JWT_SECRET=<генерация: openssl rand -base64 64>

# PostgreSQL
DATABASE_URL=postgres://user:password@host:5432/sharedspace?sslmode=require

# MinIO — production endpoint
MINIO_ENDPOINT=minio.example.com:9000
MINIO_PUBLIC_ENDPOINT=minio-pub.example.com
MINIO_USE_SSL=true
MINIO_PUBLIC_USE_SSL=true

# Фронтенд
REACT_APP_API_BASE_URL=https://api.example.com/api/v1
```

### Docker Compose (production)

```yaml
# docker-compose.prod.yml
services:
  backend:
    environment:
      - JWT_SECRET=${JWT_SECRET}
    restart: always

  frontend:
    build:
      args:
        - REACT_APP_API_BASE_URL=${REACT_APP_API_BASE_URL}
    restart: always

  # ... остальные сервисы
```

## Офисный редактор

Для пилота используйте отдельно развёрнутый ONLYOFFICE Docs. Для локального запуска используйте `make dev-office`. Команда готовит `.env` и включает профиль `office` с закреплённым образом. Образ 10.0.0 используется для воспроизводимости пилота. Перед публичной выкладкой выберите поддерживаемый образ с актуальными исправлениями и проверьте его совместимость с интеграцией. Проверьте условия редакции и ёмкость по общему числу вкладок, размеру документов и доступному месту хранения.

| Переменная | Назначение |
| --- | --- |
| `OFFICE_ENABLED` | Разрешает новые сеансы, по умолчанию `false` |
| `OFFICE_PUBLIC_URL` | Адрес Document Server для браузера, в продакшене HTTPS на отдельном доверенном домене |
| `OFFICE_INTERNAL_URL` | Адрес того же Document Server для API SharedSpace |
| `OFFICE_STORAGE_URL` | Адрес SharedSpace API, по которому редактор скачивает файлы и отправляет уведомления |
| `OFFICE_JWT_SECRET` | Отдельный общий секрет редактора и API, 32 байта или больше |
| `OFFICE_LIGHT_THEME`, `OFFICE_DARK_THEME` | Идентификаторы палитр Document Server. Для отдельной установки значения по умолчанию — `theme-white` и `theme-night` |

Dev Compose монтирует палитры из [onlyoffice/themes](../onlyoffice/themes/) в каталог тем Document Server. В отдельной установке их можно подключить по [инструкции ONLYOFFICE](https://api.onlyoffice.com/docs/docs-api/get-started/how-it-works/customizing-themes) и задать идентификаторы `theme-sharedspace-light` и `theme-sharedspace-dark`. Переключение темы в рабочей области переоткрывает редактор после штатного завершения редактирования в этой вкладке. При наличии правок интерфейс запрашивает подтверждение. Вручную выбранная внутри ONLYOFFICE палитра имеет приоритет над настройкой при открытии.

Бэкенд и браузер должны достигать Document Server, а Document Server — указанного API SharedSpace. Прокси Document Server должен пропускать WebSocket и сохранять внешний хост и схему в перенаправляемых заголовках. Настройте сетевую изоляцию Document Server и ограничьте его исходящий доступ необходимыми сервисами. В dev-профиле разрешены адреса локальной сети для связи с Compose. Сохраняйте тома Document Server при его перезапуске, пока открыты документы или ожидается сохранение. Клиентский SDK редактора загружается с `OFFICE_PUBLIC_URL` и выполняется в контексте SharedSpace, поэтому этот домен должен обслуживаться вашей инфраструктурой.

### Выкладка и откат

1. Сделайте согласованные резервные копии PostgreSQL и MinIO. Выпустите API с миграцией `012_docx_collaboration.up.sql` при выключенном флаге, затем фронтенд. Миграция добавляет таблицы без переписывания существующих объектов. Миграция `013_office_formats.up.sql` добавляет формат сессиям и версиям и сохраняет `docx` для прежних записей. Проверьте `/health` и скачивание ранее загруженного файла и публичной ссылки.
2. Разверните Document Server, проверьте его `/healthcheck` и свяжите сервисы по адресам и секрету из таблицы. Включите флаг для пилота. На синтетических DOCX, XLSX и PPTX проверьте предпросмотр, пять аккаунтов, отклонение шестого, появление версии после закрытия всех редакторов и восстановление. Проверьте, что прежняя публичная ссылка скачивает текущую версию после её восстановления.
3. При сбое выключите `OFFICE_ENABLED`, сохранив все адреса, секрет и доступность Document Server. API продолжит принимать уведомления и повторять ожидающие сохранения. Оставьте тома редактора подключёнными. Ошибки сохранения содержат ключ сессии в журнале API. Для диагностики откройте `document_edit_sessions`. Поле `result_url` содержит адрес результата в редакторе, а `pending_key` указывает на уже скопированный объект MinIO. После перемещения файла или отзыва прав всех авторов несовместимый сохранённый результат может оставаться там до семи дней для восстановления администратором. Скопируйте его в отдельный файл через обычную загрузку после проверки доступа.
4. При откате интерфейса оставьте таблицы и объекты версий. Возврат старого бинарника отложите до завершения сессий и проверки очереди сохранения. Старый API обслужит текущий DOCX через `files.object_key`, но доступ к истории и её очистка потребуют API с поддержкой версий. Миграцию вниз при рабочем откате с данными истории не запускайте.

Размер текущего файла входит в квоту владельца и размер папки. История ограничена десятью версиями на документ. Учитывайте старые объекты и временные результаты в ёмкости MinIO. После постоянного удаления файла его история исчезает сразу, а объекты, которые больше нигде не используются, удаляются фоновым заданием после периода ожидания.

## CI/CD Pipeline

### Backend CI (`.github/workflows/backend.yml`)

**Триггер:** push/PR на `backend/**`

1. Установка Go 1.26 + ffmpeg
2. `make lint` (gofmt + go vet)
3. `go test ./...` (с MinIO service container)
4. Генерация Swagger, проверка `git diff --exit-code`

### Frontend CI (`.github/workflows/frontend.yml`)

**Триггер:** push/PR на `frontend/**`

1. Установка Node 22
2. `npm install`
3. `npm run lint`
4. `npm run format:check`

### Deploy (`.github/workflows/deploy.yml`)

**Триггер:** push на `main`

```mermaid
sequenceDiagram
    GitHub->>Server: SSH + git pull
    Server->>Server: go build (backend)
    Server->>Server: systemctl restart sharedspace-backend
    Server->>Server: npm install && npm run build (frontend)
    Server->>Server: cp build → /var/www/sharedspace/
    Server->>Server: nginx -s reload
```

**Переменные secrets (GitHub → Settings → Secrets):**
- `SERVER_HOST`, `SERVER_USER`, `SERVER_SSH_KEY`, `SERVER_PORT`

## Nginx

### Прокси для фронтенда (`frontend/nginx.conf`)

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # SPA: все пути → index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Кэш статики на 1 год
    location /static/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### Прокси для MinIO (`nginx-minio.conf`)

`MINIO_PUBLIC_ENDPOINT` задаётся в формате `host[:port]`. На публичном
адресе MinIO настройте TLS с действительным сертификатом. При проксировании
сохраните путь и query string, а в `Host` передайте адрес, с которым бэкенд
подписал запрос (`MINIO_ENDPOINT`, в примере ниже — `minio:9000`).

На HTTPS-стенде загрузите изображение, запросите
`GET /api/v1/files/{id}/preview` с Bearer-токеном и откройте полученный URL.
Проверьте, что URL начинается с `https://`, а ответ содержит `200 OK` и
`Content-Type: image/jpeg`.

```nginx
server {
    listen 9002;
    location / {
        proxy_pass http://minio:9000;
        proxy_set_header Host minio:9000;
        # ... заголовки
    }
}
```

## Healthcheck

### PostgreSQL

```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U sharedspace"]
  interval: 5s
  retries: 5
```

### MinIO

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
  interval: 5s
  retries: 5
```

### API

```bash
GET /health → 200 {"status": "ok"}
```

## Мониторинг

- Логи: stdout/stderr (структурированные через middleware Logger)
- Graceful shutdown: SIGINT/SIGTERM → завершение текущих запросов → закрытие пула БД

### Пример systemd unit

```ini
[Unit]
Description=SharedSpace Backend
After=network.target postgresql.service minio.service

[Service]
Type=simple
User=sharedspace
WorkingDirectory=/opt/sharedspace/backend
ExecStart=/opt/sharedspace/backend/api
EnvironmentFile=/opt/sharedspace/.env
Restart=always

[Install]
WantedBy=multi-user.target
```

## Выкладка свойств файлов и папок

Выпусти бэкенд с полем `owner_username` в ответах чтения файла и папки, затем выложи фронтенд. Для размера папки используется миграция 011 из версии с размерами папок. Окно «Свойства» не требует дополнительных миграций или настроек.

После выкладки открой свойства ранее созданного файла и вложенной папки под владельцем и участником с правом просмотра. Сверь имя владельца и размер с ответами API. Если нужно откатить выпуск, сначала верни предыдущую сборку фронтенда, затем при необходимости предыдущую сборку бэкенда с поддержкой миграции 011.

## Связанные страницы

- [Быстрый старт](README.md#быстрый-старт)
- [CI/CD](README.md#ci-cd)
- [Инфраструктура](README.md#инфраструктура-docker-compose)
