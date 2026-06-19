package main

import (
	"context"
	"log"
	"os"
	"path/filepath"

	"sharedspace/internal/config"
	"sharedspace/internal/database"
	"sharedspace/internal/server"
	"sharedspace/internal/storage"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	ctx := context.Background()

	pool, err := database.NewPool(ctx, cfg.DBDSN)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer pool.Close()

	migrationsDir := filepath.Join("internal", "database", "migrations")
	if _, err := os.Stat(migrationsDir); err == nil {
		if err := database.Migrate(ctx, pool, migrationsDir); err != nil {
			log.Fatalf("migrations: %v", err)
		}
	}

	store, err := storage.New(ctx, cfg.MinIOEndpoint, cfg.MinIOAccessKey,
		cfg.MinIOSecretKey, cfg.MinIOBucket, false)
	if err != nil {
		log.Fatalf("storage: %v", err)
	}
	_ = store

	router := server.NewRouter()

	if err := server.New(cfg.Port, router).Run(); err != nil {
		log.Fatalf("server: %v", err)
	}
}
