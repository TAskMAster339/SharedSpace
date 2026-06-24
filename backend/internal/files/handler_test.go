package files

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"sharedspace/internal/apperror"
	"sharedspace/internal/auth"
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
