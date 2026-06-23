package sharing

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"sharedspace/internal/apperror"
	"sharedspace/internal/auth"
)

type mockService struct {
	getSharedWithMeFn func(string) ([]SharedDirectoryResponse, error)
	getMembersFn      func(string, string) ([]MemberResponse, error)
}

func (m *mockService) GetSharedWithMe(_ context.Context, userID string) ([]SharedDirectoryResponse, error) {
	if m.getSharedWithMeFn != nil {
		return m.getSharedWithMeFn(userID)
	}
	return nil, nil
}

func (m *mockService) GetMembers(_ context.Context, userID, sharedDirID string) ([]MemberResponse, error) {
	if m.getMembersFn != nil {
		return m.getMembersFn(userID, sharedDirID)
	}
	return nil, nil
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

func TestHandlerGetSharedWithMe(t *testing.T) {
	now := time.Now()

	t.Run("success", func(t *testing.T) {
		svc := &mockService{
			getSharedWithMeFn: func(userID string) ([]SharedDirectoryResponse, error) {
				return []SharedDirectoryResponse{
					{ID: "shared-1", DirectoryID: "dir-1", Name: "photos", OwnerID: "user-2", OwnerName: "ivan", Role: RoleAdmin, CreatedAt: now},
				}, nil
			},
		}
		handler := NewHandler(svc)

		req := httptest.NewRequest(http.MethodGet, "/api/v1/shared/with-me", nil)
		req = req.WithContext(withClaims(req.Context(), "user-1"))
		rec := httptest.NewRecorder()

		if err := handler.GetSharedWithMe(rec, req); err != nil {
			t.Fatalf("handler returned error: %v", err)
		}
		if rec.Code != http.StatusOK {
			t.Fatalf("unexpected status: %d", rec.Code)
		}
		var resp []SharedDirectoryResponse
		if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
			t.Fatalf("decode response: %v", err)
		}
		if len(resp) != 1 || resp[0].ID != "shared-1" || resp[0].Role != RoleAdmin {
			t.Fatalf("unexpected response: %+v", resp)
		}
	})

	t.Run("unauthorized", func(t *testing.T) {
		handler := NewHandler(&mockService{})
		req := httptest.NewRequest(http.MethodGet, "/api/v1/shared/with-me", nil)
		req = req.WithContext(withClaims(req.Context(), ""))
		rec := httptest.NewRecorder()

		err := handler.GetSharedWithMe(rec, req)
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
			getMembersFn: func(userID, sharedDirID string) ([]MemberResponse, error) {
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
