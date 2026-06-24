package files

import (
	"encoding/json"
	"mime/multipart"
	"net/http"

	"github.com/go-chi/chi/v5"

	"sharedspace/internal/apperror"
	"sharedspace/internal/auth"
)

const (
	maxMemory       = 32 << 20
	maxRequestBytes = 1 << 30
)

type Handler struct {
	service ServiceInterface
}

func NewHandler(service ServiceInterface) *Handler {
	return &Handler{service: service}
}

// Upload handles multipart file upload (regular file picker or drag-and-drop).
// @Summary Upload files to a directory
// @Tags files
// @Security BearerAuth
// @Accept multipart/form-data
// @Produce json
// @Param directory_id formData string true "Target directory ID"
// @Param files formData file true "Files to upload (multiple allowed)"
// @Success 201 {object} UploadFilesResponse
// @Failure 400 {object} apperror.Response
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Router /api/v1/files [post]
func (h *Handler) Upload(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}

	if err := r.ParseMultipartForm(maxMemory); err != nil {
		return apperror.Validation("некорректная multipart-форма")
	}

	directoryID := r.FormValue("directory_id")
	if directoryID == "" {
		return apperror.Validation("directory_id обязателен")
	}

	formFiles := r.MultipartForm.File["files"]
	if len(formFiles) == 0 {
		return apperror.Validation("требуется хотя бы один файл")
	}

	var opened []multipart.File
	defer func() {
		for _, f := range opened {
			f.Close()
		}
	}()

	uploads := make([]FileUpload, 0, len(formFiles))
	for _, fh := range formFiles {
		f, err := fh.Open()
		if err != nil {
			return apperror.WrapInternal("открытие загруженного файла", err)
		}
		opened = append(opened, f)

		mimeType := fh.Header.Get("Content-Type")
		if mimeType == "" {
			mimeType = "application/octet-stream"
		}

		uploads = append(uploads, FileUpload{
			Filename:  fh.Filename,
			Extension: ExtractExtension(fh.Filename),
			MimeType:  mimeType,
			Size:      fh.Size,
			Content:   f,
		})
	}

	resp, err := h.service.Upload(r.Context(), claims.UserID, directoryID, uploads)
	if err != nil {
		return err
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	return json.NewEncoder(w).Encode(resp)
}

// GetMetadata returns file metadata by ID.
// @Summary Get file metadata
// @Tags files
// @Security BearerAuth
// @Produce json
// @Param id path string true "File ID"
// @Success 200 {object} FileMetadataResponse
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Router /api/v1/files/{id} [get]
func (h *Handler) GetMetadata(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}

	fileID := chi.URLParam(r, "id")
	if fileID == "" {
		return apperror.Validation("id файла обязателен")
	}

	resp, err := h.service.GetMetadata(r.Context(), claims.UserID, fileID)
	if err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, resp)
}

// GetContent returns a presigned URL to view/download the file.
// @Summary Get file content URL
// @Tags files
// @Security BearerAuth
// @Produce json
// @Param id path string true "File ID"
// @Success 200 {object} FileContentResponse
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Router /api/v1/files/{id}/content [get]
func (h *Handler) GetContent(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}

	fileID := chi.URLParam(r, "id")
	if fileID == "" {
		return apperror.Validation("id файла обязателен")
	}

	resp, err := h.service.GetContentURL(r.Context(), claims.UserID, fileID)
	if err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, resp)
}

func writeJSON(w http.ResponseWriter, status int, payload any) error {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		return apperror.WrapInternal("encode response", err)
	}
	return nil
}

// SoftDelete moves a file to trash.
// @Summary Move file to trash
// @Tags files
// @Security BearerAuth
// @Param id path string true "File ID"
// @Success 204
// @Router /api/v1/files/{id} [delete]
func (h *Handler) SoftDelete(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}
	fileID := chi.URLParam(r, "id")
	if fileID == "" {
		return apperror.Validation("id файла обязателен")
	}
	if err := h.service.SoftDelete(r.Context(), claims.UserID, fileID); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// Restore restores a file from trash.
// @Summary Restore file from trash
// @Tags files
// @Security BearerAuth
// @Param id path string true "File ID"
// @Success 204
// @Router /api/v1/files/{id}/restore [post]
func (h *Handler) Restore(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}
	fileID := chi.URLParam(r, "id")
	if fileID == "" {
		return apperror.Validation("id файла обязателен")
	}
	if err := h.service.Restore(r.Context(), claims.UserID, fileID); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// PermanentDelete deletes a file permanently.
// @Summary Permanently delete file
// @Tags files
// @Security BearerAuth
// @Param id path string true "File ID"
// @Success 204
// @Router /api/v1/files/{id}/permanent [delete]
func (h *Handler) PermanentDelete(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}
	fileID := chi.URLParam(r, "id")
	if fileID == "" {
		return apperror.Validation("id файла обязателен")
	}
	if err := h.service.PermanentDelete(r.Context(), claims.UserID, fileID); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}
