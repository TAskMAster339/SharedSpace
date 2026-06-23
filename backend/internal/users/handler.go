package users

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"

	"sharedspace/internal/apperror"
)

type Handler struct {
	service  ServiceInterface
	authnSvc AuthIdentity
}

func NewHandler(service ServiceInterface, authnSvc AuthIdentity) *Handler {
	return &Handler{service: service, authnSvc: authnSvc}
}

// GetMe returns the profile of the currently authenticated user.
// @Summary Get current user profile
// @Tags users
// @Security BearerAuth
// @Produce json
// @Success 200 {object} UserResponse
// @Failure 401 {object} apperror.Error
// @Router /api/v1/users/me [get]
func (h *Handler) GetMe(w http.ResponseWriter, r *http.Request) error {
	userID, err := h.userIDFromRequest(r)
	if err != nil {
		return err
	}

	resp, err := h.service.GetMe(r.Context(), userID)
	if err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, resp)
}

// UpdateMe updates profile fields of the currently authenticated user.
// @Summary Update current user profile
// @Tags users
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param request body UpdateProfileRequest true "Profile fields to update"
// @Success 200 {object} UserResponse
// @Failure 400 {object} apperror.Error
// @Failure 401 {object} apperror.Error
// @Router /api/v1/users/me [patch]
func (h *Handler) UpdateMe(w http.ResponseWriter, r *http.Request) error {
	userID, err := h.userIDFromRequest(r)
	if err != nil {
		return err
	}

	var req UpdateProfileRequest
	if err := decodeJSON(r.Body, &req); err != nil {
		return err
	}

	resp, err := h.service.UpdateMe(r.Context(), userID, req)
	if err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, resp)
}

// ChangePassword changes the password of the currently authenticated user.
// @Summary Change current user password
// @Tags users
// @Security BearerAuth
// @Accept json
// @Param request body ChangePasswordRequest true "Current and new password"
// @Success 204 "No Content"
// @Failure 400 {object} apperror.Error
// @Failure 401 {object} apperror.Error
// @Router /api/v1/users/me/password [patch]
func (h *Handler) ChangePassword(w http.ResponseWriter, r *http.Request) error {
	userID, err := h.userIDFromRequest(r)
	if err != nil {
		return err
	}

	var req ChangePasswordRequest
	if err := decodeJSON(r.Body, &req); err != nil {
		return err
	}

	if err := h.service.ChangePassword(r.Context(), userID, req); err != nil {
		return err
	}

	w.WriteHeader(http.StatusNoContent)
	return nil
}

// SearchUsers searches for users by a free-text query.
// @Summary Search users
// @Tags users
// @Security BearerAuth
// @Produce json
// @Param query query string false "Search query"
// @Param limit query int false "Maximum number of results" default(20)
// @Success 200 {object} SearchUsersResponse
// @Failure 400 {object} apperror.Error
// @Failure 401 {object} apperror.Error
// @Router /api/v1/users/search [get]
func (h *Handler) SearchUsers(w http.ResponseWriter, r *http.Request) error {
	userID, err := h.userIDFromRequest(r)
	if err != nil {
		return err
	}

	query := strings.TrimSpace(r.URL.Query().Get("query"))
	limit := 20
	if rawLimit := strings.TrimSpace(r.URL.Query().Get("limit")); rawLimit != "" {
		parsedLimit, err := strconv.Atoi(rawLimit)
		if err != nil {
			return apperror.Validation("limit must be a number")
		}
		limit = parsedLimit
	}

	resp, err := h.service.SearchUsers(r.Context(), userID, query, limit)
	if err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, resp)
}

// DeleteAccount deletes account of the currently authenticated user.
// @Summary Delete current user account
// @Tags users
// @Security BearerAuth
// @Accept json
// @Param request body DeleteAccountRequest true "Current refresh token"
// @Success 204 "No Content"
// @Failure 400 {object} apperror.Error
// @Failure 401 {object} apperror.Error
// @Router /api/v1/users/me [delete]
func (h *Handler) DeleteAccount(w http.ResponseWriter, r *http.Request) error {
	userID, err := h.userIDFromRequest(r)
	if err != nil {
		return err
	}

	var req DeleteAccountRequest
	if err := decodeJSON(r.Body, &req); err != nil {
		return err
	}

	if err := h.service.DeleteAccount(r.Context(), userID, req); err != nil {
		return err
	}

	w.WriteHeader(http.StatusNoContent)
	return nil
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

func (h *Handler) userIDFromRequest(r *http.Request) (string, error) {
	authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
	if authHeader == "" {
		return "", apperror.Unauthorized("authorization header is required")
	}

	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return "", apperror.Unauthorized("invalid authorization header")
	}

	if h.authnSvc == nil {
		return "", apperror.Internal("authorization service is not configured")
	}

	return h.authnSvc.UserIDFromAccessToken(r.Context(), strings.TrimSpace(parts[1]))
}
