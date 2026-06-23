package sharing

import (
	"encoding/json"
	"net/http"

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

// GetSharedWithMe returns all shared directories where the authenticated user is a member.
// @Summary List shared directories for current user
// @Tags sharing
// @Security BearerAuth
// @Produce json
// @Success 200 {array} SharedDirectoryResponse
// @Failure 401 {object} apperror.Response
// @Router /api/v1/shared/with-me [get]
func (h *Handler) GetSharedWithMe(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("unauthorized")
	}

	resp, err := h.service.GetSharedWithMe(r.Context(), claims.UserID)
	if err != nil {
		return err
	}

	if resp == nil {
		resp = []SharedDirectoryResponse{}
	}

	return writeJSON(w, http.StatusOK, resp)
}

// GetMembers returns all members of a shared directory.
// @Summary Get shared directory members
// @Tags sharing
// @Security BearerAuth
// @Produce json
// @Param id path string true "Shared Directory ID"
// @Success 200 {array} MemberResponse
// @Failure 400 {object} apperror.Response
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Router /api/v1/shared-directories/{id}/members [get]
func (h *Handler) GetMembers(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("unauthorized")
	}

	sharedDirID := chi.URLParam(r, "id")
	if sharedDirID == "" {
		return apperror.Validation("shared directory id is required")
	}

	resp, err := h.service.GetMembers(r.Context(), claims.UserID, sharedDirID)
	if err != nil {
		return err
	}

	if resp == nil {
		resp = []MemberResponse{}
	}

	return writeJSON(w, http.StatusOK, resp)
}

func writeJSON(w http.ResponseWriter, status int, payload any) error {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	return json.NewEncoder(w).Encode(payload)
}
