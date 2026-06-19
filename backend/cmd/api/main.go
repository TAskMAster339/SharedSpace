package main

import (
	"context"
	"log"
	"os"
	"path/filepath"

	"sharedspace/internal/config"
	"sharedspace/internal/database"
	"sharedspace/internal/server"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	pool, err := database.NewPool(context.Background(), cfg.DBDSN)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer pool.Close()

	migrationsDir := filepath.Join("internal", "database", "migrations")
	if _, err := os.Stat(migrationsDir); err == nil {
		if err := database.Migrate(context.Background(), pool, migrationsDir); err != nil {
			log.Fatalf("migrations: %v", err)
		}
	}

	router := server.NewRouter()

	if err := server.New(cfg.Port, router).Run(); err != nil {
		log.Fatalf("server: %v", err)
	}
}