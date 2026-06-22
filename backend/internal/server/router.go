package server

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"sharedspace/internal/auth"
	"sharedspace/internal/middleware"
	"sharedspace/internal/swagger"
	"sharedspace/internal/users"
)

type HealthResponse struct {
	Status string `json:"status"`
}

func healthHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(HealthResponse{Status: "ok"})
}

func NewRouter(authHandler *auth.Handler, usersHandler *users.Handler) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.Recover)
	r.Use(middleware.Logger)
	r.Use(middleware.CORS)

	r.Get("/health", healthHandler)
	swagger.Mount(r)

	r.Route("/api/v1", func(r chi.Router) {
		if authHandler != nil {
			r.Route("/auth", func(r chi.Router) {
				r.Post("/register", middleware.AppError(authHandler.Register))
				r.Post("/login", middleware.AppError(authHandler.Login))
				r.Post("/refresh", middleware.AppError(authHandler.Refresh))
				r.Post("/logout", middleware.AppError(authHandler.Logout))
			})
		}

		if usersHandler != nil {
			r.Route("/users", func(r chi.Router) {
				r.Get("/me", middleware.AppError(usersHandler.GetMe))
				r.Patch("/me", middleware.AppError(usersHandler.UpdateMe))
				r.Patch("/me/password", middleware.AppError(usersHandler.ChangePassword))
				r.Get("/search", middleware.AppError(usersHandler.SearchUsers))
			})
		}
		// r.Mount("/files", ...)
	})

	return r
}
