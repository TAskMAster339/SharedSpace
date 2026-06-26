package sharelinks

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"sharedspace/internal/apperror"
	"sharedspace/internal/auth"
)

type Handler struct {
	service     ServiceInterface
	tokenParser TokenParser
}

func NewHandler(service ServiceInterface, tokenParser TokenParser) *Handler {
	return &Handler{service: service, tokenParser: tokenParser}
}

// Create creates a share link for a file.
// @Summary Create share link
// @Tags share-links
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path string true "File ID"
// @Param body body CreateShareLinkRequest true "Share link parameters"
// @Success 201 {object} ShareLinkResponse
// @Failure 400 {object} apperror.Response
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Router /api/v1/files/{id}/share-links [post]
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) error {
	claims, err := h.extractClaims(r)
	if err != nil {
		return err
	}

	fileID := chi.URLParam(r, "id")
	if fileID == "" {
		return apperror.Validation("id файла обязателен")
	}

	var req CreateShareLinkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		return apperror.Validation("некорректный JSON")
	}

	resp, err := h.service.Create(r.Context(), claims.UserID, fileID, req)
	if err != nil {
		return err
	}

	return writeJSON(w, http.StatusCreated, resp)
}

// ListByFile returns all share links for a file.
// @Summary List share links for file
// @Tags share-links
// @Security BearerAuth
// @Produce json
// @Param id path string true "File ID"
// @Param limit query int false "Maximum number of links to return"
// @Success 200 {array} ShareLinkResponse
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Router /api/v1/files/{id}/share-links [get]
func (h *Handler) ListByFile(w http.ResponseWriter, r *http.Request) error {
	claims, err := h.extractClaims(r)
	if err != nil {
		return err
	}

	fileID := chi.URLParam(r, "id")
	if fileID == "" {
		return apperror.Validation("id файла обязателен")
	}

	limit := 0
	if l := r.URL.Query().Get("limit"); l != "" {
		parsed, err := strconv.Atoi(l)
		if err != nil || parsed < 0 {
			return apperror.Validation("некорректный лимит")
		}
		limit = parsed
	}

	resp, err := h.service.ListByFile(r.Context(), claims.UserID, fileID, limit)
	if err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, resp)
}

// Update updates a share link.
// @Summary Update share link
// @Tags share-links
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path string true "Share link ID"
// @Param body body UpdateShareLinkRequest true "Fields to update"
// @Success 200 {object} ShareLinkResponse
// @Failure 400 {object} apperror.Response
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Router /api/v1/share-links/{id} [patch]
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) error {
	claims, err := h.extractClaims(r)
	if err != nil {
		return err
	}

	linkID := chi.URLParam(r, "id")
	if linkID == "" {
		return apperror.Validation("id ссылки обязателен")
	}

	var req UpdateShareLinkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		return apperror.Validation("некорректный JSON")
	}

	resp, err := h.service.Update(r.Context(), claims.UserID, linkID, req)
	if err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, resp)
}

// Delete deletes a share link.
// @Summary Delete share link
// @Tags share-links
// @Security BearerAuth
// @Param id path string true "Share link ID"
// @Success 200 {object} map[string]string
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Router /api/v1/share-links/{id} [delete]
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) error {
	claims, err := h.extractClaims(r)
	if err != nil {
		return err
	}

	linkID := chi.URLParam(r, "id")
	if linkID == "" {
		return apperror.Validation("id ссылки обязателен")
	}

	if err := h.service.Delete(r.Context(), claims.UserID, linkID); err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, map[string]string{"message": "ссылка удалена"})
}

// Resolve opens a file via a share link token.
// @Summary Open file by share link
// @Tags share-links
// @Produce json
// @Param token path string true "Share link token"
// @Param X-SharedLink-Password header string false "Password for protected links"
// @Success 200 {object} FileContentResponse
// @Failure 400 {object} apperror.Response
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Router /api/v1/s/{token} [get]
func (h *Handler) Resolve(w http.ResponseWriter, r *http.Request) error {
	token := chi.URLParam(r, "token")
	if token == "" {
		return apperror.Validation("token обязателен")
	}

	password := r.Header.Get("X-SharedLink-Password")

	authenticated := false
	rawJWT := bearerToken(r)
	if rawJWT != "" {
		claims, err := h.tokenParser.ParseAccessToken(rawJWT)
		if err == nil && claims != nil {
			authenticated = true
		}
	}

	resp, err := h.service.Resolve(r.Context(), token, password, authenticated)
	if err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) extractClaims(r *http.Request) (*auth.Claims, error) {
	raw := bearerToken(r)
	if raw == "" {
		return nil, apperror.Unauthorized("authorization header required")
	}

	claims, err := h.tokenParser.ParseAccessToken(raw)
	if err != nil {
		return nil, apperror.Unauthorized("invalid or expired token")
	}

	return claims, nil
}

func bearerToken(r *http.Request) string {
	header := strings.TrimSpace(r.Header.Get("Authorization"))
	if !strings.HasPrefix(header, "Bearer ") {
		return ""
	}
	token := strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
	return token
}

func writeJSON(w http.ResponseWriter, status int, payload any) error {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		return apperror.WrapInternal("ошибка кодирования ответа", err)
	}
	return nil
}
