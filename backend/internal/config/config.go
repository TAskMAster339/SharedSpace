package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

func findEnvFile() string {
	dir, _ := os.Getwd()
	for {
		path := filepath.Join(dir, ".env")
		if _, err := os.Stat(path); err == nil {
			return path
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return ""
		}
		dir = parent
	}
}

type Config struct {
	DBDSN string

	MinIOEndpoint       string
	MinIOAccessKey      string
	MinIOSecretKey      string
	MinIOBucket         string
	MinIOUseSSL         bool
	MinIOPublicUseSSL   bool
	MinIOPublicEndpoint string
	MinIOTmpBucket      string
	MinioRegion         string

	JWTSecret     string
	JWTTTL        time.Duration
	RefreshJWTTTL time.Duration

	SMTPHost     string
	SMTPPort     int
	SMTPUser     string
	SMTPPassword string
	SMTPFrom     string
	SMTPFromName string
	SMTPUseTLS   bool

	AppURL           string
	VerifyEmailTTL   time.Duration
	ResetPasswordTTL time.Duration

	Port string
}

func Load() (*Config, error) {
	if envFile := findEnvFile(); envFile != "" {
		godotenv.Load(envFile)
	}

	ttl, err := strconv.Atoi(getEnv("JWT_TTL", "3600"))
	if err != nil {
		return nil, fmt.Errorf("invalid JWT_TTL: %w", err)
	}
	refreshTTL, err := strconv.Atoi(getEnv("REFRESH_JWT_TTL", "2592000"))
	if err != nil {
		return nil, fmt.Errorf("invalid REFRESH_JWT_TTL: %w", err)
	}

	dsn := getEnv("DATABASE_URL", "")
	if dsn == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}

	secret := getEnv("JWT_SECRET", "")
	if secret == "" {
		return nil, fmt.Errorf("JWT_SECRET is required")
	}

	smtpPort, err := strconv.Atoi(getEnv("SMTP_PORT", "587"))
	if err != nil {
		return nil, fmt.Errorf("invalid SMTP_PORT: %w", err)
	}

	verifyHours, err := strconv.Atoi(getEnv("VERIFY_EMAIL_TTL_HOURS", "24"))
	if err != nil || verifyHours <= 0 {
		return nil, fmt.Errorf("invalid VERIFY_EMAIL_TTL_HOURS: %w", err)
	}

	resetHours, err := strconv.Atoi(getEnv("RESET_PASSWORD_TTL_HOURS", "1"))
	if err != nil || resetHours <= 0 {
		return nil, fmt.Errorf("invalid RESET_PASSWORD_TTL_HOURS: %w", err)
	}

	appURL := strings.TrimRight(getEnv("APP_URL", ""), "/")
	if appURL == "" {
		return nil, fmt.Errorf("APP_URL is required")
	}

	return &Config{
		DBDSN: dsn,

		MinIOEndpoint:       getEnv("MINIO_ENDPOINT", "minio:9000"),
		MinIOAccessKey:      getEnv("MINIO_ROOT_USER", "minioadmin"),
		MinIOSecretKey:      getEnv("MINIO_ROOT_PASSWORD", "minioadmin"),
		MinIOBucket:         getEnv("MINIO_BUCKET", "sharedspace"),
		MinIOPublicEndpoint: getEnv("MINIO_PUBLIC_ENDPOINT", "localhost:9002"),
		MinIOUseSSL:         getEnv("MINIO_USE_SSL", "false") == "true",
		MinIOPublicUseSSL:   getEnv("MINIO_PUBLIC_USE_SSL", "true") == "true",
		MinIOTmpBucket:      getEnv("MINIO_TMP_BUCKET", "tmp"),
		MinioRegion:         getEnv("MINIO_REGION", ""),

		JWTSecret:     secret,
		JWTTTL:        time.Duration(ttl) * time.Second,
		RefreshJWTTTL: time.Duration(refreshTTL) * time.Second,

		SMTPHost:     getEnv("SMTP_HOST", ""),
		SMTPPort:     smtpPort,
		SMTPUser:     getEnv("SMTP_USER", ""),
		SMTPPassword: getEnv("SMTP_PASSWORD", ""),
		SMTPFrom:     getEnv("SMTP_FROM", ""),
		SMTPFromName: getEnv("SMTP_FROM_NAME", "SharedSpace"),
		SMTPUseTLS:   getEnv("SMTP_USE_TLS", "true") == "true",

		AppURL:           appURL,
		VerifyEmailTTL:   time.Duration(verifyHours) * time.Hour,
		ResetPasswordTTL: time.Duration(resetHours) * time.Hour,

		Port: getEnv("PORT", "8080"),
	}, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
