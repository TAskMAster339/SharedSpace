# SharedSpace


## Quick Start

1. Clone the repository.
```bash
git clone https://github.com/TAskMAster339/SharedSpace.git
```

2. Create a root `.env` alike `.env.example`:

```bash
cp .env.example .env
```

3. Start the stack:

```bash
docker compose up --build -d
```

After startup:
- Frontend: http://localhost
- Backend API: http://localhost:8080
- Swagger UI: http://localhost:8080/swagger/

## Development

### Backend

Run the backend locally from the `backend/` directory:

```bash
go run ./cmd/api
```

Lint and static checks:

```bash
cd backend
make lint
make fmt
```

Tests:

```bash
go test ./...
```

Generate Swagger documentation from annotations:

```bash
go install github.com/swaggo/swag/cmd/swag@v1.16.6
cd backend
make swagger
```

### Frontend

Run the frontend locally from the `frontend/` directory:

```bash
npm install
npm start
```

Lint and formatting checks:

```bash
npm run lint
npm run format:check
```

Tests:

```bash
npm test
```
