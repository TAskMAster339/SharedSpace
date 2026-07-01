package dirs

import (
	"encoding/json"
	"io"
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

// GetRootContents returns the contents of the authenticated user's root directory.
// Supports optional cursor-based pagination via ?files_limit=N&files_cursor=<token>&dirs_limit=N&dirs_cursor=<token>.
// @Summary Get root directory contents
// @Tags directories
// @Security BearerAuth
// @Produce json
// @Param files_limit query int false "Max files per page"
// @Param files_cursor query string false "Files pagination cursor"
// @Param dirs_limit query int false "Max subdirectories per page"
// @Param dirs_cursor query string false "Dirs pagination cursor"
// @Success 200 {object} DirectoryContentsResponse
// @Failure 401 {object} apperror.Response
// @Router /api/v1/directories/root/contents [get]
func (h *Handler) GetRootContents(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}

	p, err := parsePaginationParams(r)
	if err != nil {
		return err
	}

	resp, err := h.service.GetRootContents(r.Context(), claims.UserID, p)
	if err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, resp)
}

// GetContents returns the contents (subdirectories and files) of a specific directory.
// Supports optional cursor-based pagination via ?files_limit=N&files_cursor=<token>&dirs_limit=N&dirs_cursor=<token>.
// @Summary Get directory contents
// @Tags directories
// @Security BearerAuth
// @Produce json
// @Param id path string true "Directory ID"
// @Param files_limit query int false "Max files per page"
// @Param files_cursor query string false "Files pagination cursor"
// @Param dirs_limit query int false "Max subdirectories per page"
// @Param dirs_cursor query string false "Dirs pagination cursor"
// @Success 200 {object} DirectoryContentsResponse
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Router /api/v1/directories/{id}/contents [get]
func (h *Handler) GetContents(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}

	dirID := chi.URLParam(r, "id")
	if dirID == "" {
		return apperror.Validation("id директории обязателен")
	}

	p, err := parsePaginationParams(r)
	if err != nil {
		return err
	}

	resp, err := h.service.GetContents(r.Context(), claims.UserID, dirID, p)
	if err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, resp)
}

// GetByID returns information about a specific directory.
// @Summary Get directory by ID
// @Tags directories
// @Security BearerAuth
// @Produce json
// @Param id path string true "Directory ID"
// @Success 200 {object} DirectoryResponse
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Router /api/v1/directories/{id} [get]
func (h *Handler) GetByID(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}

	dirID := chi.URLParam(r, "id")
	if dirID == "" {
		return apperror.Validation("id директории обязателен")
	}

	resp, err := h.service.GetByID(r.Context(), claims.UserID, dirID)
	if err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, resp)
}

// Create creates a new directory.
// @Summary Create a directory
// @Tags directories
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param request body CreateDirectoryRequest true "Create directory request"
// @Success 201 {object} DirectoryResponse
// @Failure 400 {object} apperror.Response
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Failure 409 {object} apperror.Response
// @Router /api/v1/directories [post]
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}

	var req CreateDirectoryRequest
	if err := decodeJSON(r.Body, &req); err != nil {
		return err
	}

	resp, err := h.service.Create(r.Context(), claims.UserID, req)
	if err != nil {
		return err
	}

	return writeJSON(w, http.StatusCreated, resp)
}

// Update renames or moves a directory.
// @Summary Update (rename/move) a directory
// @Tags directories
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path string true "Directory ID"
// @Param request body UpdateDirectoryRequest true "Update directory request"
// @Success 200 {object} DirectoryResponse
// @Failure 400 {object} apperror.Response
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Failure 409 {object} apperror.Response
// @Router /api/v1/directories/{id} [patch]
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}

	dirID := chi.URLParam(r, "id")
	if dirID == "" {
		return apperror.Validation("id директории обязателен")
	}

	var req UpdateDirectoryRequest
	if err := decodeJSON(r.Body, &req); err != nil {
		return err
	}

	resp, err := h.service.Update(r.Context(), claims.UserID, dirID, req)
	if err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, resp)
}

// SoftDelete moves a directory to trash (cascade).
// @Summary Delete directory to trash
// @Tags directories
// @Security BearerAuth
// @Param id path string true "Directory ID"
// @Success 200 {object} map[string]string
// @Failure 400 {object} apperror.Response
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Router /api/v1/directories/{id} [delete]
func (h *Handler) SoftDelete(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}
	dirID := chi.URLParam(r, "id")
	if dirID == "" {
		return apperror.Validation("id директории обязателен")
	}
	if err := h.service.SoftDelete(r.Context(), claims.UserID, dirID); err != nil {
		return err
	}
	return writeJSON(w, http.StatusOK, map[string]string{"message": "директория перемещена в корзину"})
}

// Restore restores a directory from trash.
// @Summary Restore directory from trash
// @Tags directories
// @Security BearerAuth
// @Param id path string true "Directory ID"
// @Success 200 {object} map[string]string
// @Failure 400 {object} apperror.Response
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Failure 409 {object} apperror.Response
// @Router /api/v1/directories/{id}/restore [post]
func (h *Handler) Restore(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}
	dirID := chi.URLParam(r, "id")
	if dirID == "" {
		return apperror.Validation("id директории обязателен")
	}
	if err := h.service.Restore(r.Context(), claims.UserID, dirID); err != nil {
		return err
	}
	return writeJSON(w, http.StatusOK, map[string]string{"message": "директория восстановлена"})
}

// PermanentDelete deletes a directory permanently.
// @Summary Permanently delete directory
// @Tags directories
// @Security BearerAuth
// @Param id path string true "Directory ID"
// @Success 200 {object} map[string]string
// @Failure 400 {object} apperror.Response
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Router /api/v1/directories/{id}/permanent [delete]
func (h *Handler) PermanentDelete(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}
	dirID := chi.URLParam(r, "id")
	if dirID == "" {
		return apperror.Validation("id директории обязателен")
	}
	if err := h.service.PermanentDelete(r.Context(), claims.UserID, dirID); err != nil {
		return err
	}
	return writeJSON(w, http.StatusOK, map[string]string{"message": "директория удалена навсегда"})
}

// GetPath returns the breadcrumb path for a directory (from root or shared root to the directory).
// @Summary Get directory breadcrumb path
// @Tags directories
// @Security BearerAuth
// @Produce json
// @Param id path string true "Directory ID"
// @Success 200 {object} DirectoryPathResponse
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Router /api/v1/directories/{id}/path [get]
func (h *Handler) GetPath(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}

	dirID := chi.URLParam(r, "id")
	if dirID == "" {
		return apperror.Validation("id директории обязателен")
	}

	resp, err := h.service.GetPath(r.Context(), claims.UserID, dirID)
	if err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, resp)
}

type ContentsPaginationParams struct {
	FilesLimit  int
	FilesCursor string
	DirsLimit   int
	DirsCursor  string
}

func parsePaginationParams(r *http.Request) (ContentsPaginationParams, error) {
	var p ContentsPaginationParams
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
