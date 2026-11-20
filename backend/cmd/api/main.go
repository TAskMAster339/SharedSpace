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
	"sharedspace/internal/mailer"
	"sharedspace/internal/mylinks"
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

	previewDir := os.Getenv("PREVIEW_TMP_DIR")
	if previewDir == "" {
		previewDir, err = os.MkdirTemp("", "sharedspace-previews-")
		if err != nil {
			log.Fatalf("preview directory: %v", err)
		}
		defer os.RemoveAll(previewDir)
	}
	if err := files.PreparePreviewTempDir(previewDir); err != nil {
		log.Fatalf("preview directory: %v", err)
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
	mailSvc := mailer.NewSMTPMailer(
		cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUser, cfg.SMTPPassword,
		cfg.SMTPFrom, cfg.SMTPFromName, cfg.SMTPUseTLS, mailer.LogoBytes(),
	)
	if cfg.LogEmails {
		mailSvc = mailer.ConsoleMailer{}
	}
	authService := auth.NewService(
		pool, authRepository, cfg.JWTSecret, cfg.JWTTTL, cfg.RefreshJWTTTL,
		mailSvc, cfg.AppURL, cfg.VerifyEmailTTL, cfg.ResetPasswordTTL,
	)
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
	filesService := files.NewService(pool, filesRepository, store, tmpStore, accessChecker, shareLinksRepository, previewDir)
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

	// my links
	mylinksRepository := mylinks.NewRepository()
	mylinksService := mylinks.NewService(pool, mylinksRepository)
	mylinksHandler := mylinks.NewHandler(mylinksService)

	documentService, err := files.NewDocumentService(pool, filesRepository, store, files.DocumentEditorOptions{
		Enabled: cfg.OfficeEnabled, PublicURL: cfg.OfficePublicURL, InternalURL: cfg.OfficeInternalURL,
		StorageURL: cfg.OfficeStorageURL, Secret: cfg.OfficeJWTSecret,
	})
	if err != nil {
		log.Fatalf("document editor: %v", err)
	}
	documentService.StartWorker(ctx)
	documentHandler := files.NewDocumentHandler(documentService)

	router := server.NewRouter(authHandler, authService, usersHandler, dirsHandler, filesHandler, sharingHandler, favoritesHandler, trashHandler, shareLinksHandler, mylinksHandler, documentHandler)

	if err := server.New(cfg.Port, router).Run(); err != nil {
		log.Fatalf("server: %v", err)
	}
}
