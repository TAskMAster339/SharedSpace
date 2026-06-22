package middleware

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"sharedspace/internal/auth"
)

type mockParser struct {
	claims *auth.Claims
	err    error
}

func (m *mockParser) ParseAccessToken(_ string) (*auth.Claims, error) {
	return m.claims, m.err
}

func okHandler(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }

func TestJWTAuth_NoHeader(t *testing.T) {
	h := JWTAuth(&mockParser{claims: &auth.Claims{UserID: "u1"}})(http.HandlerFunc(okHandler))
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d", rec.Code)
	}
}

func TestJWTAuth_InvalidToken(t *testing.T) {
	h := JWTAuth(&mockParser{err: errors.New("bad token")})(http.HandlerFunc(okHandler))
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	req.Header.Set("Authorization", "Bearer bad.token")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d", rec.Code)
	}
}

func TestJWTAuth_ValidToken(t *testing.T) {
	wantID := "user-42"
	var gotID string

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, ok := auth.ClaimsFromCtx(r.Context())
		if !ok {
			t.Error("claims missing from context")
			return
		}
		gotID = c.UserID
		w.WriteHeader(http.StatusOK)
	})

	h := JWTAuth(&mockParser{claims: &auth.Claims{UserID: wantID}})(inner)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	req.Header.Set("Authorization", "Bearer valid.token")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rec.Code)
	}
	if gotID != wantID {
		t.Fatalf("want userID %q, got %q", wantID, gotID)
	}
}
