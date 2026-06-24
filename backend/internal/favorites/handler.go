package favorites

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"sharedspace/internal/apperror"
	"sharedspace/internal/auth"
)

type Handler struct {
	service ServiceInterface
}

func NewHandler(service ServiceInterface) *Handler {
	return &Handler{service: service}
}

// Add adds a file to the authenticated user's favorites.
// @Summary Add file to favorites
// @Tags files
// @Security BearerAuth
// @Produce json
// @Param id path string true "File ID"
// @Success 201 {object} map[string]string
// @Failure 400 {object} apperror.Response
// @Failure 401 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Router /api/v1/files/{id}/favorite [post]
func (h *Handler) Add(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}

	fileID := chi.URLParam(r, "id")
	if fileID == "" {
		return apperror.Validation("id файла обязателен")
	}

	if err := h.service.Add(r.Context(), claims.UserID, fileID); err != nil {
		return err
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	return json.NewEncoder(w).Encode(map[string]string{"message": "файл добавлен в избранное"})
}

// Remove removes a file from the authenticated user's favorites.
// @Summary Remove file from favorites
// @Tags files
// @Security BearerAuth
// @Produce json
// @Param id path string true "File ID"
// @Success 200 {object} map[string]string
// @Failure 400 {object} apperror.Response
// @Failure 401 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Router /api/v1/files/{id}/favorite [delete]
func (h *Handler) Remove(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}

	fileID := chi.URLParam(r, "id")
	if fileID == "" {
		return apperror.Validation("id файла обязателен")
	}

	if err := h.service.Remove(r.Context(), claims.UserID, fileID); err != nil {
		return err
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	return json.NewEncoder(w).Encode(map[string]string{"message": "файл удалён из избранного"})
}

// List returns all favorited files for the authenticated user.
// @Summary List favorited files
// @Tags files
// @Security BearerAuth
// @Produce json
// @Param limit query int false "Maximum number of favorites to return"
// @Success 200 {object} FavoritesListResponse
// @Failure 401 {object} apperror.Response
// @Router /api/v1/files/favorites [get]
func (h *Handler) List(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}

	limit := 0
	if l := r.URL.Query().Get("limit"); l != "" {
		parsed, err := strconv.Atoi(l)
		if err != nil || parsed < 0 {
			return apperror.Validation("некорректный лимит")
		}
		limit = parsed
	}

	resp, err := h.service.List(r.Context(), claims.UserID, limit)
	if err != nil {
		return err
	}

	if resp.Favorites == nil {
		resp.Favorites = []FavoriteFileResponse{}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	return json.NewEncoder(w).Encode(resp)
}
