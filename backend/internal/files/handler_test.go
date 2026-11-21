package files

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"sharedspace/internal/access"
	"sharedspace/internal/apperror"
	"sharedspace/internal/auth"
	"sharedspace/internal/middleware"
)

type mockService struct {
	uploadFn func(string, string, []FileUpload) (UploadFilesResponse, error)

	uploadUserID  string
	uploadDirID   string
	uploadUploads []FileUpload
}

func (m *mockService) Upload(_ context.Context, userID, directoryID string, uploads []FileUpload) (UploadFilesResponse, error) {
	m.uploadUserID = userID
	m.uploadDirID = directoryID
	m.uploadUploads = uploads
	if m.uploadFn != nil {
		return m.uploadFn(userID, directoryID, uploads)
	}
	return UploadFilesResponse{}, nil
}

func (m *mockService) GetMetadata(_ context.Context, userID, fileID string) (FileMetadataResponse, error) {
	return FileMetadataResponse{}, nil
}

func (m *mockService) RequestPreview(_ context.Context, _, _ string, async bool) (MediaJobResponse, error) {
	if async {
		return MediaJobResponse{JobID: "job-1", State: "queued", RetryAfter: 2}, nil
	}
	return MediaJobResponse{Preview: &FileContentResponse{}}, nil
}

func (m *mockService) MediaJob(_ context.Context, _, _ string) (MediaJobResponse, error) {
	return MediaJobResponse{JobID: "job-1", State: "running", RetryAfter: 2}, nil
}

func (m *mockService) GetContentURL(_ context.Context, userID, fileID string) (FileContentResponse, error) {
	return FileContentResponse{}, nil
}

func (m *mockService) SoftDelete(_ context.Context, userID, fileID string) error {
	return nil
}

func (m *mockService) Restore(_ context.Context, userID, fileID string) error {
	return nil
}

func (m *mockService) PermanentDelete(_ context.Context, userID, fileID string) error {
	return nil
}

func (m *mockService) GetRecent(_ context.Context, userID string, limit int, cursor string) (RecentFilesResponse, error) {
	return RecentFilesResponse{}, nil
}

func (m *mockService) Update(_ context.Context, userID, fileID string, req UpdateFileRequest) (FileMetadataResponse, error) {
	return FileMetadataResponse{}, nil
}

func (m *mockService) RequestConversion(_ context.Context, _, _ string, req ConvertRequest, async bool, _ string) (MediaJobResponse, error) {
	if async {
		return MediaJobResponse{JobID: "job-1", State: "queued", RetryAfter: 2}, nil
	}
	if req.Save {
		return MediaJobResponse{Conversion: &ConversionResponse{}}, nil
	}
	return MediaJobResponse{Download: &ConversionDownloadResponse{DownloadURL: "http://minio/tmp/file.webp?token=xxx", Filename: "photo.webp"}}, nil
}

func (m *mockService) ListConversions(_ context.Context, userID, fileID string) (ConversionsListResponse, error) {
	return ConversionsListResponse{}, nil
}

func withClaims(ctx context.Context, userID string) context.Context {
	return auth.SetClaims(ctx, &auth.Claims{UserID: userID})
}

func buildMultipartRequest(t *testing.T, directoryID, filename, content string) *http.Request {
	t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)

	_ = w.WriteField("directory_id", directoryID)

	fw, err := w.CreateFormFile("files", filename)
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	fw.Write([]byte(content))
	w.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/v1/files", &buf)
	req.Header.Set("Content-Type", w.FormDataContentType())
	return req
}

func TestHandlerUpload_Success(t *testing.T) {
	svc := &mockService{
		uploadFn: func(userID, dirID string, uploads []FileUpload) (UploadFilesResponse, error) {
			return UploadFilesResponse{
				Files: []UploadResponse{
					{ID: "file-1", Filename: "test.txt", Extension: "txt", MimeType: "text/plain", Size: 5, DirectoryID: dirID, OwnerID: userID},
				},
			}, nil
		},
	}
	handler := NewHandler(svc)

	req := buildMultipartRequest(t, "dir-1", "test.txt", "hello")
	req = req.WithContext(withClaims(req.Context(), "user-1"))
	rec := httptest.NewRecorder()

	if err := handler.Upload(rec, req); err != nil {
		t.Fatalf("handler returned error: %v", err)
	}
	if rec.Code != http.StatusCreated {
		t.Fatalf("unexpected status: %d", rec.Code)
	}

	var resp UploadFilesResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(resp.Files) != 1 {
		t.Fatalf("expected 1 file, got %d", len(resp.Files))
	}
	if resp.Files[0].Filename != "test.txt" {
		t.Fatalf("unexpected filename: %q", resp.Files[0].Filename)
	}
	if svc.uploadUserID != "user-1" || svc.uploadDirID != "dir-1" {
		t.Fatalf("unexpected service args: user=%q dir=%q", svc.uploadUserID, svc.uploadDirID)
	}
}

type uploadTestBytes struct{}

func (uploadTestBytes) Read(buffer []byte) (int, error) {
	clear(buffer)
	return len(buffer), nil
}

func TestHandlerUploadRejectsOversizedBody(t *testing.T) {
	for _, test := range []struct {
		name   string
		length int64
	}{
		{name: "known content length", length: maxRequestBytes + 1},
		{name: "streamed body", length: -1},
	} {
		t.Run(test.name, func(t *testing.T) {
			service := &mockService{}
			prefix := "--fixture\r\nContent-Disposition: form-data; name=\"files\"; filename=\"item.txt\"\r\n\r\n"
			body := io.MultiReader(strings.NewReader(prefix), io.LimitReader(uploadTestBytes{}, maxRequestBytes+1))
			req := httptest.NewRequest(http.MethodPost, "/api/v1/files", body)
			req.ContentLength = test.length
			req.Header.Set("Content-Type", "multipart/form-data; boundary=fixture")
			req = req.WithContext(withClaims(req.Context(), "user-1"))
			rec := httptest.NewRecorder()
			middleware.AppError(NewHandler(service).Upload).ServeHTTP(rec, req)
			if rec.Code != http.StatusRequestEntityTooLarge || !strings.Contains(rec.Body.String(), "upload_too_large") {
				t.Fatalf("unexpected response: %d %s", rec.Code, rec.Body)
			}
			if service.uploadUserID != "" {
				t.Fatal("oversized request reached the upload service")
			}
		})
	}
}

func TestHandlerUpload_Unauthorized(t *testing.T) {
	handler := NewHandler(&mockService{})

	req := buildMultipartRequest(t, "dir-1", "test.txt", "hello")
	rec := httptest.NewRecorder()

	err := handler.Upload(rec, req)
	if err == nil {
		t.Fatal("expected error")
	}
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeUnauthorized {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestHandlerUpload_MissingDirectoryID(t *testing.T) {
	handler := NewHandler(&mockService{})

	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	fw, _ := w.CreateFormFile("files", "test.txt")
	fw.Write([]byte("hello"))
	w.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/v1/files", &buf)
	req.Header.Set("Content-Type", w.FormDataContentType())
	req = req.WithContext(withClaims(req.Context(), "user-1"))
	rec := httptest.NewRecorder()

	err := handler.Upload(rec, req)
	if err == nil {
		t.Fatal("expected error")
	}
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeValidation {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestHandlerUpload_NoFiles(t *testing.T) {
	handler := NewHandler(&mockService{})

	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	w.WriteField("directory_id", "dir-1")
	w.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/v1/files", &buf)
	req.Header.Set("Content-Type", w.FormDataContentType())
	req = req.WithContext(withClaims(req.Context(), "user-1"))
	rec := httptest.NewRecorder()

	err := handler.Upload(rec, req)
	if err == nil {
		t.Fatal("expected error")
	}
	appErr, ok := apperror.From(err)
	if !ok || appErr.Code() != apperror.CodeValidation {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestPropertiesResponse(t *testing.T) {
	resource := fileRecord{ID: "item", Filename: "fixture", OwnerID: "owner", OwnerUsername: "alice"}
	for _, tt := range []struct {
		name       string
		userID     string
		canView    bool
		lookupErr  error
		wantStatus int
	}{
		{name: "owner", userID: "owner", canView: true, wantStatus: http.StatusOK},
		{name: "viewer", userID: "viewer", canView: true, wantStatus: http.StatusOK},
		{name: "unrelated user", userID: "unrelated", wantStatus: http.StatusForbidden},
		{name: "trashed object", userID: "owner", lookupErr: pgx.ErrNoRows, wantStatus: http.StatusNotFound},
	} {
		t.Run(tt.name, func(t *testing.T) {
			repo := &mockRepo{file: resource, fileErr: tt.lookupErr}
			svc := newTestService(repo, &mockStorage{})
			svc.accessChecker = &mockAccessChecker{canFn: func(_ context.Context, _, _ string, action access.Action) (bool, error) {
				return action == access.ActionView && tt.canView, nil
			}}
			router := chi.NewRouter()
			router.Get("/files/{id}", middleware.AppError(NewHandler(svc).GetMetadata))
			req := httptest.NewRequest(http.MethodGet, "/files/item", nil)
			req = req.WithContext(withClaims(req.Context(), tt.userID))
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)
			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d, body = %s", rec.Code, tt.wantStatus, rec.Body.String())
			}
			var body map[string]any
			if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if tt.wantStatus == http.StatusOK {
				if body["owner_username"] != "alice" || body["owner_id"] != "owner" || body["id"] != "item" {
					t.Fatalf("unexpected metadata: %v", body)
				}
			} else if _, present := body["owner_username"]; present {
				t.Fatalf("error exposed owner name: %v", body)
			}
		})
	}
}
