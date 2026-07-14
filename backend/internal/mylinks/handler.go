package mylinks

import (
	"encoding/json"
	"net/http"
	"strconv"

	"sharedspace/internal/apperror"
	"sharedspace/internal/auth"
)

type Handler struct {
	service ServiceInterface
}

func NewHandler(service ServiceInterface) *Handler {
	return &Handler{service: service}
}

// List returns items (files and directories) that the user has share links for.
// @Summary List linked items
// @Tags links
// @Security BearerAuth
// @Produce json
// @Param limit query int false "Page size"
// @Param cursor query string false "Pagination cursor from previous response"
// @Success 200 {object} LinksListResponse
// @Failure 401 {object} apperror.Response
// @Router /api/v1/links [get]
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

	cursor := r.URL.Query().Get("cursor")

	resp, err := h.service.List(r.Context(), claims.UserID, limit, cursor)
	if err != nil {
		return err
	}

	if resp.Items == nil {
		resp.Items = []LinkItemResponse{}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	return json.NewEncoder(w).Encode(resp)
}
