package files

import (
	"encoding/json"
	"errors"
	"log"
	"mime/multipart"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"sharedspace/internal/apperror"
	"sharedspace/internal/auth"
)

const (
	maxMemory       = 32 << 20
	maxRequestBytes = maxFileSize + (1 << 20)
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
// @Failure 413 {object} apperror.Response
// @Router /api/v1/files [post]
func (h *Handler) Upload(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}

	if r.ContentLength > maxRequestBytes {
		return uploadTooLarge("запрос загрузки превышает 513 МиБ")
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBytes)
	if err := r.ParseMultipartForm(maxMemory); err != nil {
		var limit *http.MaxBytesError
		if errors.As(err, &limit) || errors.Is(err, multipart.ErrMessageTooLarge) {
			return uploadTooLarge("запрос загрузки превышает допустимые пределы")
		}
		return apperror.Validation("некорректная multipart-форма")
	}
	defer r.MultipartForm.RemoveAll()

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

// GetRecent returns the most recent files for the authenticated user.
// Supports optional cursor-based pagination via ?limit=N&cursor=<token>.
// Without limit/cursor, returns all files (backward compatible).
// @Summary Get recent files
// @Tags files
// @Security BearerAuth
// @Produce json
// @Param limit query int false "Page size"
// @Param cursor query string false "Pagination cursor from previous response"
// @Success 200 {object} RecentFilesResponse
// @Failure 400 {object} apperror.Response
// @Failure 401 {object} apperror.Response
// @Router /api/v1/files/recent [get]
func (h *Handler) GetRecent(w http.ResponseWriter, r *http.Request) error {
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

	log.Printf("GetRecent: userID=%s, limit=%d, cursor=%s", claims.UserID, limit, cursor)

	resp, err := h.service.GetRecent(r.Context(), claims.UserID, limit, cursor)
	if err != nil {
		log.Printf("GetRecent error: %v", err)
		return err
	}

	if resp.Files == nil {
		resp.Files = []FileMetadataResponse{}
	}

	return writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) decodeJSON(r *http.Request, v any) error {
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
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

// Update moves or renames a file.
// @Summary Move or rename a file
// @Tags files
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path string true "File ID"
// @Param body body UpdateFileRequest true "Fields to update"
// @Success 200 {object} FileMetadataResponse
// @Failure 400 {object} apperror.Response
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Router /api/v1/files/{id} [patch]
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}

	fileID := chi.URLParam(r, "id")
	if fileID == "" {
		return apperror.Validation("id файла обязателен")
	}

	var req UpdateFileRequest
	if err := h.decodeJSON(r, &req); err != nil {
		return err
	}

	resp, err := h.service.Update(r.Context(), claims.UserID, fileID, req)
	if err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, resp)
}

// Rename renames a file.
// @Summary Rename file
// @Tags files
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path string true "File ID"
// @Param body body RenameFileRequest true "Rename file request"
// @Success 200 {object} FileMetadataResponse
// @Failure 400 {object} apperror.Response
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Router /api/v1/files/{id}/rename [post]
func (h *Handler) Rename(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}

	fileID := chi.URLParam(r, "id")
	if fileID == "" {
		return apperror.Validation("id файла обязателен")
	}

	var req RenameFileRequest
	if err := h.decodeJSON(r, &req); err != nil {
		return err
	}

	if req.Filename == "" {
		return apperror.Validation("имя файла не может быть пустым")
	}

	resp, err := h.service.Update(r.Context(), claims.UserID, fileID, UpdateFileRequest{
		Filename: &req.Filename,
	})
	if err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, resp)
}

// SoftDelete moves a file to trash.
// @Summary Move file to trash
// @Tags files
// @Security BearerAuth
// @Param id path string true "File ID"
// @Success 200 {object} map[string]string
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
	return writeJSON(w, http.StatusOK, map[string]string{"message": "файл перемещён в корзину"})
}

// Restore restores a file from trash.
// @Summary Restore file from trash
// @Tags files
// @Security BearerAuth
// @Param id path string true "File ID"
// @Success 200 {object} map[string]string
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
	return writeJSON(w, http.StatusOK, map[string]string{"message": "файл восстановлен"})
}

// PermanentDelete deletes a file permanently.
// @Summary Permanently delete file
// @Tags files
// @Security BearerAuth
// @Param id path string true "File ID"
// @Success 200 {object} map[string]string
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
	return writeJSON(w, http.StatusOK, map[string]string{"message": "файл удалён навсегда"})
}

// Convert converts an image to another format (PNG→JPG, PNG→WEBP, JPG→WEBP).
// @Summary Convert image format
// @Tags files
// @Security BearerAuth
// @Accept json
// @Produce json
// @Produce application/octet-stream
// @Param id path string true "File ID"
// @Param body body ConvertRequest true "Целевой формат и флаг сохранения"
// @Param async query bool false "Вернуть задачу без ожидания"
// @Param Idempotency-Key header string false "UUID запроса конвертации"
// @Success 200 {object} ConversionDownloadResponse "Ссылка (при save=false)"
// @Success 202 {object} MediaJobResponse
// @Failure 429 {object} apperror.Response
// @Failure 504 {object} apperror.Response
// @Success 201 {object} ConversionResponse "Запись о конверсии (при save=true)"
// @Failure 400 {object} apperror.Response
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Router /api/v1/files/{id}/convert [post]
func (h *Handler) Convert(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}
	fileID := chi.URLParam(r, "id")
	if fileID == "" {
		return apperror.Validation("id файла обязателен")
	}
	var req ConvertRequest
	if err := h.decodeJSON(r, &req); err != nil {
		return err
	}
	if req.TargetFormat == "" {
		return apperror.Validation("target_format обязателен")
	}

	async := r.URL.Query().Get("async") == "true"
	resp, err := h.service.RequestConversion(r.Context(), claims.UserID, fileID, req, async, r.Header.Get("Idempotency-Key"))
	if err != nil {
		return mediaHTTPError(w, err)
	}
	if async {
		return writeMediaAccepted(w, resp)
	}
	if req.Save {
		return writeJSON(w, http.StatusCreated, resp.Conversion)
	}
	return writeJSON(w, http.StatusOK, resp.Download)
}

func mediaHTTPError(w http.ResponseWriter, err error) error {
	if apiErr, ok := apperror.From(err); ok && apiErr.Code() == "media_capacity" {
		w.Header().Set("Retry-After", "2")
	}
	return err
}

func writeMediaAccepted(w http.ResponseWriter, resp MediaJobResponse) error {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Retry-After", "2")
	w.Header().Set("Location", "/api/v1/files/jobs/"+resp.JobID)
	return writeJSON(w, http.StatusAccepted, resp)
}

// @Summary Get a media job
// @Tags files
// @Security BearerAuth
// @Produce json
// @Param jobID path string true "Job ID"
// @Success 200 {object} MediaJobResponse
// @Failure 400 {object} apperror.Response
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Failure 409 {object} apperror.Response
// @Failure 410 {object} apperror.Response
// @Failure 503 {object} apperror.Response
// @Failure 504 {object} apperror.Response
// @Router /api/v1/files/jobs/{jobID} [get]
func (h *Handler) MediaJob(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}
	w.Header().Set("Cache-Control", "no-store")
	resp, err := h.service.MediaJob(r.Context(), claims.UserID, chi.URLParam(r, "jobID"))
	if err != nil {
		return err
	}
	if resp.RetryAfter > 0 {
		w.Header().Set("Retry-After", "2")
	}
	return writeJSON(w, http.StatusOK, resp)
}

// ListConversions returns the conversion history for a file.
// @Summary List file conversions
// @Tags files
// @Security BearerAuth
// @Produce json
// @Param id path string true "File ID"
// @Success 200 {object} ConversionsListResponse
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Router /api/v1/files/{id}/conversions [get]
func (h *Handler) ListConversions(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}
	fileID := chi.URLParam(r, "id")
	if fileID == "" {
		return apperror.Validation("id файла обязателен")
	}
	resp, err := h.service.ListConversions(r.Context(), claims.UserID, fileID)
	if err != nil {
		return err
	}
	if resp.Conversions == nil {
		resp.Conversions = []ConversionResponse{}
	}
	return writeJSON(w, http.StatusOK, resp)
}

// GetPreview returns a signed URL for a cached, compact media preview.
// @Summary Get image or first video frame preview
// @Tags files
// @Security BearerAuth
// @Produce json
// @Param id path string true "File ID"
// @Param async query bool false "Вернуть задачу без ожидания"
// @Success 200 {object} FileContentResponse
// @Success 202 {object} MediaJobResponse
// @Failure 429 {object} apperror.Response
// @Failure 504 {object} apperror.Response
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Router /api/v1/files/{id}/preview [get]
func (h *Handler) GetPreview(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}
	fileID := chi.URLParam(r, "id")
	if fileID == "" {
		return apperror.Validation("id файла обязателен")
	}
	w.Header().Set("Cache-Control", "no-store")
	resp, err := h.service.RequestPreview(r.Context(), claims.UserID, fileID, r.URL.Query().Get("async") == "true")
	if err != nil {
		return mediaHTTPError(w, err)
	}
	if resp.Preview == nil {
		return writeMediaAccepted(w, resp)
	}
	return writeJSON(w, http.StatusOK, resp.Preview)
}
