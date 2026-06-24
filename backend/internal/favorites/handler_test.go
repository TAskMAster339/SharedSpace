package favorites

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
	addFn    func(string, string) error
	removeFn func(string, string) error
	listFn   func(string, int) (FavoritesListResponse, error)
}

func (m *mockService) Add(_ context.Context, userID, fileID string) error {
	if m.addFn != nil {
		return m.addFn(userID, fileID)
	}
	return nil
}

func (m *mockService) Remove(_ context.Context, userID, fileID string) error {
	if m.removeFn != nil {
		return m.removeFn(userID, fileID)
	}
	return nil
}

func (m *mockService) List(_ context.Context, userID string, limit int) (FavoritesListResponse, error) {
	if m.listFn != nil {
		return m.listFn(userID, limit)
	}
	return FavoritesListResponse{}, nil
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

func TestHandlerAdd(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		var capturedUserID, capturedFileID string
		svc := &mockService{
			addFn: func(userID, fileID string) error {
				capturedUserID = userID
				capturedFileID = fileID
				return nil
			},
		}
		handler := NewHandler(svc)

		req := httptest.NewRequest(http.MethodPost, "/api/v1/files/file-1/favorite", nil)
		req = req.WithContext(withChiParams(withClaims(req.Context(), "user-1"), map[string]string{"id": "file-1"}))
		rec := httptest.NewRecorder()

		if err := handler.Add(rec, req); err != nil {
			t.Fatalf("handler returned error: %v", err)
		}
		if rec.Code != http.StatusCreated {
			t.Fatalf("unexpected status: %d", rec.Code)
		}

		var body map[string]string
		if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
			t.Fatalf("decode response: %v", err)
		}
		if body["message"] == "" {
			t.Fatal("expected message in response")
		}
		if capturedUserID != "user-1" || capturedFileID != "file-1" {
			t.Fatalf("unexpected service args: user=%q file=%q", capturedUserID, capturedFileID)
		}
	})

	t.Run("unauthorized", func(t *testing.T) {
		handler := NewHandler(&mockService{})

		req := httptest.NewRequest(http.MethodPost, "/api/v1/files/file-1/favorite", nil)
		req = req.WithContext(withClaims(req.Context(), ""))
		rec := httptest.NewRecorder()

		err := handler.Add(rec, req)
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeUnauthorized {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("missing file id", func(t *testing.T) {
		handler := NewHandler(&mockService{})

		req := httptest.NewRequest(http.MethodPost, "/api/v1/files//favorite", nil)
		req = req.WithContext(withClaims(req.Context(), "user-1"))
		rec := httptest.NewRecorder()

		err := handler.Add(rec, req)
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeValidation {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("service error", func(t *testing.T) {
		svc := &mockService{
			addFn: func(_, _ string) error {
				return apperror.NotFound("файл не найден")
			},
		}
		handler := NewHandler(svc)

		req := httptest.NewRequest(http.MethodPost, "/api/v1/files/file-1/favorite", nil)
		req = req.WithContext(withChiParams(withClaims(req.Context(), "user-1"), map[string]string{"id": "file-1"}))
		rec := httptest.NewRecorder()

		err := handler.Add(rec, req)
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeNotFound {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestHandlerRemove(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		var capturedUserID, capturedFileID string
		svc := &mockService{
			removeFn: func(userID, fileID string) error {
				capturedUserID = userID
				capturedFileID = fileID
				return nil
			},
		}
		handler := NewHandler(svc)

		req := httptest.NewRequest(http.MethodDelete, "/api/v1/files/file-1/favorite", nil)
		req = req.WithContext(withChiParams(withClaims(req.Context(), "user-1"), map[string]string{"id": "file-1"}))
		rec := httptest.NewRecorder()

		if err := handler.Remove(rec, req); err != nil {
			t.Fatalf("handler returned error: %v", err)
		}
		if rec.Code != http.StatusOK {
			t.Fatalf("unexpected status: %d", rec.Code)
		}

		var body map[string]string
		if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
			t.Fatalf("decode response: %v", err)
		}
		if body["message"] == "" {
			t.Fatal("expected message in response")
		}
		if capturedUserID != "user-1" || capturedFileID != "file-1" {
			t.Fatalf("unexpected service args: user=%q file=%q", capturedUserID, capturedFileID)
		}
	})

	t.Run("unauthorized", func(t *testing.T) {
		handler := NewHandler(&mockService{})

		req := httptest.NewRequest(http.MethodDelete, "/api/v1/files/file-1/favorite", nil)
		req = req.WithContext(withClaims(req.Context(), ""))
		rec := httptest.NewRecorder()

		err := handler.Remove(rec, req)
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeUnauthorized {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("missing file id", func(t *testing.T) {
		handler := NewHandler(&mockService{})

		req := httptest.NewRequest(http.MethodDelete, "/api/v1/files//favorite", nil)
		req = req.WithContext(withClaims(req.Context(), "user-1"))
		rec := httptest.NewRecorder()

		err := handler.Remove(rec, req)
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeValidation {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestHandlerList(t *testing.T) {
	now := time.Now()

	t.Run("success", func(t *testing.T) {
		svc := &mockService{
			listFn: func(userID string, limit int) (FavoritesListResponse, error) {
				return FavoritesListResponse{
					Favorites: []FavoriteFileResponse{
						{ID: "f-1", Filename: "doc.txt", Extension: "txt", MimeType: "text/plain", Size: 100, DirectoryID: "d-1", OwnerID: "user-1", CreatedAt: now, UpdatedAt: now, FavoritedAt: now},
					},
				}, nil
			},
		}
		handler := NewHandler(svc)

		req := httptest.NewRequest(http.MethodGet, "/api/v1/files/favorites", nil)
		req = req.WithContext(withClaims(req.Context(), "user-1"))
		rec := httptest.NewRecorder()

		if err := handler.List(rec, req); err != nil {
			t.Fatalf("handler returned error: %v", err)
		}
		if rec.Code != http.StatusOK {
			t.Fatalf("unexpected status: %d", rec.Code)
		}

		var resp FavoritesListResponse
		if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
			t.Fatalf("decode response: %v", err)
		}
		if len(resp.Favorites) != 1 || resp.Favorites[0].Filename != "doc.txt" {
			t.Fatalf("unexpected response: %+v", resp)
		}
	})

	t.Run("empty result", func(t *testing.T) {
		svc := &mockService{
			listFn: func(_ string, _ int) (FavoritesListResponse, error) {
				return FavoritesListResponse{Favorites: []FavoriteFileResponse{}}, nil
			},
		}
		handler := NewHandler(svc)

		req := httptest.NewRequest(http.MethodGet, "/api/v1/files/favorites", nil)
		req = req.WithContext(withClaims(req.Context(), "user-1"))
		rec := httptest.NewRecorder()

		if err := handler.List(rec, req); err != nil {
			t.Fatalf("handler returned error: %v", err)
		}
		if rec.Code != http.StatusOK {
			t.Fatalf("unexpected status: %d", rec.Code)
		}

		var resp FavoritesListResponse
		if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
			t.Fatalf("decode response: %v", err)
		}
		if len(resp.Favorites) != 0 {
			t.Fatalf("expected empty favorites, got %d", len(resp.Favorites))
		}
	})

	t.Run("unauthorized", func(t *testing.T) {
		handler := NewHandler(&mockService{})

		req := httptest.NewRequest(http.MethodGet, "/api/v1/files/favorites", nil)
		req = req.WithContext(withClaims(req.Context(), ""))
		rec := httptest.NewRecorder()

		err := handler.List(rec, req)
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeUnauthorized {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}
