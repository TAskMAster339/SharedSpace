package trash

import (
	"encoding/json"
	"io"
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

// GetTrashList returns the list of items in the user's trash.
// Supports optional cursor-based pagination via ?files_limit=N&files_cursor=<token>&dirs_limit=N&dirs_cursor=<token>.
// @Summary Get trash list
// @Tags trash
// @Security BearerAuth
// @Produce json
// @Param files_limit query int false "Max files per page"
// @Param files_cursor query string false "Files pagination cursor"
// @Param dirs_limit query int false "Max directories per page"
// @Param dirs_cursor query string false "Directories pagination cursor"
// @Success 200 {object} TrashListResponse
// @Failure 401 {object} apperror.Response
// @Router /api/v1/trash [get]
func (h *Handler) GetTrashList(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}

	params, err := parsePaginationParams(r)
	if err != nil {
		return err
	}

	resp, err := h.service.GetTrashList(r.Context(), claims.UserID, params)
	if err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, resp)
}

// ClearTrash clears the trash (selected items only).
// @Summary Clear trash
// @Tags trash
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param request body ClearTrashRequest true "Clear trash request"
// @Success 200 {object} map[string]string
// @Failure 400 {object} apperror.Response
// @Failure 401 {object} apperror.Response
// @Router /api/v1/trash [delete]
func (h *Handler) ClearTrash(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}

	var req ClearTrashRequest
	if err := decodeJSON(r.Body, &req); err != nil {
		return err
	}

	if err := h.service.ClearTrash(r.Context(), claims.UserID, req.ItemIDs); err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, map[string]string{"message": "корзина очищена"})
}

// ClearAllTrash permanently deletes all items in the user's trash.
// @Summary Clear all trash
// @Tags trash
// @Security BearerAuth
// @Success 200 {object} map[string]string
// @Failure 401 {object} apperror.Response
// @Router /api/v1/trash/all [delete]
func (h *Handler) ClearAllTrash(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}

	if err := h.service.ClearTrash(r.Context(), claims.UserID, []string{}); err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, map[string]string{"message": "корзина очищена"})
}

func parsePaginationParams(r *http.Request) (TrashPaginationParams, error) {
	var p TrashPaginationParams
	q := r.URL.Query()

	if v := q.Get("files_limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 {
			return p, apperror.Validation("некорректный files_limit")
		}
		p.FilesLimit = n
	}
	if v := q.Get("dirs_limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 {
			return p, apperror.Validation("некорректный dirs_limit")
		}
		p.DirsLimit = n
	}
	p.FilesCursor = q.Get("files_cursor")
	p.DirsCursor = q.Get("dirs_cursor")
	return p, nil
}

func decodeJSON(body io.ReadCloser, dst any) error {
	defer body.Close()
	dec := json.NewDecoder(body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return apperror.Validation("некорректный JSON")
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, payload any) error {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		return apperror.WrapInternal("ошибка кодирования ответа", err)
	}
	return nil
}
