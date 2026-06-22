package server

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"sharedspace/internal/auth"
	"sharedspace/internal/middleware"
)

func NewRouter(authHandler *auth.Handler) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.Recover)
	r.Use(middleware.Logger)
	r.Use(middleware.CORS)

	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	r.Route("/api/v1", func(r chi.Router) {
		if authHandler != nil {
			r.Route("/auth", func(r chi.Router) {
				r.Post("/register", middleware.AppError(authHandler.Register))
				r.Post("/login", middleware.AppError(authHandler.Login))
				r.Post("/refresh", middleware.AppError(authHandler.Refresh))
			})
			r.Route("/users", func(r chi.Router) {
				r.Get("/me", middleware.AppError(authHandler.GetMe))
				r.Patch("/me", middleware.AppError(authHandler.UpdateMe))
				r.Patch("/me/password", middleware.AppError(authHandler.ChangePassword))
				r.Get("/search", middleware.AppError(authHandler.SearchUsers))
			})
		}
		// r.Mount("/files", ...)
	})

	return r
}
