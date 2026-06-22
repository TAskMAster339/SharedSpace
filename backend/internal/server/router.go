package server

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"sharedspace/internal/auth"
	"sharedspace/internal/middleware"
	"sharedspace/internal/swagger"
)

// HealthResponse is returned by the health check endpoint.
type HealthResponse struct {
	Status string `json:"status"`
}

// healthHandler reports service liveness.
// @Summary Check service health
// @Tags health
// @Produce json
// @Success 200 {object} HealthResponse
// @Router /health [get]
func healthHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(HealthResponse{Status: "ok"})
}

func NewRouter(authHandler *auth.Handler) http.Handler {
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
			})
		}
		// r.Mount("/files", ...)
	})

	return r
}
