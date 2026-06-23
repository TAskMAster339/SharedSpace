package files

import (
	"encoding/json"
	"mime/multipart"
	"net/http"

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
		return apperror.Unauthorized("unauthorized")
	}

	if err := r.ParseMultipartForm(maxMemory); err != nil {
		return apperror.Validation("invalid multipart form")
	}

	directoryID := r.FormValue("directory_id")
	if directoryID == "" {
		return apperror.Validation("directory_id is required")
	}

	formFiles := r.MultipartForm.File["files"]
	if len(formFiles) == 0 {
		return apperror.Validation("at least one file is required")
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
			return apperror.WrapInternal("open uploaded file", err)
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
