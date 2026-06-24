package sharing

import (
	"encoding/json"
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

// GetSharedWithMe returns all shared directories where the authenticated user is a member.
// @Summary List shared directories for current user
// @Tags sharing
// @Security BearerAuth
// @Produce json
// @Success 200 {array} SharedDirectoryResponse
// @Failure 401 {object} apperror.Response
// @Router /api/v1/shared/with-me [get]
func (h *Handler) GetSharedWithMe(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("неавторизован")
	}

	resp, err := h.service.GetSharedWithMe(r.Context(), claims.UserID)
	if err != nil {
		return err
	}

	if resp == nil {
		resp = []SharedDirectoryResponse{}
	}

	return writeJSON(w, http.StatusOK, resp)
}

// GetSharedWithMeStats returns shared directories with member and file counts.
// @Summary List shared directories with stats for current user
// @Tags sharing
// @Security BearerAuth
// @Produce json
// @Success 200 {array} SharedDirectoryWithStatsResponse
// @Failure 401 {object} apperror.Response
// @Router /api/v1/shared/with-me/stats [get]
func (h *Handler) GetSharedWithMeStats(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("неавторизован")
	}

	resp, err := h.service.GetSharedWithMeStats(r.Context(), claims.UserID)
	if err != nil {
		return err
	}

	if resp == nil {
		resp = []SharedDirectoryWithStatsResponse{}
	}

	return writeJSON(w, http.StatusOK, resp)
}

// GetMembers returns all members of a shared directory.
// @Summary Get shared directory members
// @Tags sharing
// @Security BearerAuth
// @Produce json
// @Param id path string true "Shared Directory ID"
// @Param limit query int false "Maximum number of members to return"
// @Success 200 {array} MemberResponse
// @Failure 400 {object} apperror.Response
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Router /api/v1/shared-directories/{id}/members [get]
func (h *Handler) GetMembers(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("неавторизован")
	}

	sharedDirID := chi.URLParam(r, "id")
	if sharedDirID == "" {
		return apperror.Validation("требуется идентификатор общей директории")
	}

	limit := 0
	if l := r.URL.Query().Get("limit"); l != "" {
		parsed, err := strconv.Atoi(l)
		if err != nil || parsed < 0 {
			return apperror.Validation("некорректный лимит")
		}
		limit = parsed
	}

	resp, err := h.service.GetMembers(r.Context(), claims.UserID, sharedDirID, limit)
	if err != nil {
		return err
	}

	if resp == nil {
		resp = []MemberResponse{}
	}

	return writeJSON(w, http.StatusOK, resp)
}

// Invite sends an invitation to a user for a shared directory.
// @Summary Invite user to shared directory
// @Tags sharing
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path string true "Shared Directory ID"
// @Param body body InviteRequest true "Username to invite"
// @Success 201 {object} InvitationResponse
// @Failure 400 {object} apperror.Response
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Failure 409 {object} apperror.Response
// @Router /api/v1/shared-directories/{id}/invitations [post]
func (h *Handler) Invite(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("неавторизован")
	}

	sharedDirID := chi.URLParam(r, "id")
	if sharedDirID == "" {
		return apperror.Validation("требуется идентификатор общей директории")
	}

	var req InviteRequest
	if err := decodeJSON(r, &req); err != nil {
		return err
	}
	if req.Username == "" {
		return apperror.Validation("требуется имя пользователя")
	}

	resp, err := h.service.Invite(r.Context(), claims.UserID, sharedDirID, req.Username)
	if err != nil {
		return err
	}

	return writeJSON(w, http.StatusCreated, resp)
}

// GetMyInvitations returns all pending invitations for the authenticated user.
// @Summary Get my invitations
// @Tags sharing
// @Security BearerAuth
// @Produce json
// @Success 200 {array} InvitationResponse
// @Failure 401 {object} apperror.Response
// @Router /api/v1/invitations [get]
func (h *Handler) GetMyInvitations(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("неавторизован")
	}

	resp, err := h.service.GetMyInvitations(r.Context(), claims.UserID)
	if err != nil {
		return err
	}

	if resp == nil {
		resp = []InvitationResponse{}
	}

	return writeJSON(w, http.StatusOK, resp)
}

// AcceptInvitation accepts a pending invitation.
// @Summary Accept invitation
// @Tags sharing
// @Security BearerAuth
// @Produce json
// @Param id path string true "Invitation ID"
// @Success 200 {object} map[string]string
// @Failure 400 {object} apperror.Response
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Failure 409 {object} apperror.Response
// @Router /api/v1/invitations/{id}/accept [post]
func (h *Handler) AcceptInvitation(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("неавторизован")
	}

	invitationID := chi.URLParam(r, "id")
	if invitationID == "" {
		return apperror.Validation("требуется идентификатор приглашения")
	}

	if err := h.service.AcceptInvitation(r.Context(), claims.UserID, invitationID); err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, map[string]string{"status": "accepted"})
}

// DeclineInvitation declines a pending invitation.
// @Summary Decline invitation
// @Tags sharing
// @Security BearerAuth
// @Produce json
// @Param id path string true "Invitation ID"
// @Success 200 {object} map[string]string
// @Failure 400 {object} apperror.Response
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Failure 409 {object} apperror.Response
// @Router /api/v1/invitations/{id}/decline [post]
func (h *Handler) DeclineInvitation(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("неавторизован")
	}

	invitationID := chi.URLParam(r, "id")
	if invitationID == "" {
		return apperror.Validation("требуется идентификатор приглашения")
	}

	if err := h.service.DeclineInvitation(r.Context(), claims.UserID, invitationID); err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, map[string]string{"status": "declined"})
}

// RemoveInvitation revokes/deletes an invitation.
// @Summary Remove/revoke invitation
// @Tags sharing
// @Security BearerAuth
// @Produce json
// @Param id path string true "Invitation ID"
// @Success 200 {object} map[string]string
// @Failure 400 {object} apperror.Response
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Router /api/v1/invitations/{id} [delete]
func (h *Handler) RemoveInvitation(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("неавторизован")
	}

	invitationID := chi.URLParam(r, "id")
	if invitationID == "" {
		return apperror.Validation("требуется идентификатор приглашения")
	}

	if err := h.service.RemoveInvitation(r.Context(), claims.UserID, invitationID); err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, map[string]string{"status": "revoked"})
}

// ChangeMemberRole changes the role of a member in a shared directory.
// @Summary Change member role
// @Tags sharing
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path string true "Shared Directory ID"
// @Param userId path string true "User ID"
// @Param body body ChangeRoleRequest true "New role"
// @Success 200 {object} MemberResponse
// @Failure 400 {object} apperror.Response
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Router /api/v1/shared-directories/{id}/members/{userId} [patch]
func (h *Handler) ChangeMemberRole(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("неавторизован")
	}

	sharedDirID := chi.URLParam(r, "id")
	if sharedDirID == "" {
		return apperror.Validation("требуется идентификатор общей директории")
	}

	targetUserID := chi.URLParam(r, "userId")
	if targetUserID == "" {
		return apperror.Validation("требуется идентификатор пользователя")
	}

	var req ChangeRoleRequest
	if err := decodeJSON(r, &req); err != nil {
		return err
	}
	if req.Role == "" {
		return apperror.Validation("требуется роль")
	}
	if req.Role != RoleViewer && req.Role != RoleEditor && req.Role != RoleAdmin {
		return apperror.Validation("недопустимая роль")
	}

	resp, err := h.service.ChangeRole(r.Context(), claims.UserID, sharedDirID, targetUserID, string(req.Role))
	if err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, resp)
}

// RemoveMember removes a member from a shared directory.
// @Summary Remove member
// @Tags sharing
// @Security BearerAuth
// @Produce json
// @Param id path string true "Shared Directory ID"
// @Param userId path string true "User ID"
// @Success 200 {object} map[string]string
// @Failure 400 {object} apperror.Response
// @Failure 401 {object} apperror.Response
// @Failure 403 {object} apperror.Response
// @Failure 404 {object} apperror.Response
// @Router /api/v1/shared-directories/{id}/members/{userId} [delete]
func (h *Handler) RemoveMember(w http.ResponseWriter, r *http.Request) error {
	claims, ok := auth.ClaimsFromCtx(r.Context())
	if !ok {
		return apperror.Unauthorized("неавторизован")
	}

	sharedDirID := chi.URLParam(r, "id")
	if sharedDirID == "" {
		return apperror.Validation("требуется идентификатор общей директории")
	}

	targetUserID := chi.URLParam(r, "userId")
	if targetUserID == "" {
		return apperror.Validation("требуется идентификатор пользователя")
	}

	if err := h.service.RemoveMember(r.Context(), claims.UserID, sharedDirID, targetUserID); err != nil {
		return err
	}

	return writeJSON(w, http.StatusOK, map[string]string{"status": "removed"})
}

func writeJSON(w http.ResponseWriter, status int, payload any) error {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	return json.NewEncoder(w).Encode(payload)
}

func decodeJSON(r *http.Request, v any) error {
	defer r.Body.Close()
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(v); err != nil {
		return apperror.Validation("неверный формат запроса")
	}
	return nil
}
