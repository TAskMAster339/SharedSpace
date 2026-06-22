package main

import (
	"context"
	"log"
	"os"

	"sharedspace/internal/auth"
	"sharedspace/internal/config"
	"sharedspace/internal/database"
	"sharedspace/internal/server"
	"sharedspace/internal/storage"
	"sharedspace/internal/users"
)

// @title SharedSpace API
// @version 1.0
// @description HTTP API for SharedSpace backend.
// @BasePath /
// @schemes http
// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization
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

	migrationsDir := "migrations"
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

	authRepository := auth.NewRepository()
	authService := auth.NewService(pool, authRepository, cfg.JWTSecret, cfg.JWTTTL, cfg.RefreshJWTTTL)
	authHandler := auth.NewHandler(authService)

	usersRepository := users.NewRepository()
	usersService := users.NewService(pool, usersRepository)
	usersHandler := users.NewHandler(usersService, authService)

	router := server.NewRouter(authHandler, usersHandler)

	if err := server.New(cfg.Port, router).Run(); err != nil {
		log.Fatalf("server: %v", err)
	}
}
