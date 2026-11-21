package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"sharedspace/internal/access"
	"sharedspace/internal/config"
	"sharedspace/internal/database"
	"sharedspace/internal/files"
	"sharedspace/internal/jobqueue"
	"sharedspace/internal/storage"
)

func main() {
	cfg, err := config.LoadWorker()
	if err != nil {
		log.Fatalf("config: %v", err)
	}
	stop, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	workDir := os.Getenv("MEDIA_WORK_DIR")
	if workDir == "" {
		workDir = filepath.Join(os.TempDir(), "sharedspace-media")
	}
	if err := files.PreparePreviewTempDir(workDir); err != nil {
		log.Fatalf("media workspace: %v", err)
	}
	healthPath := filepath.Join(workDir, ".healthy")
	if err := os.Remove(healthPath); err != nil && !os.IsNotExist(err) {
		log.Fatalf("worker health: %v", err)
	}
	defer os.Remove(healthPath)

	pool, err := database.NewBoundedPool(stop, cfg.DBDSN, 1, 3)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer pool.Close()

	start, done := context.WithTimeout(stop, 30*time.Second)
	defer done()
	store, err := storage.New(start, cfg.MinIOEndpoint, cfg.MinIOAccessKey,
		cfg.MinIOSecretKey, cfg.MinIOBucket, cfg.MinIOPublicEndpoint, cfg.MinIOUseSSL, cfg.MinIOPublicUseSSL, cfg.MinioRegion)
	if err != nil {
		log.Fatalf("storage: %v", err)
	}
	tmpStore, err := storage.New(start, cfg.MinIOEndpoint, cfg.MinIOAccessKey,
		cfg.MinIOSecretKey, cfg.MinIOTmpBucket, cfg.MinIOPublicEndpoint, cfg.MinIOUseSSL, cfg.MinIOPublicUseSSL, cfg.MinioRegion)
	if err != nil {
		log.Fatalf("temporary storage: %v", err)
	}
	done()

	checker := access.NewChecker(pool, access.NewRepository())
	service := files.NewService(pool, files.NewRepository(), store, tmpStore, checker, nil)
	queue, err := jobqueue.New(pool)
	if err != nil {
		log.Fatalf("job queue: %v", err)
	}
	queue.Run(stop, service.MediaHandlers(pool, workDir), func() {
		if err := os.WriteFile(healthPath, nil, 0600); err != nil {
			log.Printf("worker health: %v", err)
		}
	})
}
