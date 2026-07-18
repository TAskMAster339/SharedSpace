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

// Register handles user registration.
// @Summary Register a new user
// @Tags auth
// @Accept json
// @Produce json
// @Param request body RegisterRequest true "Registration request"
// @Success 201 {object} RegisterResponse
// @Failure 400 {object} ErrorResponse
// @Failure 409 {object} ErrorResponse
// @Router /api/v1/auth/register [post]
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

// Login handles user authentication.
// @Summary Authenticate a user
// @Tags auth
// @Accept json
// @Produce json
// @Param request body LoginRequest true "Login request"
// @Success 200 {object} LoginResponse
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Router /api/v1/auth/login [post]
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

// Logout invalidates the current refresh token.
// @Summary Logout a user
// @Tags auth
// @Accept json
// @Produce json
// @Param request body RefreshRequest true "Refresh token to invalidate"
// @Success 204 "No Content"
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Router /api/v1/auth/logout [post]
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

// Refresh handles refresh token rotation.
// @Summary Refresh access and refresh tokens
// @Tags auth
// @Accept json
// @Produce json
// @Param request body RefreshRequest true "Refresh request"
// @Success 200 {object} RefreshResponse
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Router /api/v1/auth/refresh [post]
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

// VerifyEmail handles email confirmation via a single-use token.
// @Summary Confirm user email
// @Tags auth
// @Accept json
// @Produce json
// @Param request body VerifyEmailRequest true "Verification token"
// @Success 200 {object} VerifyEmailResponse
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Failure 409 {object} ErrorResponse
// @Router /api/v1/auth/verify-email [post]
func (h *Handler) VerifyEmail(w http.ResponseWriter, r *http.Request) error {
	var req VerifyEmailRequest
	if err := decodeJSON(r.Body, &req); err != nil {
		return err
	}

	resp, err := h.service.VerifyEmail(r.Context(), req.Token)
	if err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, resp)
}

// ResendVerification re-issues and emails a verification token for the
// authenticated caller.
// @Summary Resend email verification message
// @Tags auth
// @Security BearerAuth
// @Produce json
// @Success 200 {object} MessageResponse
// @Failure 401 {object} ErrorResponse
// @Failure 403 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Failure 409 {object} ErrorResponse
// @Router /api/v1/auth/resend-verification/me [post]
func (h *Handler) ResendVerification(w http.ResponseWriter, r *http.Request) error {
	claims, ok := claimsFromRequest(r)
	if !ok || claims.UserID == "" {
		return apperror.Unauthorized("требуется access токен")
	}

	if err := h.service.ResendVerification(r.Context(), claims.UserID); err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, MessageResponse{Message: "письмо подтверждения отправлено"})
}

// ForgotPassword triggers a password-reset email if the address belongs to an
// activated user. Always returns 200 to avoid leaking registered emails.
// @Summary Request password reset email
// @Tags auth
// @Accept json
// @Produce json
// @Param request body ForgotPasswordRequest true "Account email"
// @Success 200 {object} MessageResponse
// @Failure 400 {object} ErrorResponse
// @Router /api/v1/auth/forgot-password [post]
func (h *Handler) ForgotPassword(w http.ResponseWriter, r *http.Request) error {
	var req ForgotPasswordRequest
	if err := decodeJSON(r.Body, &req); err != nil {
		return err
	}

	if err := h.service.RequestPasswordReset(r.Context(), req.Email); err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, MessageResponse{Message: "если аккаунт существует и подтверждён, письмо отправлено"})
}

// ResetPassword completes a password reset using a single-use token.
// @Summary Reset password with token
// @Tags auth
// @Accept json
// @Produce json
// @Param request body ResetPasswordRequest true "Reset token and new password"
// @Success 200 {object} MessageResponse
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Failure 409 {object} ErrorResponse
// @Router /api/v1/auth/reset-password [post]
func (h *Handler) ResetPassword(w http.ResponseWriter, r *http.Request) error {
	var req ResetPasswordRequest
	if err := decodeJSON(r.Body, &req); err != nil {
		return err
	}

	if err := h.service.ResetPassword(r.Context(), req.Token, req.NewPassword); err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, MessageResponse{Message: "пароль успешно изменён"})
}

// claimsFromRequest pulls the JWT claims previously attached by JWTAuth middleware.
func claimsFromRequest(r *http.Request) (*Claims, bool) {
	return ClaimsFromCtx(r.Context())
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
