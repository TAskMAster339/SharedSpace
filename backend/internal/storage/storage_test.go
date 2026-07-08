package storage

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"os"
	"testing"
	"time"
)

func getEnvOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func newTestStorage(t *testing.T) *Storage {
	t.Helper()
	ctx := context.Background()
	s, err := New(
		ctx,
		getEnvOr("MINIO_ENDPOINT", "localhost:9000"),
		getEnvOr("MINIO_ACCESS_KEY", "minioadmin"),
		getEnvOr("MINIO_SECRET_KEY", "minioadmin"),
		"test-bucket",
		"localhost:9000",
		false,
		false,
		"",
	)
	if err != nil {
		t.Skipf("MinIO недоступен (%v) — пропускаю интеграционный тест", err)
	}
	return s
}

func TestStorage_UploadDownloadDelete(t *testing.T) {
	s := newTestStorage(t)
	ctx := context.Background()

	key := "tests/hello.txt"
	content := []byte("привет, MinIO")

	if err := s.Upload(ctx, key, bytes.NewReader(content), int64(len(content)), "text/plain"); err != nil {
		t.Fatalf("upload: %v", err)
	}

	rc, err := s.Get(ctx, key)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	got, err := io.ReadAll(rc)
	rc.Close()
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if !bytes.Equal(got, content) {
		t.Fatalf("содержимое не совпало: got %q, want %q", got, content)
	}

	link, err := s.PresignedGetURL(ctx, key, time.Minute)
	if err != nil {
		t.Fatalf("presign: %v", err)
	}
	resp, err := http.Get(link)
	if err != nil {
		t.Fatalf("http get по presigned: %v", err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if !bytes.Equal(body, content) {
		t.Fatalf("по presigned URL пришло не то: got %q", body)
	}

	if err := s.Delete(ctx, key); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := s.Get(ctx, key); err == nil {
		t.Fatalf("объект должен был удалиться, но всё ещё доступен")
	}
}
