package middleware

import (
	"log"
	"net/http"

	"sharedspace/internal/apperror"
)

func Recover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("panic: %v", rec)
				apperror.Write(w, apperror.Internal(http.StatusText(http.StatusInternalServerError)))
			}
		}()
		next.ServeHTTP(w, r)
	})
}
