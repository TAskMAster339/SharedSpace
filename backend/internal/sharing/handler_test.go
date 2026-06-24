package sharing

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"sharedspace/internal/apperror"
	"sharedspace/internal/auth"
)

type mockService struct {
	getSharedWithMeFn      func(string) ([]SharedDirectoryResponse, error)
	getSharedWithMeStatsFn func(string) ([]SharedDirectoryWithStatsResponse, error)
	getMembersFn           func(string, string, int) ([]MemberResponse, error)
	inviteFn               func(string, string, string) (*InvitationResponse, error)
	getMyInvitationsFn     func(string) ([]InvitationResponse, error)
	acceptInvitationFn     func(string, string) error
	declineInvitationFn    func(string, string) error
	removeInvitationFn     func(string, string) error
}

func (m *mockService) GetSharedWithMe(_ context.Context, userID string) ([]SharedDirectoryResponse, error) {
	if m.getSharedWithMeFn != nil {
		return m.getSharedWithMeFn(userID)
	}
	return nil, nil
}

func (m *mockService) GetSharedWithMeStats(_ context.Context, userID string) ([]SharedDirectoryWithStatsResponse, error) {
	if m.getSharedWithMeStatsFn != nil {
		return m.getSharedWithMeStatsFn(userID)
	}
	return nil, nil
}

func (m *mockService) GetMembers(_ context.Context, userID, sharedDirID string, limit int) ([]MemberResponse, error) {
	if m.getMembersFn != nil {
		return m.getMembersFn(userID, sharedDirID, limit)
	}
	return nil, nil
}

func (m *mockService) Invite(_ context.Context, userID, sharedDirID, username string) (*InvitationResponse, error) {
	if m.inviteFn != nil {
		return m.inviteFn(userID, sharedDirID, username)
	}
	return nil, nil
}

func (m *mockService) GetMyInvitations(_ context.Context, userID string) ([]InvitationResponse, error) {
	if m.getMyInvitationsFn != nil {
		return m.getMyInvitationsFn(userID)
	}
	return nil, nil
}

func (m *mockService) AcceptInvitation(_ context.Context, userID, invitationID string) error {
	if m.acceptInvitationFn != nil {
		return m.acceptInvitationFn(userID, invitationID)
	}
	return nil
}

func (m *mockService) DeclineInvitation(_ context.Context, userID, invitationID string) error {
	if m.declineInvitationFn != nil {
		return m.declineInvitationFn(userID, invitationID)
	}
	return nil
}

func (m *mockService) RemoveInvitation(_ context.Context, userID, invitationID string) error {
	if m.removeInvitationFn != nil {
		return m.removeInvitationFn(userID, invitationID)
	}
	return nil
}

func withClaims(ctx context.Context, userID string) context.Context {
	if userID == "" {
		return ctx
	}
	return auth.SetClaims(ctx, &auth.Claims{UserID: userID, Email: "test@example.com"})
}

func withChiParams(ctx context.Context, params map[string]string) context.Context {
	rctx := chi.NewRouteContext()
	for k, v := range params {
		rctx.URLParams.Add(k, v)
	}
	return context.WithValue(ctx, chi.RouteCtxKey, rctx)
}

func TestHandlerInvite(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		svc := &mockService{
			inviteFn: func(userID, sharedDirID, username string) (*InvitationResponse, error) {
				return &InvitationResponse{
					ID: "inv-1", SharedDirectoryID: sharedDirID, DirectoryName: "photos",
					InvitedByUserID: userID, InvitedByUsername: "alice",
					Role: RoleViewer, Status: InvitationPending,
				}, nil
			},
		}
		handler := NewHandler(svc)

		req := httptest.NewRequest(http.MethodPost, "/api/v1/shared-directories/shared-1/invitations", nil)
		req.Body = io.NopCloser(bytes.NewReader([]byte(`{"username":"bob"}`)))
		req = req.WithContext(withChiParams(withClaims(req.Context(), "user-1"), map[string]string{"id": "shared-1"}))
		rec := httptest.NewRecorder()

		if err := handler.Invite(rec, req); err != nil {
			t.Fatalf("handler returned error: %v", err)
		}
		if rec.Code != http.StatusCreated {
			t.Fatalf("unexpected status: %d", rec.Code)
		}
		var resp InvitationResponse
		if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
			t.Fatalf("decode response: %v", err)
		}
		if resp.Role != RoleViewer || resp.Status != InvitationPending {
			t.Fatalf("unexpected response: %+v", resp)
		}
	})

	t.Run("missing id", func(t *testing.T) {
		handler := NewHandler(&mockService{})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/shared-directories//invitations", nil)
		req.Body = io.NopCloser(bytes.NewReader([]byte(`{"username":"bob"}`)))
		req = req.WithContext(withClaims(req.Context(), "user-1"))
		rec := httptest.NewRecorder()

		err := handler.Invite(rec, req)
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeValidation {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("missing username", func(t *testing.T) {
		handler := NewHandler(&mockService{})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/shared-directories/shared-1/invitations", nil)
		req.Body = io.NopCloser(bytes.NewReader([]byte(`{}`)))
		req = req.WithContext(withChiParams(withClaims(req.Context(), "user-1"), map[string]string{"id": "shared-1"}))
		rec := httptest.NewRecorder()

		err := handler.Invite(rec, req)
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeValidation {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("unauthorized", func(t *testing.T) {
		handler := NewHandler(&mockService{})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/shared-directories/shared-1/invitations", nil)
		req.Body = io.NopCloser(bytes.NewReader([]byte(`{"username":"bob"}`)))
		req = req.WithContext(withClaims(req.Context(), ""))
		rec := httptest.NewRecorder()

		err := handler.Invite(rec, req)
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeUnauthorized {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestHandlerGetMyInvitations(t *testing.T) {
	now := time.Now()

	t.Run("success", func(t *testing.T) {
		svc := &mockService{
			getMyInvitationsFn: func(userID string) ([]InvitationResponse, error) {
				return []InvitationResponse{
					{ID: "inv-1", SharedDirectoryID: "shared-1", DirectoryName: "photos",
						InvitedByUserID: "user-2", InvitedByUsername: "ivan",
						Role: RoleViewer, Status: InvitationPending, CreatedAt: now},
				}, nil
			},
		}
		handler := NewHandler(svc)

		req := httptest.NewRequest(http.MethodGet, "/api/v1/invitations", nil)
		req = req.WithContext(withClaims(req.Context(), "user-1"))
		rec := httptest.NewRecorder()

		if err := handler.GetMyInvitations(rec, req); err != nil {
			t.Fatalf("handler returned error: %v", err)
		}
		if rec.Code != http.StatusOK {
			t.Fatalf("unexpected status: %d", rec.Code)
		}
		var resp []InvitationResponse
		if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
			t.Fatalf("decode response: %v", err)
		}
		if len(resp) != 1 || resp[0].ID != "inv-1" || resp[0].Role != RoleViewer {
			t.Fatalf("unexpected response: %+v", resp)
		}
	})

	t.Run("unauthorized", func(t *testing.T) {
		handler := NewHandler(&mockService{})
		req := httptest.NewRequest(http.MethodGet, "/api/v1/invitations", nil)
		req = req.WithContext(withClaims(req.Context(), ""))
		rec := httptest.NewRecorder()

		err := handler.GetMyInvitations(rec, req)
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeUnauthorized {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestHandlerAcceptInvitation(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		svc := &mockService{
			acceptInvitationFn: func(userID, invitationID string) error {
				return nil
			},
		}
		handler := NewHandler(svc)

		req := httptest.NewRequest(http.MethodPost, "/api/v1/invitations/inv-1/accept", nil)
		req = req.WithContext(withChiParams(withClaims(req.Context(), "user-1"), map[string]string{"id": "inv-1"}))
		rec := httptest.NewRecorder()

		if err := handler.AcceptInvitation(rec, req); err != nil {
			t.Fatalf("handler returned error: %v", err)
		}
		if rec.Code != http.StatusOK {
			t.Fatalf("unexpected status: %d", rec.Code)
		}
	})

	t.Run("missing id", func(t *testing.T) {
		handler := NewHandler(&mockService{})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/invitations//accept", nil)
		req = req.WithContext(withClaims(req.Context(), "user-1"))
		rec := httptest.NewRecorder()

		err := handler.AcceptInvitation(rec, req)
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeValidation {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("unauthorized", func(t *testing.T) {
		handler := NewHandler(&mockService{})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/invitations/inv-1/accept", nil)
		req = req.WithContext(withClaims(req.Context(), ""))
		rec := httptest.NewRecorder()

		err := handler.AcceptInvitation(rec, req)
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeUnauthorized {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestHandlerDeclineInvitation(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		svc := &mockService{
			declineInvitationFn: func(userID, invitationID string) error {
				return nil
			},
		}
		handler := NewHandler(svc)

		req := httptest.NewRequest(http.MethodPost, "/api/v1/invitations/inv-1/decline", nil)
		req = req.WithContext(withChiParams(withClaims(req.Context(), "user-1"), map[string]string{"id": "inv-1"}))
		rec := httptest.NewRecorder()

		if err := handler.DeclineInvitation(rec, req); err != nil {
			t.Fatalf("handler returned error: %v", err)
		}
		if rec.Code != http.StatusOK {
			t.Fatalf("unexpected status: %d", rec.Code)
		}
	})

	t.Run("unauthorized", func(t *testing.T) {
		handler := NewHandler(&mockService{})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/invitations/inv-1/decline", nil)
		req = req.WithContext(withClaims(req.Context(), ""))
		rec := httptest.NewRecorder()

		err := handler.DeclineInvitation(rec, req)
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeUnauthorized {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestHandlerRemoveInvitation(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		svc := &mockService{
			removeInvitationFn: func(userID, invitationID string) error {
				return nil
			},
		}
		handler := NewHandler(svc)

		req := httptest.NewRequest(http.MethodDelete, "/api/v1/invitations/inv-1", nil)
		req = req.WithContext(withChiParams(withClaims(req.Context(), "user-1"), map[string]string{"id": "inv-1"}))
		rec := httptest.NewRecorder()

		if err := handler.RemoveInvitation(rec, req); err != nil {
			t.Fatalf("handler returned error: %v", err)
		}
		if rec.Code != http.StatusOK {
			t.Fatalf("unexpected status: %d", rec.Code)
		}
	})

	t.Run("missing id", func(t *testing.T) {
		handler := NewHandler(&mockService{})
		req := httptest.NewRequest(http.MethodDelete, "/api/v1/invitations/", nil)
		req = req.WithContext(withClaims(req.Context(), "user-1"))
		rec := httptest.NewRecorder()

		err := handler.RemoveInvitation(rec, req)
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeValidation {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("unauthorized", func(t *testing.T) {
		handler := NewHandler(&mockService{})
		req := httptest.NewRequest(http.MethodDelete, "/api/v1/invitations/inv-1", nil)
		req = req.WithContext(withClaims(req.Context(), ""))
		rec := httptest.NewRecorder()

		err := handler.RemoveInvitation(rec, req)
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeUnauthorized {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestHandlerGetMembers(t *testing.T) {
	now := time.Now()

	t.Run("success", func(t *testing.T) {
		svc := &mockService{
			getMembersFn: func(userID, sharedDirID string, _ int) ([]MemberResponse, error) {
				return []MemberResponse{
					{ID: "mem-1", UserID: "user-1", Username: "alice", Role: RoleAdmin, JoinedAt: now},
					{ID: "mem-2", UserID: "user-2", Username: "bob", Role: RoleViewer, JoinedAt: now},
				}, nil
			},
		}
		handler := NewHandler(svc)

		req := httptest.NewRequest(http.MethodGet, "/api/v1/shared-directories/shared-1/members", nil)
		req = req.WithContext(withChiParams(withClaims(req.Context(), "user-1"), map[string]string{"id": "shared-1"}))
		rec := httptest.NewRecorder()

		if err := handler.GetMembers(rec, req); err != nil {
			t.Fatalf("handler returned error: %v", err)
		}
		if rec.Code != http.StatusOK {
			t.Fatalf("unexpected status: %d", rec.Code)
		}
		var resp []MemberResponse
		if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
			t.Fatalf("decode response: %v", err)
		}
		if len(resp) != 2 || resp[0].Role != RoleAdmin || resp[1].Role != RoleViewer {
			t.Fatalf("unexpected response: %+v", resp)
		}
	})

	t.Run("missing id", func(t *testing.T) {
		handler := NewHandler(&mockService{})
		req := httptest.NewRequest(http.MethodGet, "/api/v1/shared-directories//members", nil)
		req = req.WithContext(withClaims(req.Context(), "user-1"))
		rec := httptest.NewRecorder()

		err := handler.GetMembers(rec, req)
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeValidation {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("unauthorized", func(t *testing.T) {
		handler := NewHandler(&mockService{})
		req := httptest.NewRequest(http.MethodGet, "/api/v1/shared-directories/shared-1/members", nil)
		req = req.WithContext(withClaims(req.Context(), ""))
		rec := httptest.NewRecorder()

		err := handler.GetMembers(rec, req)
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeUnauthorized {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}
