package config

import (
	"fmt"
	"net"
	"net/url"
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

	LogEmails    bool
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

	OfficeEnabled     bool
	OfficePublicURL   string
	OfficeInternalURL string
	OfficeStorageURL  string
	OfficeJWTSecret   string
	OfficeLightTheme  string
	OfficeDarkTheme   string
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

	publicEndpoint := getEnv("MINIO_PUBLIC_ENDPOINT", "localhost:9002")
	if err := validateMinIOPublicEndpoint(publicEndpoint); err != nil {
		return nil, err
	}

	return &Config{
		DBDSN: dsn,

		MinIOEndpoint:       getEnv("MINIO_ENDPOINT", "minio:9000"),
		MinIOAccessKey:      getEnv("MINIO_ROOT_USER", "minioadmin"),
		MinIOSecretKey:      getEnv("MINIO_ROOT_PASSWORD", "minioadmin"),
		MinIOBucket:         getEnv("MINIO_BUCKET", "sharedspace"),
		MinIOPublicEndpoint: publicEndpoint,
		MinIOUseSSL:         getEnv("MINIO_USE_SSL", "false") == "true",
		MinIOPublicUseSSL:   getEnv("MINIO_PUBLIC_USE_SSL", "true") == "true",
		MinIOTmpBucket:      getEnv("MINIO_TMP_BUCKET", "tmp"),
		MinioRegion:         getEnv("MINIO_REGION", ""),

		JWTSecret:     secret,
		JWTTTL:        time.Duration(ttl) * time.Second,
		RefreshJWTTTL: time.Duration(refreshTTL) * time.Second,

		LogEmails:    getEnv("DEV_LOG_EMAILS", "false") == "true",
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

		OfficeEnabled:     getEnv("OFFICE_ENABLED", "false") == "true",
		OfficePublicURL:   getEnv("OFFICE_PUBLIC_URL", ""),
		OfficeInternalURL: getEnv("OFFICE_INTERNAL_URL", ""),
		OfficeStorageURL:  getEnv("OFFICE_STORAGE_URL", ""),
		OfficeJWTSecret:   getEnv("OFFICE_JWT_SECRET", ""),
		OfficeLightTheme:  getEnv("OFFICE_LIGHT_THEME", ""),
		OfficeDarkTheme:   getEnv("OFFICE_DARK_THEME", ""),
	}, nil
}

func validateMinIOPublicEndpoint(endpoint string) error {
	parsed, err := url.Parse("http://" + endpoint)
	invalid := fmt.Errorf("MINIO_PUBLIC_ENDPOINT must be host[:port], with TLS configured by MINIO_PUBLIC_USE_SSL")
	if err != nil || parsed.Host != endpoint || parsed.Hostname() == "" {
		return invalid
	}
	host := parsed.Hostname()
	if strings.HasPrefix(endpoint, "[") || strings.Contains(host, ":") {
		if net.ParseIP(host) == nil || !strings.HasPrefix(endpoint, "[") {
			return invalid
		}
	}
	if strings.HasSuffix(endpoint, ":") {
		return invalid
	}
	if port := parsed.Port(); port != "" {
		number, err := strconv.ParseUint(port, 10, 16)
		if err != nil || number == 0 {
			return invalid
		}
	}
	return nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
