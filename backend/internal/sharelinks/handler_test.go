package sharelinks

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"sharedspace/internal/apperror"
	"sharedspace/internal/auth"
)

type mockService struct {
	createFn     func(string, string, CreateShareLinkRequest) (ShareLinkResponse, error)
	createDirFn  func(string, string, CreateShareLinkRequest) (ShareLinkResponse, error)
	listByFileFn func(string, string, int) ([]ShareLinkResponse, error)
	listByDirFn  func(string, string, int) ([]ShareLinkResponse, error)
	updateFn     func(string, string, UpdateShareLinkRequest) (ShareLinkResponse, error)
	deleteFn     func(string, string) error
	resolveFn    func(string, string, bool) (FileContentResponse, error)
	resolveDirFn func(string, string, bool, ResolveDirectoryParams) (DirectoryContentResponse, error)
}

func (m *mockService) Create(_ context.Context, userID, fileID string, req CreateShareLinkRequest) (ShareLinkResponse, error) {
	if m.createFn != nil {
		return m.createFn(userID, fileID, req)
	}
	return ShareLinkResponse{}, nil
}

func (m *mockService) CreateForDirectory(_ context.Context, userID, dirID string, req CreateShareLinkRequest) (ShareLinkResponse, error) {
	if m.createDirFn != nil {
		return m.createDirFn(userID, dirID, req)
	}
	return ShareLinkResponse{}, nil
}

func (m *mockService) ListByFile(_ context.Context, userID, fileID string, limit int) ([]ShareLinkResponse, error) {
	if m.listByFileFn != nil {
		return m.listByFileFn(userID, fileID, limit)
	}
	return nil, nil
}

func (m *mockService) ListByDirectory(_ context.Context, userID, dirID string, limit int) ([]ShareLinkResponse, error) {
	if m.listByDirFn != nil {
		return m.listByDirFn(userID, dirID, limit)
	}
	return nil, nil
}

func (m *mockService) Update(_ context.Context, userID, linkID string, req UpdateShareLinkRequest) (ShareLinkResponse, error) {
	if m.updateFn != nil {
		return m.updateFn(userID, linkID, req)
	}
	return ShareLinkResponse{}, nil
}

func (m *mockService) Delete(_ context.Context, userID, linkID string) error {
	if m.deleteFn != nil {
		return m.deleteFn(userID, linkID)
	}
	return nil
}

func (m *mockService) Resolve(_ context.Context, token, password string, authenticated bool) (FileContentResponse, error) {
	if m.resolveFn != nil {
		return m.resolveFn(token, password, authenticated)
	}
	return FileContentResponse{}, nil
}

func (m *mockService) ResolveDirectory(_ context.Context, token, password string, authenticated bool, params ResolveDirectoryParams) (DirectoryContentResponse, error) {
	if m.resolveDirFn != nil {
		return m.resolveDirFn(token, password, authenticated, params)
	}
	return DirectoryContentResponse{}, nil
}

type mockTokenParser struct {
	parseFn func(string) (*auth.Claims, error)
}

func (m *mockTokenParser) ParseAccessToken(raw string) (*auth.Claims, error) {
	if m.parseFn != nil {
		return m.parseFn(raw)
	}
	return &auth.Claims{UserID: "user-1"}, nil
}

func withChiCtx(r *http.Request, params map[string]string) *http.Request {
	ctx := chi.NewRouteContext()
	for k, v := range params {
		ctx.URLParams.Add(k, v)
	}
	return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, ctx))
}

func withBearerAuth(r *http.Request) *http.Request {
	r.Header.Set("Authorization", "Bearer valid-token")
	return r
}

func newTestHandler(svc ServiceInterface) *Handler {
	return NewHandler(svc, &mockTokenParser{})
}

// --- Create ---

func TestHandlerCreate_Success(t *testing.T) {
	svc := &mockService{
		createFn: func(userID, fileID string, req CreateShareLinkRequest) (ShareLinkResponse, error) {
			if userID != "user-1" || fileID != "file-1" {
				t.Fatalf("unexpected args: user=%s file=%s", userID, fileID)
			}
			return ShareLinkResponse{ID: "link-1", Token: "tok-1", AccessType: "public", HasPassword: false}, nil
		},
	}
	handler := newTestHandler(svc)

	body := `{"access_type":"public"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/files/file-1/share-links", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = withBearerAuth(req)
	req = withChiCtx(req, map[string]string{"id": "file-1"})
	rec := httptest.NewRecorder()

	if err := handler.Create(rec, req); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", rec.Code)
	}

	var resp ShareLinkResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Token != "tok-1" {
		t.Fatalf("unexpected token: %s", resp.Token)
	}
}

func TestHandlerCreate_Unauthorized(t *testing.T) {
	handler := newTestHandler(&mockService{})

	req := httptest.NewRequest(http.MethodPost, "/api/v1/files/file-1/share-links", strings.NewReader(`{"access_type":"public"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	err := handler.Create(rec, req)
	if err == nil {
		t.Fatal("expected error")
	}
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeUnauthorized {
		t.Fatalf("expected unauthorized, got %v", err)
	}
}

func TestHandlerCreate_InvalidJSON(t *testing.T) {
	handler := newTestHandler(&mockService{})

	req := httptest.NewRequest(http.MethodPost, "/api/v1/files/file-1/share-links", strings.NewReader(`not json`))
	req.Header.Set("Content-Type", "application/json")
	req = withBearerAuth(req)
	req = withChiCtx(req, map[string]string{"id": "file-1"})
	rec := httptest.NewRecorder()

	err := handler.Create(rec, req)
	if err == nil {
		t.Fatal("expected error")
	}
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeValidation {
		t.Fatalf("expected validation, got %v", err)
	}
}

// --- ListByFile ---

func TestHandlerListByFile_Success(t *testing.T) {
	svc := &mockService{
		listByFileFn: func(userID, fileID string, limit int) ([]ShareLinkResponse, error) {
			if fileID != "file-1" {
				t.Fatalf("unexpected fileID: %s", fileID)
			}
			if limit != 0 {
				t.Fatalf("expected limit=0, got %d", limit)
			}
			return []ShareLinkResponse{{ID: "link-1", Token: "tok-1"}}, nil
		},
	}
	handler := newTestHandler(svc)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/files/file-1/share-links", nil)
	req = withBearerAuth(req)
	req = withChiCtx(req, map[string]string{"id": "file-1"})
	rec := httptest.NewRecorder()

	if err := handler.ListByFile(rec, req); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var resp []ShareLinkResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp) != 1 {
		t.Fatalf("expected 1 link, got %d", len(resp))
	}
}

func TestHandlerListByFile_WithLimit(t *testing.T) {
	svc := &mockService{
		listByFileFn: func(userID, fileID string, limit int) ([]ShareLinkResponse, error) {
			if limit != 5 {
				t.Fatalf("expected limit=5, got %d", limit)
			}
			return []ShareLinkResponse{{ID: "link-1"}}, nil
		},
	}
	handler := newTestHandler(svc)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/files/file-1/share-links?limit=5", nil)
	req = withBearerAuth(req)
	req = withChiCtx(req, map[string]string{"id": "file-1"})
	rec := httptest.NewRecorder()

	if err := handler.ListByFile(rec, req); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestHandlerListByFile_Unauthorized(t *testing.T) {
	handler := newTestHandler(&mockService{})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/files/file-1/share-links", nil)
	rec := httptest.NewRecorder()

	err := handler.ListByFile(rec, req)
	if err == nil {
		t.Fatal("expected error")
	}
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeUnauthorized {
		t.Fatalf("expected unauthorized, got %v", err)
	}
}

func TestHandlerListByFile_InvalidLimit(t *testing.T) {
	handler := newTestHandler(&mockService{})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/files/file-1/share-links?limit=-1", nil)
	req = withBearerAuth(req)
	req = withChiCtx(req, map[string]string{"id": "file-1"})
	rec := httptest.NewRecorder()

	err := handler.ListByFile(rec, req)
	if err == nil {
		t.Fatal("expected error")
	}
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeValidation {
		t.Fatalf("expected validation, got %v", err)
	}
}

// --- Update ---

func TestHandlerUpdate_Success(t *testing.T) {
	svc := &mockService{
		updateFn: func(userID, linkID string, req UpdateShareLinkRequest) (ShareLinkResponse, error) {
			if userID != "user-1" || linkID != "link-1" {
				t.Fatalf("unexpected args: user=%s link=%s", userID, linkID)
			}
			return ShareLinkResponse{ID: "link-1", AccessType: "authenticated"}, nil
		},
	}
	handler := newTestHandler(svc)

	body := `{"access_type":"authenticated"}`
	req := httptest.NewRequest(http.MethodPatch, "/api/v1/share-links/link-1", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = withBearerAuth(req)
	req = withChiCtx(req, map[string]string{"id": "link-1"})
	rec := httptest.NewRecorder()

	if err := handler.Update(rec, req); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var resp ShareLinkResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.AccessType != "authenticated" {
		t.Fatalf("unexpected access_type: %s", resp.AccessType)
	}
}

func TestHandlerUpdate_Unauthorized(t *testing.T) {
	handler := newTestHandler(&mockService{})

	req := httptest.NewRequest(http.MethodPatch, "/api/v1/share-links/link-1", strings.NewReader(`{"access_type":"authenticated"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	err := handler.Update(rec, req)
	if err == nil {
		t.Fatal("expected error")
	}
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeUnauthorized {
		t.Fatalf("expected unauthorized, got %v", err)
	}
}

// --- Delete ---

func TestHandlerDelete_Success(t *testing.T) {
	deleted := false
	svc := &mockService{
		deleteFn: func(userID, linkID string) error {
			deleted = true
			return nil
		},
	}
	handler := newTestHandler(svc)

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/share-links/link-1", nil)
	req = withBearerAuth(req)
	req = withChiCtx(req, map[string]string{"id": "link-1"})
	rec := httptest.NewRecorder()

	if err := handler.Delete(rec, req); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if !deleted {
		t.Fatal("expected service.Delete to be called")
	}
}

func TestHandlerDelete_Unauthorized(t *testing.T) {
	handler := newTestHandler(&mockService{})

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/share-links/link-1", nil)
	rec := httptest.NewRecorder()

	err := handler.Delete(rec, req)
	if err == nil {
		t.Fatal("expected error")
	}
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeUnauthorized {
		t.Fatalf("expected unauthorized, got %v", err)
	}
}

// --- Resolve ---

func TestHandlerResolve_Success(t *testing.T) {
	svc := &mockService{
		resolveFn: func(token, password string, authenticated bool) (FileContentResponse, error) {
			if token != "tok-1" {
				t.Fatalf("unexpected token: %s", token)
			}
			return FileContentResponse{URL: "http://minio/test/obj"}, nil
		},
	}
	handler := newTestHandler(svc)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/s/tok-1", nil)
	req = withChiCtx(req, map[string]string{"token": "tok-1"})
	rec := httptest.NewRecorder()

	if err := handler.Resolve(rec, req); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var resp FileContentResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.URL != "http://minio/test/obj" {
		t.Fatalf("unexpected URL: %s", resp.URL)
	}
}

func TestHandlerResolve_WithPassword(t *testing.T) {
	svc := &mockService{
		resolveFn: func(token, password string, authenticated bool) (FileContentResponse, error) {
			if password != "secret" {
				t.Fatalf("expected password 'secret', got %q", password)
			}
			return FileContentResponse{URL: "http://minio/test/obj"}, nil
		},
	}
	handler := newTestHandler(svc)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/s/tok-1", nil)
	req.Header.Set("X-SharedLink-Password", "secret")
	req = withChiCtx(req, map[string]string{"token": "tok-1"})
	rec := httptest.NewRecorder()

	if err := handler.Resolve(rec, req); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestHandlerResolve_EmptyBody(t *testing.T) {
	// testing encoding nil response (empty struct)
	svc := &mockService{
		resolveFn: func(token, password string, authenticated bool) (FileContentResponse, error) {
			return FileContentResponse{}, nil
		},
	}
	handler := newTestHandler(svc)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/s/tok-1", nil)
	req = withChiCtx(req, map[string]string{"token": "tok-1"})
	rec := httptest.NewRecorder()

	if err := handler.Resolve(rec, req); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestHandlerResolve_MissingToken(t *testing.T) {
	handler := newTestHandler(&mockService{})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/s/", nil)
	req = withChiCtx(req, map[string]string{"token": ""})
	rec := httptest.NewRecorder()

	err := handler.Resolve(rec, req)
	if err == nil {
		t.Fatal("expected error")
	}
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeValidation {
		t.Fatalf("expected validation, got %v", err)
	}
}

func TestHandlerResolve_WithJWT(t *testing.T) {
	svc := &mockService{
		resolveFn: func(token, password string, authenticated bool) (FileContentResponse, error) {
			if !authenticated {
				t.Fatal("expected authenticated=true when JWT provided")
			}
			return FileContentResponse{URL: "http://minio/test/obj"}, nil
		},
	}
	handler := NewHandler(svc, &mockTokenParser{
		parseFn: func(raw string) (*auth.Claims, error) {
			return &auth.Claims{UserID: "user-1"}, nil
		},
	})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/s/tok-1", nil)
	req = withBearerAuth(req)
	req = withChiCtx(req, map[string]string{"token": "tok-1"})
	rec := httptest.NewRecorder()

	if err := handler.Resolve(rec, req); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}
