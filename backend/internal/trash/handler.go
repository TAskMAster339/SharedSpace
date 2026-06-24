package trash

import (
	"encoding/json"
	"io"
	"net/http"

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
// @Summary Get trash list
// @Tags trash
// @Security BearerAuth
// @Produce json
// @Success 200 {object} TrashListResponse
// @Failure 401 {object} apperror.Response
// @Router /api/v1/trash [get]
func (h *Handler) GetTrashList(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}

	resp, err := h.service.GetTrashList(r.Context(), claims.UserID)
	if err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, resp)
}

// ClearTrash clears the trash (all items or selected ones).
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
