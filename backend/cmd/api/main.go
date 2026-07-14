package main

import (
	"context"
	"log"
	"os"

	"sharedspace/internal/access"
	"sharedspace/internal/auth"
	"sharedspace/internal/config"
	"sharedspace/internal/database"
	"sharedspace/internal/dirs"
	"sharedspace/internal/favorites"
	"sharedspace/internal/files"
	"sharedspace/internal/server"
	"sharedspace/internal/sharelinks"
	"sharedspace/internal/sharing"
	"sharedspace/internal/storage"
	"sharedspace/internal/trash"
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
		cfg.MinIOSecretKey, cfg.MinIOBucket, cfg.MinIOPublicEndpoint, cfg.MinIOUseSSL, cfg.MinIOPublicUseSSL, cfg.MinioRegion)
	if err != nil {
		log.Fatalf("storage: %v", err)
	}

	tmpStore, err := storage.New(ctx, cfg.MinIOEndpoint, cfg.MinIOAccessKey,
		cfg.MinIOSecretKey, cfg.MinIOTmpBucket, cfg.MinIOPublicEndpoint, cfg.MinIOUseSSL, cfg.MinIOPublicUseSSL, cfg.MinioRegion)
	if err != nil {
		log.Fatalf("tmp storage: %v", err)
	}

	// auth
	authRepository := auth.NewRepository()
	authService := auth.NewService(pool, authRepository, cfg.JWTSecret, cfg.JWTTTL, cfg.RefreshJWTTTL)
	authHandler := auth.NewHandler(authService)
	// users
	usersRepository := users.NewRepository()
	usersService := users.NewService(pool, usersRepository)
	usersHandler := users.NewHandler(usersService, authService)
	// access checker
	accessRepository := access.NewRepository()
	accessChecker := access.NewChecker(pool, accessRepository)

	// share links repository (needed by multiple services)
	shareLinksRepository := sharelinks.NewRepository()

	// dirs
	dirsRepository := dirs.NewRepository()
	sharingRepository := sharing.NewRepository()
	dirsService := dirs.NewService(pool, dirsRepository, sharingRepository, accessChecker, store, shareLinksRepository)
	dirsHandler := dirs.NewHandler(dirsService)
	// file
	filesRepository := files.NewRepository()
	filesService := files.NewService(pool, filesRepository, store, tmpStore, accessChecker, shareLinksRepository)
	filesService.StartCleanupWorker(ctx)
	filesHandler := files.NewHandler(filesService)
	// sharing
	sharingService := sharing.NewService(pool, sharingRepository, accessChecker)
	sharingHandler := sharing.NewHandler(sharingService)
	// favorites
	favoritesRepository := favorites.NewRepository()
	favoritesService := favorites.NewService(pool, favoritesRepository, accessChecker)
	favoritesHandler := favorites.NewHandler(favoritesService)
	// trash
	trashRepository := trash.NewRepository()
	trashService := trash.NewService(pool, trashRepository, store, shareLinksRepository)
	trashHandler := trash.NewHandler(trashService)
	// share links
	shareLinksService := sharelinks.NewService(pool, shareLinksRepository, store, accessChecker)
	shareLinksHandler := sharelinks.NewHandler(shareLinksService, authService)

	router := server.NewRouter(authHandler, authService, usersHandler, dirsHandler, filesHandler, sharingHandler, favoritesHandler, trashHandler, shareLinksHandler)

	if err := server.New(cfg.Port, router).Run(); err != nil {
		log.Fatalf("server: %v", err)
	}
}
