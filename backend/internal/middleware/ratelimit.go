package middleware

import (
	"net/http"
	"sync"
	"time"
)

// rateLimitEntry tracks request counts for a single key (typically an IP).
type rateLimitEntry struct {
	count      int
	windowEnds time.Time
}

// RateLimiter is a simple in-memory fixed-window limiter keyed by a string
// (usually client IP). It is suitable for single-instance deployments. For
// multi-instance setups a Redis-backed limiter would be required.
//
// The store is a sync.Map; entries are lazily pruned when accessed after
// their window expires. There is no background goroutine.
type RateLimiter struct {
	mu     sync.Mutex
	store  map[string]*rateLimitEntry
	max    int
	window time.Duration
}

// NewRateLimiter constructs a RateLimiter that allows at most max requests
// per window per key.
func NewRateLimiter(max int, window time.Duration) *RateLimiter {
	return &RateLimiter{
		store:  make(map[string]*rateLimitEntry),
		max:    max,
		window: window,
	}
}

// Allow reports whether the key is within the limit. If allowed, the
// internal counter is incremented.
func (rl *RateLimiter) Allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	entry, exists := rl.store[key]
	if !exists || now.After(entry.windowEnds) {
		rl.store[key] = &rateLimitEntry{count: 1, windowEnds: now.Add(rl.window)}
		return true
	}
	if entry.count >= rl.max {
		return false
	}
	entry.count++
	return true
}

// RateLimit returns a middleware that applies a per-IP rate limit. Requests
// over the limit receive 429 Too Many Requests.
//
// Use it on sensitive public endpoints (forgot-password, resend-verification)
// to prevent abuse.
func RateLimit(limiter *RateLimiter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := clientIPForLimit(r)
			if !limiter.Allow(key) {
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("Retry-After", "60")
				w.WriteHeader(http.StatusTooManyRequests)
				_, _ = w.Write([]byte(`{"error":"слишком много запросов","code":"rate_limited"}`))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func clientIPForLimit(r *http.Request) string {
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		for i := 0; i < len(forwarded); i++ {
			if forwarded[i] == ',' {
				return forwarded[:i]
			}
		}
		return forwarded
	}
	if realIP := r.Header.Get("X-Real-IP"); realIP != "" {
		return realIP
	}
	host, _, err := splitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// splitHostPort is a small helper to avoid importing net just for this.
func splitHostPort(addr string) (host, port string, err error) {
	for i := len(addr) - 1; i >= 0; i-- {
		if addr[i] == ':' {
			return addr[:i], addr[i+1:], nil
		}
		if addr[i] < '0' || addr[i] > '9' {
			break
		}
	}
	return addr, "", nil
}
