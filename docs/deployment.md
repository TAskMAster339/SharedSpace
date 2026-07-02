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
MINIO_PUBLIC_ENDPOINT=https://minio-pub.example.com
MINIO_USE_SSL=true
MINIO_PUBLIC_USE_SSL=true   # false для локальной разработки, иначе presigned-ссылки
                            # будут с HTTPS, и браузер заблокирует загрузку по HTTP

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

## Связанные страницы

- [Быстрый старт](README.md#быстрый-старт)
- [CI/CD](README.md#ci-cd)
- [Инфраструктура](README.md#инфраструктура-docker-compose)
