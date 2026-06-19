package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
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

	MinIOEndpoint  string
	MinIOAccessKey string
	MinIOSecretKey string
	MinIOBucket    string

	JWTSecret string
	JWTTTL    time.Duration

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

	dsn := getEnv("DATABASE_URL", "")
	if dsn == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}

	secret := getEnv("JWT_SECRET", "")
	if secret == "" {
		return nil, fmt.Errorf("JWT_SECRET is required")
	}

	return &Config{
		DBDSN: dsn,

		MinIOEndpoint:  getEnv("MINIO_ENDPOINT", "localhost:9000"),
		MinIOAccessKey: getEnv("MINIO_ROOT_USER", "minioadmin"),
		MinIOSecretKey: getEnv("MINIO_ROOT_PASSWORD", "minioadmin"),
		MinIOBucket:    getEnv("MINIO_BUCKET", "sharedspace"),

		JWTSecret: secret,
		JWTTTL:    time.Duration(ttl) * time.Second,

		Port: getEnv("PORT", "8080"),
	}, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
