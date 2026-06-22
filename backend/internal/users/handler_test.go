package users

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
	getMeFn      func(string) (UserResponse, error)
	updateMeFn   func(string, UpdateProfileRequest) (UserResponse, error)
	changePassFn func(string, ChangePasswordRequest) error
	searchFn     func(string, string, int) (SearchUsersResponse, error)

	getMeUserID  string
	updateUserID string
	updateReq    UpdateProfileRequest
	changeUserID string
	changeReq    ChangePasswordRequest
	searchUserID string
	searchQuery  string
	searchLimit  int
}

func (m *mockService) GetMe(_ context.Context, userID string) (UserResponse, error) {
	m.getMeUserID = userID
	if m.getMeFn != nil {
		return m.getMeFn(userID)
	}
	return UserResponse{}, nil
}

func (m *mockService) UpdateMe(_ context.Context, userID string, req UpdateProfileRequest) (UserResponse, error) {
	m.updateUserID = userID
	m.updateReq = req
	if m.updateMeFn != nil {
		return m.updateMeFn(userID, req)
	}
	return UserResponse{}, nil
}

func (m *mockService) ChangePassword(_ context.Context, userID string, req ChangePasswordRequest) error {
	m.changeUserID = userID
	m.changeReq = req
	if m.changePassFn != nil {
		return m.changePassFn(userID, req)
	}
	return nil
}

func (m *mockService) SearchUsers(_ context.Context, userID, query string, limit int) (SearchUsersResponse, error) {
	m.searchUserID = userID
	m.searchQuery = query
	m.searchLimit = limit
	if m.searchFn != nil {
		return m.searchFn(userID, query, limit)
	}
	return SearchUsersResponse{}, nil
}

type mockAuthIdentity struct {
	rawAccessToken string
	userIDFn       func(string) (string, error)
}

func (m *mockAuthIdentity) UserIDFromAccessToken(_ context.Context, rawAccessToken string) (string, error) {
	m.rawAccessToken = rawAccessToken
	if m.userIDFn != nil {
		return m.userIDFn(rawAccessToken)
	}
	return "", apperror.Unauthorized("invalid access token")
}

func TestHandlerGetMe(t *testing.T) {
	svc := &mockService{
		getMeFn: func(userID string) (UserResponse, error) {
			return UserResponse{ID: "user-1", Email: "test@example.com", Username: "test"}, nil
		},
	}
	authn := &mockAuthIdentity{
		userIDFn: func(_ string) (string, error) { return "user-1", nil },
	}
	handler := NewHandler(svc, authn)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/users/me", nil)
	req.Header.Set("Authorization", "Bearer access-token")
	rec := httptest.NewRecorder()

	if err := handler.GetMe(rec, req); err != nil {
		t.Fatalf("handler returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d", rec.Code)
	}
	var resp UserResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.ID != "user-1" || resp.Email != "test@example.com" {
		t.Fatalf("unexpected response: %+v", resp)
	}
}

func TestHandlerUpdateMe(t *testing.T) {
	svc := &mockService{
		updateMeFn: func(userID string, req UpdateProfileRequest) (UserResponse, error) {
			return UserResponse{ID: userID, Email: *req.Email, Username: "test"}, nil
		},
	}
	authn := &mockAuthIdentity{
		userIDFn: func(_ string) (string, error) { return "user-1", nil },
	}
	handler := NewHandler(svc, authn)

	body := bytes.NewBufferString(`{"email":"new@example.com"}`)
	req := httptest.NewRequest(http.MethodPatch, "/api/v1/users/me", body)
	req.Header.Set("Authorization", "Bearer access-token")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	if err := handler.UpdateMe(rec, req); err != nil {
		t.Fatalf("handler returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d", rec.Code)
	}
	if svc.updateUserID != "user-1" || svc.updateReq.Email == nil || *svc.updateReq.Email != "new@example.com" {
		t.Fatalf("unexpected request captured: %+v", svc.updateReq)
	}
}

func TestHandlerUpdateMeInvalidJSON(t *testing.T) {
	authn := &mockAuthIdentity{
		userIDFn: func(_ string) (string, error) { return "user-1", nil },
	}
	handler := NewHandler(&mockService{}, authn)

	req := httptest.NewRequest(http.MethodPatch, "/api/v1/users/me", bytes.NewBufferString(`{invalid}`))
	req.Header.Set("Authorization", "Bearer access-token")
	rec := httptest.NewRecorder()

	err := handler.UpdateMe(rec, req)
	if err == nil {
		t.Fatal("expected error")
	}
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeValidation {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestHandlerChangePassword(t *testing.T) {
	svc := &mockService{}
	authn := &mockAuthIdentity{
		userIDFn: func(_ string) (string, error) { return "user-1", nil },
	}
	handler := NewHandler(svc, authn)

	body := bytes.NewBufferString(`{"old_password":"old","new_password":"NewPass1!","current_refresh_token":"token"}`)
	req := httptest.NewRequest(http.MethodPatch, "/api/v1/users/me/password", body)
	req.Header.Set("Authorization", "Bearer access-token")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	if err := handler.ChangePassword(rec, req); err != nil {
		t.Fatalf("handler returned error: %v", err)
	}
	if rec.Code != http.StatusNoContent {
		t.Fatalf("unexpected status: %d", rec.Code)
	}
	if svc.changeUserID != "user-1" || svc.changeReq.OldPassword != "old" || svc.changeReq.NewPassword != "NewPass1!" {
		t.Fatalf("unexpected request captured: %+v", svc.changeReq)
	}
}

func TestHandlerSearchUsers(t *testing.T) {
	svc := &mockService{
		searchFn: func(userID, query string, limit int) (SearchUsersResponse, error) {
			return SearchUsersResponse{Users: []UserResponse{{ID: "u1", Username: "ivanov", Email: "ivan@example.com"}}}, nil
		},
	}
	authn := &mockAuthIdentity{
		userIDFn: func(_ string) (string, error) { return "me-1", nil },
	}
	handler := NewHandler(svc, authn)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/users/search?query=iva&limit=10", nil)
	req.Header.Set("Authorization", "Bearer access-token")
	rec := httptest.NewRecorder()

	if err := handler.SearchUsers(rec, req); err != nil {
		t.Fatalf("handler returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d", rec.Code)
	}
	if svc.searchUserID != "me-1" || svc.searchQuery != "iva" || svc.searchLimit != 10 {
		t.Fatalf("unexpected search call: user=%q query=%q limit=%d", svc.searchUserID, svc.searchQuery, svc.searchLimit)
	}
}


