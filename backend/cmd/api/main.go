package main

import (
	"context"
	"log"
	"os"

	"sharedspace/internal/auth"
	"sharedspace/internal/config"
	"sharedspace/internal/database"
	"sharedspace/internal/dirs"
	"sharedspace/internal/favorites"
	"sharedspace/internal/files"
	"sharedspace/internal/server"
	"sharedspace/internal/sharing"
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

	// auth
	authRepository := auth.NewRepository()
	authService := auth.NewService(pool, authRepository, cfg.JWTSecret, cfg.JWTTTL, cfg.RefreshJWTTTL)
	authHandler := auth.NewHandler(authService)
	// users
	usersRepository := users.NewRepository()
	usersService := users.NewService(pool, usersRepository)
	usersHandler := users.NewHandler(usersService, authService)
	// dirs
	dirsRepository := dirs.NewRepository()
	sharingRepository := sharing.NewRepository()
	dirsService := dirs.NewService(pool, dirsRepository, sharingRepository)
	dirsHandler := dirs.NewHandler(dirsService)
	// file
	filesRepository := files.NewRepository()
	filesService := files.NewService(pool, filesRepository, store)
	filesHandler := files.NewHandler(filesService)
	// sharing
	sharingService := sharing.NewService(pool, sharingRepository)
	sharingHandler := sharing.NewHandler(sharingService)
	// favorites
	favoritesRepository := favorites.NewRepository()
	favoritesService := favorites.NewService(pool, favoritesRepository)
	favoritesHandler := favorites.NewHandler(favoritesService)

	router := server.NewRouter(authHandler, authService, usersHandler, dirsHandler, filesHandler, sharingHandler, favoritesHandler)

	if err := server.New(cfg.Port, router).Run(); err != nil {
		log.Fatalf("server: %v", err)
	}
}
