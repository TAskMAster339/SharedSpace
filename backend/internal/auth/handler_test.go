package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"sharedspace/internal/apperror"
)

type mockService struct {
	registerFn func(RegisterRequest) (RegisterResponse, error)
	loginFn    func(LoginRequest, loginMeta) (LoginResponse, error)
	refreshFn  func(string, loginMeta) (RefreshResponse, error)

	registerReq RegisterRequest
	loginReq    LoginRequest
	loginMeta   loginMeta
	refreshToken string
	refreshMeta loginMeta
}

func (m *mockService) Register(_ context.Context, req RegisterRequest) (RegisterResponse, error) {
	m.registerReq = req
	if m.registerFn != nil {
		return m.registerFn(req)
	}
	return RegisterResponse{}, nil
}

func (m *mockService) Login(_ context.Context, req LoginRequest, meta loginMeta) (LoginResponse, error) {
	m.loginReq = req
	m.loginMeta = meta
	if m.loginFn != nil {
		return m.loginFn(req, meta)
	}
	return LoginResponse{}, nil
}

func (m *mockService) Refresh(_ context.Context, token string, meta loginMeta) (RefreshResponse, error) {
	m.refreshToken = token
	m.refreshMeta = meta
	if m.refreshFn != nil {
		return m.refreshFn(token, meta)
	}
	return RefreshResponse{}, nil
}

func TestHandlerRegister(t *testing.T) {
	service := &mockService{
		registerFn: func(req RegisterRequest) (RegisterResponse, error) {
			return RegisterResponse{User: UserResponse{ID: "user-1", Email: req.Email, Username: req.Username}, RootDirectoryID: "dir-1"}, nil
		},
	}
	handler := NewHandler(service)

	body := bytes.NewBufferString(`{"email":"ivan@example.com","username":"ivan","first_name":"Ivan","second_name":"Petrov","password":"StrongPass1!"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", body)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	if err := handler.Register(rec, req); err != nil {
		t.Fatalf("handler returned error: %v", err)
	}
	if rec.Code != http.StatusCreated {
		t.Fatalf("unexpected status: %d", rec.Code)
	}
	if service.registerReq.Email != "ivan@example.com" || service.registerReq.Username != "ivan" {
		t.Fatalf("unexpected request captured: %+v", service.registerReq)
	}
	var resp RegisterResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.RootDirectoryID != "dir-1" {
		t.Fatalf("unexpected response: %+v", resp)
	}
}

func TestHandlerLoginInvalidJSON(t *testing.T) {
	handler := NewHandler(&mockService{})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewBufferString(`{"email":`))
	rec := httptest.NewRecorder()

	err := handler.Login(rec, req)
	if err == nil {
		t.Fatal("expected error")
	}
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeValidation {
		t.Fatalf("unexpected error: %v", err)
	}
}
