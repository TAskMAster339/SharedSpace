package middleware

import (
	"net/http"
	"strings"

	"sharedspace/internal/apperror"
	"sharedspace/internal/auth"
)

type TokenParser interface {
	ParseAccessToken(raw string) (*auth.Claims, error)
}

func JWTAuth(parser TokenParser) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw, ok := bearerToken(r)
			if !ok {
				apperror.Write(w, apperror.Unauthorized("authorization header required"))
				return
			}

			claims, err := parser.ParseAccessToken(raw)
			if err != nil {
				apperror.Write(w, apperror.Unauthorized("invalid or expired token"))
				return
			}

			r = r.WithContext(auth.SetClaims(r.Context(), claims))
			next.ServeHTTP(w, r)
		})
	}
}

func bearerToken(r *http.Request) (string, bool) {
	header := strings.TrimSpace(r.Header.Get("Authorization"))
	if !strings.HasPrefix(header, "Bearer ") {
		return "", false
	}
	token := strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
	if token == "" {
		return "", false
	}
	return token, true
}
