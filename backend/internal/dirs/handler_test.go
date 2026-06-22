package dirs

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"sharedspace/internal/apperror"
	"sharedspace/internal/auth"
)

type mockService struct {
	getRootContentsFn func(string) (DirectoryContentsResponse, error)
	getContentsFn     func(string, string) (DirectoryContentsResponse, error)
	getByIDFn         func(string, string) (DirectoryResponse, error)
	createFn          func(string, CreateDirectoryRequest) (DirectoryResponse, error)
	updateFn          func(string, string, UpdateDirectoryRequest) (DirectoryResponse, error)

	getRootUserID string
	getContentsID string
	getByIDArg    string
	createUserID  string
	createReq     CreateDirectoryRequest
	updateUserID  string
	updateDirID   string
	updateReq     UpdateDirectoryRequest
}

func (m *mockService) GetRootContents(_ context.Context, userID string) (DirectoryContentsResponse, error) {
	m.getRootUserID = userID
	if m.getRootContentsFn != nil {
		return m.getRootContentsFn(userID)
	}
	return DirectoryContentsResponse{}, nil
}

func (m *mockService) GetContents(_ context.Context, userID, dirID string) (DirectoryContentsResponse, error) {
	m.getContentsID = dirID
	if m.getContentsFn != nil {
		return m.getContentsFn(userID, dirID)
	}
	return DirectoryContentsResponse{}, nil
}

func (m *mockService) GetByID(_ context.Context, userID, dirID string) (DirectoryResponse, error) {
	m.getByIDArg = dirID
	if m.getByIDFn != nil {
		return m.getByIDFn(userID, dirID)
	}
	return DirectoryResponse{}, nil
}

func (m *mockService) Create(_ context.Context, userID string, req CreateDirectoryRequest) (DirectoryResponse, error) {
	m.createUserID = userID
	m.createReq = req
	if m.createFn != nil {
		return m.createFn(userID, req)
	}
	return DirectoryResponse{}, nil
}

func (m *mockService) Update(_ context.Context, userID, dirID string, req UpdateDirectoryRequest) (DirectoryResponse, error) {
	m.updateUserID = userID
	m.updateDirID = dirID
	m.updateReq = req
	if m.updateFn != nil {
		return m.updateFn(userID, dirID, req)
	}
	return DirectoryResponse{}, nil
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

func TestHandlerGetRootContents(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		svc := &mockService{
			getRootContentsFn: func(userID string) (DirectoryContentsResponse, error) {
				return DirectoryContentsResponse{ID: "root-1", Name: "ivan"}, nil
			},
		}
		handler := NewHandler(svc)

		req := httptest.NewRequest(http.MethodGet, "/api/v1/directories/root/contents", nil)
		req = req.WithContext(withClaims(req.Context(), "user-1"))
		rec := httptest.NewRecorder()

		if err := handler.GetRootContents(rec, req); err != nil {
			t.Fatalf("handler returned error: %v", err)
		}
		if rec.Code != http.StatusOK {
			t.Fatalf("unexpected status: %d", rec.Code)
		}
		var resp DirectoryContentsResponse
		if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
			t.Fatalf("decode response: %v", err)
		}
		if resp.ID != "root-1" || resp.Name != "ivan" {
			t.Fatalf("unexpected response: %+v", resp)
		}
	})

	t.Run("unauthorized", func(t *testing.T) {
		handler := NewHandler(&mockService{})
		req := httptest.NewRequest(http.MethodGet, "/api/v1/directories/root/contents", nil)
		req = req.WithContext(withClaims(req.Context(), ""))
		rec := httptest.NewRecorder()

		err := handler.GetRootContents(rec, req)
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeUnauthorized {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestHandlerGetContents(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		svc := &mockService{
			getContentsFn: func(userID, dirID string) (DirectoryContentsResponse, error) {
				return DirectoryContentsResponse{ID: dirID, Name: "photos"}, nil
			},
		}
		handler := NewHandler(svc)

		req := httptest.NewRequest(http.MethodGet, "/api/v1/directories/dir-1/contents", nil)
		req = req.WithContext(withChiParams(withClaims(req.Context(), "user-1"), map[string]string{"id": "dir-1"}))
		rec := httptest.NewRecorder()

		if err := handler.GetContents(rec, req); err != nil {
			t.Fatalf("handler returned error: %v", err)
		}
		if rec.Code != http.StatusOK {
			t.Fatalf("unexpected status: %d", rec.Code)
		}
		var resp DirectoryContentsResponse
		if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
			t.Fatalf("decode response: %v", err)
		}
		if resp.ID != "dir-1" {
			t.Fatalf("unexpected id: %q", resp.ID)
		}
	})

	t.Run("missing id", func(t *testing.T) {
		handler := NewHandler(&mockService{})
		req := httptest.NewRequest(http.MethodGet, "/api/v1/directories//contents", nil)
		req = req.WithContext(withClaims(req.Context(), "user-1"))
		rec := httptest.NewRecorder()

		err := handler.GetContents(rec, req)
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeValidation {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestHandlerGetByID(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		svc := &mockService{
			getByIDFn: func(userID, dirID string) (DirectoryResponse, error) {
				return DirectoryResponse{ID: dirID, Name: "photos", OwnerID: userID}, nil
			},
		}
		handler := NewHandler(svc)

		req := httptest.NewRequest(http.MethodGet, "/api/v1/directories/dir-1", nil)
		req = req.WithContext(withChiParams(withClaims(req.Context(), "user-1"), map[string]string{"id": "dir-1"}))
		rec := httptest.NewRecorder()

		if err := handler.GetByID(rec, req); err != nil {
			t.Fatalf("handler returned error: %v", err)
		}
		if rec.Code != http.StatusOK {
			t.Fatalf("unexpected status: %d", rec.Code)
		}
		var resp DirectoryResponse
		if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
			t.Fatalf("decode response: %v", err)
		}
		if resp.ID != "dir-1" || resp.Name != "photos" {
			t.Fatalf("unexpected response: %+v", resp)
		}
	})

	t.Run("missing id", func(t *testing.T) {
		handler := NewHandler(&mockService{})
		req := httptest.NewRequest(http.MethodGet, "/api/v1/directories/", nil)
		req = req.WithContext(withClaims(req.Context(), "user-1"))
		rec := httptest.NewRecorder()

		err := handler.GetByID(rec, req)
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeValidation {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestHandlerCreate(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		svc := &mockService{
			createFn: func(userID string, req CreateDirectoryRequest) (DirectoryResponse, error) {
				return DirectoryResponse{ID: "new-1", Name: req.Name, OwnerID: userID}, nil
			},
		}
		handler := NewHandler(svc)

		body := bytes.NewBufferString(`{"name":"newdir","parent_id":"parent-1"}`)
		req := httptest.NewRequest(http.MethodPost, "/api/v1/directories", body)
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(withClaims(req.Context(), "user-1"))
		rec := httptest.NewRecorder()

		if err := handler.Create(rec, req); err != nil {
			t.Fatalf("handler returned error: %v", err)
		}
		if rec.Code != http.StatusCreated {
			t.Fatalf("unexpected status: %d", rec.Code)
		}
		if svc.createUserID != "user-1" || svc.createReq.Name != "newdir" || svc.createReq.ParentID != "parent-1" {
			t.Fatalf("unexpected request captured: %+v", svc.createReq)
		}
	})

	t.Run("invalid JSON", func(t *testing.T) {
		handler := NewHandler(&mockService{})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/directories", bytes.NewBufferString(`{invalid}`))
		req = req.WithContext(withClaims(req.Context(), "user-1"))
		rec := httptest.NewRecorder()

		err := handler.Create(rec, req)
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeValidation {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestHandlerUpdate(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		svc := &mockService{
			updateFn: func(userID, dirID string, req UpdateDirectoryRequest) (DirectoryResponse, error) {
				return DirectoryResponse{ID: dirID, Name: *req.Name, OwnerID: userID}, nil
			},
		}
		handler := NewHandler(svc)

		body := bytes.NewBufferString(`{"name":"newname"}`)
		req := httptest.NewRequest(http.MethodPatch, "/api/v1/directories/dir-1", body)
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(withChiParams(withClaims(req.Context(), "user-1"), map[string]string{"id": "dir-1"}))
		rec := httptest.NewRecorder()

		if err := handler.Update(rec, req); err != nil {
			t.Fatalf("handler returned error: %v", err)
		}
		if rec.Code != http.StatusOK {
			t.Fatalf("unexpected status: %d", rec.Code)
		}
		if svc.updateUserID != "user-1" || svc.updateDirID != "dir-1" || svc.updateReq.Name == nil || *svc.updateReq.Name != "newname" {
			t.Fatalf("unexpected request captured: %+v", svc.updateReq)
		}
	})

	t.Run("missing id", func(t *testing.T) {
		handler := NewHandler(&mockService{})
		req := httptest.NewRequest(http.MethodPatch, "/api/v1/directories/", bytes.NewBufferString(`{"name":"newname"}`))
		req = req.WithContext(withClaims(req.Context(), "user-1"))
		rec := httptest.NewRecorder()

		err := handler.Update(rec, req)
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeValidation {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("invalid JSON", func(t *testing.T) {
		handler := NewHandler(&mockService{})
		req := httptest.NewRequest(http.MethodPatch, "/api/v1/directories/dir-1", bytes.NewBufferString(`{invalid}`))
		req.Header.Set("Content-Type", "application/json")
		req = req.WithContext(withClaims(req.Context(), "user-1"))
		rec := httptest.NewRecorder()

		err := handler.Update(rec, req)
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeValidation {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}
