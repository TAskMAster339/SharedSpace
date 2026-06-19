package middleware

import (
	"net/http"

	"sharedspace/internal/apperror"
)

type AppHandlerFunc func(http.ResponseWriter, *http.Request) error

func AppError(next AppHandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := next(w, r); err != nil {
			apperror.Write(w, err)
		}
	}
}
