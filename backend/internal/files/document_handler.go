package files

import (
	"context"
	"io"
	"log"
	"mime"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"sharedspace/internal/apperror"
	"sharedspace/internal/auth"
	"sharedspace/internal/sharelinks"
)

func officeViewOptions(r *http.Request) OfficeViewOptions {
	query := r.URL.Query()
	layout := query.Get("layout")
	return OfficeViewOptions{Theme: query.Get("theme"), Compact: layout == "compact", Reader: layout == "reader"}
}

type DocumentHandler struct {
	service     *DocumentService
	tokenParser sharelinks.TokenParser
}

func NewDocumentHandler(service *DocumentService, tokenParser sharelinks.TokenParser) *DocumentHandler {
	return &DocumentHandler{service: service, tokenParser: tokenParser}
}

// @Summary Start a Office editing session
// @Tags files
// @Security BearerAuth
// @Produce json
// @Param id path string true "File ID"
// @Param theme query string false "Interface theme" Enums(light,dark)
// @Param layout query string false "Compact toolbar and fit-to-screen zoom" Enums(compact)
// @Success 200 {object} DocumentEditorSession
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Failure 409 {object} apperror.Response
// @Failure 415 {object} apperror.Response
// @Failure 429 {object} apperror.Response
// @Failure 503 {object} apperror.Response
// @Router /api/v1/files/{id}/editor-session [post]
func (h *DocumentHandler) Start(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}
	result, err := h.service.StartSession(r.Context(), chi.URLParam(r, "id"), claims.UserID, claims.Username, officeViewOptions(r))
	if err != nil {
		return err
	}
	w.Header().Set("Cache-Control", "no-store")
	return writeJSON(w, http.StatusOK, result)
}

// @Summary Start a read-only Office file preview
// @Tags files
// @Security BearerAuth
// @Produce json
// @Param id path string true "File ID"
// @Param theme query string false "Interface theme" Enums(light,dark)
// @Param layout query string false "Compact toolbar or embedded reader for XLSX and PPTX" Enums(compact,reader)
// @Success 200 {object} DocumentEditorSession
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Failure 409 {object} apperror.Response
// @Failure 415 {object} apperror.Response
// @Failure 429 {object} apperror.Response
// @Failure 503 {object} apperror.Response
// @Router /api/v1/files/{id}/preview-session [post]
func (h *DocumentHandler) Preview(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}
	result, err := h.service.StartPreview(r.Context(), chi.URLParam(r, "id"), claims.UserID, claims.Username, officeViewOptions(r))
	if err != nil {
		return err
	}
	w.Header().Set("Cache-Control", "no-store")
	return writeJSON(w, http.StatusOK, result)
}

// @Summary Start a read-only Office preview from a file share link
// @Tags sharelinks
// @Produce json
// @Param token path string true "Share link token"
// @Param X-SharedLink-Password header string false "Password for protected links"
// @Param theme query string false "Interface theme" Enums(light,dark)
// @Param layout query string false "Compact toolbar or embedded reader for XLSX and PPTX" Enums(compact,reader)
// @Success 200 {object} DocumentEditorSession
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Failure 409 {object} apperror.Response
// @Failure 415 {object} apperror.Response
// @Failure 429 {object} apperror.Response
// @Failure 503 {object} apperror.Response
// @Router /api/v1/s/{token}/preview-session [post]
func (h *DocumentHandler) SharedPreview(w http.ResponseWriter, r *http.Request) error {
	password, authenticated := sharelinks.FileLinkCredentials(r, h.tokenParser)
	w.Header().Set("Cache-Control", "no-store")
	result, err := h.service.StartSharedPreview(r.Context(), chi.URLParam(r, "token"), password, authenticated, officeViewOptions(r))
	if err != nil {
		return err
	}
	return writeJSON(w, http.StatusOK, result)
}

// @Summary Renew or release a temporary Office capacity reservation
// @Tags files
// @Param Authorization header string true "Bearer lease_id from the Office session response"
// @Success 204
// @Failure 400 {object} apperror.Response
// @Failure 410 {object} apperror.Response
// @Router /api/v1/office/lease [post]
// @Router /api/v1/office/lease [delete]
func (h *DocumentHandler) ManageLease(w http.ResponseWriter, r *http.Request) error {
	id := bearerToken(r.Header.Get("Authorization"))
	if _, err := uuid.Parse(id); err != nil {
		return apperror.Validation("некорректный идентификатор офисного сеанса")
	}
	var err error
	if r.Method == http.MethodDelete {
		err = h.service.releaseOfficeLease(r.Context(), id)
	} else {
		err = h.service.renewOfficeLease(r.Context(), id)
	}
	if err != nil {
		return err
	}
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// @Summary List saved Office versions and editor permissions
// @Tags files
// @Security BearerAuth
// @Produce json
// @Param id path string true "File ID"
// @Success 200 {object} DocumentHistory
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Failure 415 {object} apperror.Response
// @Router /api/v1/files/{id}/versions [get]
func (h *DocumentHandler) History(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}
	result, err := h.service.History(r.Context(), chi.URLParam(r, "id"), claims.UserID)
	if err != nil {
		return err
	}
	w.Header().Set("Cache-Control", "no-store")
	return writeJSON(w, http.StatusOK, result)
}

// @Summary Get a temporary download URL for an Office version
// @Tags files
// @Security BearerAuth
// @Produce json
// @Param id path string true "File ID"
// @Param number path int true "Version number"
// @Success 200 {object} FileContentResponse
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Router /api/v1/files/{id}/versions/{number}/content [get]
func (h *DocumentHandler) Download(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}
	number, err := documentVersionNumber(r)
	if err != nil {
		return err
	}
	result, err := h.service.DownloadVersion(r.Context(), chi.URLParam(r, "id"), claims.UserID, number)
	if err != nil {
		return err
	}
	w.Header().Set("Cache-Control", "no-store")
	return writeJSON(w, http.StatusOK, result)
}

// @Summary Restore an Office version as a new current version
// @Tags files
// @Security BearerAuth
// @Param id path string true "File ID"
// @Param number path int true "Version number"
// @Success 204
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Failure 409 {object} apperror.Response
// @Router /api/v1/files/{id}/versions/{number}/restore [post]
func (h *DocumentHandler) Restore(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("не авторизован")
	}
	number, err := documentVersionNumber(r)
	if err != nil {
		return err
	}
	if err := h.service.RestoreVersion(r.Context(), chi.URLParam(r, "id"), claims.UserID, claims.Username, number); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func documentVersionNumber(r *http.Request) (int64, error) {
	number, err := strconv.ParseInt(chi.URLParam(r, "number"), 10, 64)
	if err != nil || number <= 0 {
		return 0, apperror.Validation("некорректный номер версии")
	}
	return number, nil
}

func (h *DocumentHandler) Source(w http.ResponseWriter, r *http.Request) error {
	file, err := h.service.sourceFile(r.Context(), r.URL.Query().Get("grant"))
	if err != nil {
		return err
	}
	return h.serveOfficeFile(w, r, file)
}

func (h *DocumentHandler) PreviewSource(w http.ResponseWriter, r *http.Request) error {
	file, err := h.service.previewSourceFile(r.Context(), r.URL.Query().Get("grant"))
	if err != nil {
		return err
	}
	return h.serveOfficeFile(w, r, file)
}

func (h *DocumentHandler) serveOfficeFile(w http.ResponseWriter, r *http.Request, file fileRecord) error {
	reader, err := h.service.storage.Get(r.Context(), file.ObjectKey)
	if err != nil {
		return err
	}
	defer reader.Close()
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Content-Type", officeFormats[ExtractExtension(file.Filename)].mime)
	w.Header().Set("Content-Length", strconv.FormatInt(file.Size, 10))
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": file.Filename}))
	if _, err := io.Copy(w, reader); err != nil {
		log.Printf("document source %s: %v", file.ID, err)
	}
	return nil
}

func (h *DocumentHandler) Callback(w http.ResponseWriter, r *http.Request) error {
	token := bearerToken(r.Header.Get("Authorization"))
	if token == "" {
		return apperror.Unauthorized("отсутствует подпись редактора")
	}
	ctx, cancel := context.WithTimeout(r.Context(), time.Minute)
	defer cancel()
	if err := h.service.ProcessCallback(ctx, token); err != nil {
		if appErr, ok := apperror.From(err); ok && appErr.Status() == http.StatusUnauthorized {
			return err
		}
		log.Printf("document callback: %v", err)
		return writeJSON(w, http.StatusOK, map[string]int{"error": 1})
	}
	return writeJSON(w, http.StatusOK, map[string]int{"error": 0})
}
