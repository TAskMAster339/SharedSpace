package auth

import (
	"encoding/json"
	"io"
	"net"
	"net/http"
	"strings"

	"sharedspace/internal/apperror"
)

type Handler struct {
	service AuthService
}

func NewHandler(service AuthService) *Handler {
	return &Handler{service: service}
}

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) error {
	var req RegisterRequest
	if err := decodeJSON(r.Body, &req); err != nil {
		return err
	}

	resp, err := h.service.Register(r.Context(), req)
	if err != nil {
		return err
	}

	return writeJSON(w, http.StatusCreated, resp)
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) error {
	var req LoginRequest
	if err := decodeJSON(r.Body, &req); err != nil {
		return err
	}

	resp, err := h.service.Login(r.Context(), req, loginMeta{
		UserAgent: r.UserAgent(),
		IPAddress: clientIP(r),
	})
	if err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) error {
	var req RefreshRequest
	if err := decodeJSON(r.Body, &req); err != nil {
		return err
	}

	if err := h.service.Logout(r.Context(), req.RefreshToken); err != nil {
		return err
	}

	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (h *Handler) Refresh(w http.ResponseWriter, r *http.Request) error {
	var req RefreshRequest
	if err := decodeJSON(r.Body, &req); err != nil {
		return err
	}

	resp, err := h.service.Refresh(r.Context(), req.RefreshToken, loginMeta{
		UserAgent: r.UserAgent(),
		IPAddress: clientIP(r),
	})
	if err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, resp)
}

func decodeJSON(body io.ReadCloser, dst any) error {
	defer body.Close()
	dec := json.NewDecoder(body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return apperror.Validation("invalid JSON body")
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, payload any) error {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		return apperror.WrapInternal("encode response", err)
	}
	return nil
}

func clientIP(r *http.Request) string {
	if forwarded := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); forwarded != "" {
		parts := strings.Split(forwarded, ",")
		if len(parts) > 0 {
			return strings.TrimSpace(parts[0])
		}
	}
	if realIP := strings.TrimSpace(r.Header.Get("X-Real-IP")); realIP != "" {
		return realIP
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
