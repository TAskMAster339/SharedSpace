package server

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"sharedspace/internal/auth"
	"sharedspace/internal/dirs"
	"sharedspace/internal/favorites"
	"sharedspace/internal/files"
	"sharedspace/internal/middleware"
	"sharedspace/internal/sharing"
	"sharedspace/internal/swagger"
	"sharedspace/internal/trash"
	"sharedspace/internal/users"
)

type HealthResponse struct {
	Status string `json:"status"`
}

func healthHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(HealthResponse{Status: "ok"})
}

func NewRouter(authHandler *auth.Handler, authService auth.AuthService, usersHandler *users.Handler, dirsHandler *dirs.Handler, filesHandler *files.Handler, sharingHandler *sharing.Handler, favoritesHandler *favorites.Handler, trashHandler *trash.Handler) http.Handler {
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

		r.Group(func(r chi.Router) {
			r.Use(middleware.JWTAuth(authService))

			if usersHandler != nil {
				r.Route("/users", func(r chi.Router) {
					r.Get("/me", middleware.AppError(usersHandler.GetMe))
					r.Patch("/me", middleware.AppError(usersHandler.UpdateMe))
					r.Patch("/me/password", middleware.AppError(usersHandler.ChangePassword))
					r.Delete("/me", middleware.AppError(usersHandler.DeleteAccount))
					r.Get("/search", middleware.AppError(usersHandler.SearchUsers))
				})
			}

			if filesHandler != nil {
				r.Route("/files", func(r chi.Router) {
					r.Post("/", middleware.AppError(filesHandler.Upload))
					r.Get("/recent", middleware.AppError(filesHandler.GetRecent))
					r.Get("/favorites", middleware.AppError(favoritesHandler.List))
					r.Post("/{id}/favorite", middleware.AppError(favoritesHandler.Add))
					r.Delete("/{id}/favorite", middleware.AppError(favoritesHandler.Remove))
					r.Get("/{id}", middleware.AppError(filesHandler.GetMetadata))
					r.Get("/{id}/content", middleware.AppError(filesHandler.GetContent))
					r.Patch("/{id}", middleware.AppError(filesHandler.Update))
					r.Delete("/{id}", middleware.AppError(filesHandler.SoftDelete))
					r.Post("/{id}/restore", middleware.AppError(filesHandler.Restore))
					r.Delete("/{id}/permanent", middleware.AppError(filesHandler.PermanentDelete))
				})
			}

			if dirsHandler != nil {
				r.Route("/directories", func(r chi.Router) {
					r.Get("/root/contents", middleware.AppError(dirsHandler.GetRootContents))
					r.Get("/{id}/contents", middleware.AppError(dirsHandler.GetContents))
					r.Get("/{id}", middleware.AppError(dirsHandler.GetByID))
					r.Post("/", middleware.AppError(dirsHandler.Create))
					r.Patch("/{id}", middleware.AppError(dirsHandler.Update))
					r.Delete("/{id}", middleware.AppError(dirsHandler.SoftDelete))
					r.Post("/{id}/restore", middleware.AppError(dirsHandler.Restore))
					r.Delete("/{id}/permanent", middleware.AppError(dirsHandler.PermanentDelete))
				})
			}

			if sharingHandler != nil {
				r.Get("/shared/with-me", middleware.AppError(sharingHandler.GetSharedWithMe))
				r.Get("/shared/with-me/stats", middleware.AppError(sharingHandler.GetSharedWithMeStats))
				r.Get("/shared-directories/{id}/members", middleware.AppError(sharingHandler.GetMembers))
				r.Patch("/shared-directories/{id}/members/{userId}", middleware.AppError(sharingHandler.ChangeMemberRole))
				r.Delete("/shared-directories/{id}/members/{userId}", middleware.AppError(sharingHandler.RemoveMember))
				r.Post("/shared-directories/{id}/invitations", middleware.AppError(sharingHandler.Invite))
				r.Get("/invitations", middleware.AppError(sharingHandler.GetMyInvitations))
				r.Post("/invitations/{id}/accept", middleware.AppError(sharingHandler.AcceptInvitation))
				r.Post("/invitations/{id}/decline", middleware.AppError(sharingHandler.DeclineInvitation))
				r.Delete("/invitations/{id}", middleware.AppError(sharingHandler.RemoveInvitation))
				r.Get("/shared/directories", middleware.AppError(sharingHandler.GetUserSharedDirectories))
			}

			if trashHandler != nil {
				r.Route("/trash", func(r chi.Router) {
					r.Get("/", middleware.AppError(trashHandler.GetTrashList))
					r.Delete("/", middleware.AppError(trashHandler.ClearTrash))
				})
			}
		})
	})

	return r
}
