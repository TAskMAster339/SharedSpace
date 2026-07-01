package sharelinks

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

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

// CreateForDirectory creates a share link for a directory.
// @Summary Create share link for directory
// @Tags share-links
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path string true "Directory ID"
// @Param body body CreateShareLinkRequest true "Share link parameters"
// @Success 201 {object} ShareLinkResponse
// @Failure 400 {object} apperror.Response
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Router /api/v1/directories/{id}/share-links [post]
func (h *Handler) CreateForDirectory(w http.ResponseWriter, r *http.Request) error {
	claims, err := h.extractClaims(r)
	if err != nil {
		return err
	}

	dirID := chi.URLParam(r, "id")
	if dirID == "" {
		return apperror.Validation("id директории обязателен")
	}

	var req CreateShareLinkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		return apperror.Validation("некорректный JSON")
	}

	resp, err := h.service.CreateForDirectory(r.Context(), claims.UserID, dirID, req)
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

// ListByDirectory returns all share links for a directory.
// @Summary List share links for directory
// @Tags share-links
// @Security BearerAuth
// @Produce json
// @Param id path string true "Directory ID"
// @Param limit query int false "Maximum number of links to return"
// @Success 200 {array} ShareLinkResponse
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Router /api/v1/directories/{id}/share-links [get]
func (h *Handler) ListByDirectory(w http.ResponseWriter, r *http.Request) error {
	claims, err := h.extractClaims(r)
	if err != nil {
		return err
	}

	dirID := chi.URLParam(r, "id")
	if dirID == "" {
		return apperror.Validation("id директории обязателен")
	}

	limit := 0
	if l := r.URL.Query().Get("limit"); l != "" {
		parsed, err := strconv.Atoi(l)
		if err != nil || parsed < 0 {
			return apperror.Validation("некорректный лимит")
		}
		limit = parsed
	}

	resp, err := h.service.ListByDirectory(r.Context(), claims.UserID, dirID, limit)
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

	password, _ := url.QueryUnescape(r.Header.Get("X-SharedLink-Password"))

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

// ResolveDirectory opens a directory via a share link token.
// @Summary Open directory by share link
// @Tags share-links
// @Produce json
// @Param token path string true "Share link token"
// @Param dir query string false "Subdirectory ID to navigate into"
// @Param dirs_limit query int false "Limit for subdirectories"
// @Param dirs_cursor query string false "Cursor for subdirectories pagination"
// @Param files_limit query int false "Limit for files"
// @Param files_cursor query string false "Cursor for files pagination"
// @Param X-SharedLink-Password header string false "Password for protected links"
// @Success 200 {object} DirectoryContentResponse
// @Failure 400 {object} apperror.Response
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Router /api/v1/sd/{token} [get]
func (h *Handler) ResolveDirectory(w http.ResponseWriter, r *http.Request) error {
	token := chi.URLParam(r, "token")
	if token == "" {
		return apperror.Validation("token обязателен")
	}

	q := r.URL.Query()

	params := ResolveDirectoryParams{
		SubDirID:    q.Get("dir"),
		DirsLimit:   parseIntParam(q.Get("dirs_limit"), 20),
		DirsCursor:  q.Get("dirs_cursor"),
		FilesLimit:  parseIntParam(q.Get("files_limit"), 20),
		FilesCursor: q.Get("files_cursor"),
	}

	password, _ := url.QueryUnescape(r.Header.Get("X-SharedLink-Password"))

	authenticated := false
	rawJWT := bearerToken(r)
	if rawJWT != "" {
		claims, err := h.tokenParser.ParseAccessToken(rawJWT)
		if err == nil && claims != nil {
			authenticated = true
		}
	}

	resp, err := h.service.ResolveDirectory(r.Context(), token, password, authenticated, params)
	if err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, resp)
}

func formatFileSizeForOG(size int64) string {
	const unit = 1024
	if size < unit {
		return fmt.Sprintf("%d B", size)
	}
	div, exp := int64(unit), 0
	for n := size / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(size)/float64(div), "KMGTPE"[exp])
}

func writeOGHTML(w http.ResponseWriter, title, description, image, url string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	fmt.Fprintf(w, `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8"/>
<title>%s — SharedSpace</title>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="SharedSpace"/>
<meta property="og:title" content="%s — SharedSpace"/>
<meta property="og:description" content="%s"/>
<meta property="og:image" content="%s"/>
<meta property="og:url" content="%s"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="%s — SharedSpace"/>
<meta name="twitter:description" content="%s"/>
<meta name="twitter:image" content="%s"/>
<link rel="canonical" href="%s"/>
</head>
<body>
</body>
</html>`, title, title, description, image, url, title, description, image, url)
}

// ServeOG returns an HTML page with OG meta tags for a shared file link.
// @Summary OG meta tags for shared file
// @Tags share-links
// @Produce html
// @Param token path string true "Share link token"
// @Success 200 {string} string "HTML page with OG meta tags"
// @Failure 400 {object} apperror.Response
// @Router /api/v1/og/share/{token} [get]
func (h *Handler) ServeOG(w http.ResponseWriter, r *http.Request) error {
	token := chi.URLParam(r, "token")
	if token == "" {
		return apperror.Validation("token обязателен")
	}

	baseURL := "https://team5.st.ifbest.org"
	shareURL := fmt.Sprintf("%s/share/%s", baseURL, token)

	resp, err := h.service.Resolve(r.Context(), token, "", false)
	if err != nil {
		writeOGHTML(w, "Файл в SharedSpace", "Просмотр файла в облачном хранилище SharedSpace", baseURL+"/prefab.png", shareURL)
		return nil
	}

	ogImage := baseURL + "/prefab.png"
	if strings.HasPrefix(resp.MimeType, "image/") && resp.URL != "" {
		ogImage = resp.URL
	}

	description := fmt.Sprintf("Файл · %s · Владелец: %s", formatFileSizeForOG(resp.Size), resp.OwnerUsername)

	writeOGHTML(w, resp.Filename, description, ogImage, shareURL)
	return nil
}

// ServeDirectoryOG returns an HTML page with OG meta tags for a shared directory link.
// @Summary OG meta tags for shared directory
// @Tags share-links
// @Produce html
// @Param token path string true "Share link token"
// @Success 200 {string} string "HTML page with OG meta tags"
// @Failure 400 {object} apperror.Response
// @Router /api/v1/og/share/dir/{token} [get]
func (h *Handler) ServeDirectoryOG(w http.ResponseWriter, r *http.Request) error {
	token := chi.URLParam(r, "token")
	if token == "" {
		return apperror.Validation("token обязателен")
	}

	baseURL := "https://team5.st.ifbest.org"
	shareURL := fmt.Sprintf("%s/share/dir/%s", baseURL, token)

	resp, err := h.service.ResolveDirectory(r.Context(), token, "", false, ResolveDirectoryParams{
		DirsLimit:  1,
		FilesLimit: 1,
	})
	if err != nil {
		writeOGHTML(w, "Общая папка в SharedSpace", "Общая папка в облачном хранилище SharedSpace", baseURL+"/prefab.png", shareURL)
		return nil
	}

	totalItems := len(resp.Subdirectories) + len(resp.Files)
	description := fmt.Sprintf("Общая папка · %d элементов · Владелец: %s", totalItems, resp.OwnerUsername)

	writeOGHTML(w, resp.Name, description, baseURL+"/prefab.png", shareURL)
	return nil
}

// ServeSitemap generates an XML sitemap including all public share links.
// @Summary Sitemap XML
// @Tags share-links
// @Produce xml
// @Success 200 {string} string "Sitemap XML"
// @Router /api/v1/sitemap.xml [get]
func (h *Handler) ServeSitemap(w http.ResponseWriter, r *http.Request) error {
	entries, err := h.service.ListPublicShareLinks(r.Context())
	if err != nil {
		return apperror.WrapInternal("генерация sitemap", err)
	}

	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=86400")

	fmt.Fprintf(w, `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://team5.st.ifbest.org/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
`)

	baseURL := "https://team5.st.ifbest.org"
	for _, e := range entries {
		var loc string
		if e.IsDirectory {
			loc = fmt.Sprintf("%s/share/dir/%s", baseURL, e.Token)
		} else {
			loc = fmt.Sprintf("%s/share/%s", baseURL, e.Token)
		}
		lastMod := e.CreatedAt.Format(time.DateOnly)
		fmt.Fprintf(w, "<url><loc>%s</loc><lastmod>%s</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>\n", loc, lastMod)
	}

	fmt.Fprintf(w, "</urlset>\n")
	return nil
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

func parseIntParam(s string, defaultVal int) int {
	if s == "" {
		return defaultVal
	}
	n, err := strconv.Atoi(s)
	if err != nil || n < 1 {
		return defaultVal
	}
	return n
}

func writeJSON(w http.ResponseWriter, status int, payload any) error {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		return apperror.WrapInternal("ошибка кодирования ответа", err)
	}
	return nil
}
