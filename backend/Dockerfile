FROM golang:1.26-alpine AS builder
WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download
COPY . .

FROM builder AS api-builder
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/api ./cmd/api

FROM builder AS media-worker-builder
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/media-worker ./cmd/media-worker

FROM alpine:latest AS media-worker
RUN apk --no-cache add ca-certificates ffmpeg
WORKDIR /app
COPY --from=media-worker-builder /app/media-worker /app/media-worker
ENV MEDIA_WORK_DIR=/app/media-work
CMD ["/app/media-worker"]

FROM alpine:latest AS api
RUN apk --no-cache add ca-certificates ffmpeg
WORKDIR /app
COPY --from=api-builder /app/api /app/api
COPY --from=api-builder /app/internal/database/migrations /app/migrations
EXPOSE 8080
CMD ["/app/api"]
