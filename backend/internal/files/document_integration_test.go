package files

import (
	"archive/zip"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sharedspace/internal/apperror"
	"sharedspace/internal/database"
	"sharedspace/internal/storage"
)

func TestDocumentCollaborationIntegration(t *testing.T) {
	dsn, endpoint := os.Getenv("TEST_DATABASE_URL"), os.Getenv("MINIO_ENDPOINT")
	if dsn == "" || endpoint == "" {
		t.Skip("set TEST_DATABASE_URL and MINIO_ENDPOINT for the Office integration test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	schema := "docx_test_" + uuid.NewString()[:8]
	admin, err := pgx.Connect(ctx, dsn)
	mustDocument(t, err)
	defer admin.Close(context.Background())
	_, err = admin.Exec(ctx, "CREATE SCHEMA "+schema)
	mustDocument(t, err)
	defer admin.Exec(context.Background(), "DROP SCHEMA "+schema+" CASCADE")

	cfg, err := pgxpool.ParseConfig(dsn)
	mustDocument(t, err)
	cfg.ConnConfig.RuntimeParams["search_path"] = schema + ",public"
	db, err := pgxpool.NewWithConfig(ctx, cfg)
	mustDocument(t, err)
	defer db.Close()

	migrations := "../database/migrations"
	oldMigrations := t.TempDir()
	entries, err := os.ReadDir(migrations)
	mustDocument(t, err)
	for _, entry := range entries {
		if filepath.Ext(entry.Name()) != ".sql" || entry.Name() >= "013" {
			continue
		}
		data, err := os.ReadFile(filepath.Join(migrations, entry.Name()))
		mustDocument(t, err)
		mustDocument(t, os.WriteFile(filepath.Join(oldMigrations, entry.Name()), data, 0600))
	}
	mustDocument(t, database.Migrate(ctx, db, oldMigrations))

	var users []string
	for i := 0; i < 8; i++ {
		var id string
		name := fmt.Sprintf("editor%d", i)
		err := db.QueryRow(ctx, `INSERT INTO users(username,email,password_hash,activated,storage_quota,storage_used)
			VALUES($1,$2,'test',true,1048576,0) RETURNING id`, name, name+"@example.test").Scan(&id)
		mustDocument(t, err)
		users = append(users, id)
	}
	var dir, shared string
	mustDocument(t, db.QueryRow(ctx, `INSERT INTO directories(owner_id,name)
		VALUES($1,'DOCX shared') RETURNING id`, users[0]).Scan(&dir))
	mustDocument(t, db.QueryRow(ctx, `INSERT INTO shared_directories(directory_id,owner_id)
		VALUES($1,$2) RETURNING id`, dir, users[0]).Scan(&shared))
	for i := 1; i < 7; i++ {
		role := "editor"
		if i == 6 {
			role = "viewer"
		}
		_, err := db.Exec(ctx, `INSERT INTO shared_directory_members(shared_directory_id,user_id,role) VALUES($1,$2,$3)`, shared, users[i], role)
		mustDocument(t, err)
	}

	store, err := storage.New(ctx, endpoint, os.Getenv("MINIO_ACCESS_KEY"), os.Getenv("MINIO_SECRET_KEY"),
		"docx-integration", endpoint, false, false, "")
	mustDocument(t, err)
	original, edited := testDOCX(t, "before migration"), testDOCX(t, strings.Repeat("after editor save ", 128))
	repo := NewRepository()
	originalKey := uuid.NewString()
	mustDocument(t, store.Upload(ctx, originalKey, bytes.NewReader(original), int64(len(original)), docxMIME))
	defer store.Delete(context.Background(), originalKey)
	file, err := repo.Save(ctx, db, fileRecord{DirectoryID: dir, OwnerID: users[0], Filename: "original.docx",
		Extension: "docx", MimeType: docxMIME, ObjectKey: originalKey, Size: int64(len(original))})
	mustDocument(t, err)
	mustDocument(t, repo.AddUserStorageUsed(ctx, db, users[0], file.Size))

	var previousDir string
	mustDocument(t, db.QueryRow(ctx, `INSERT INTO directories(owner_id,name)
		VALUES($1,'Previous version') RETURNING id`, users[7]).Scan(&previousDir))
	previous, err := repo.Save(ctx, db, fileRecord{DirectoryID: previousDir, OwnerID: users[7],
		Filename: "previous.docx", Extension: "docx", MimeType: docxMIME, ObjectKey: uuid.NewString(), Size: 1})
	mustDocument(t, err)
	_, err = db.Exec(ctx, `INSERT INTO file_versions(file_id,number,size,object_key)
		VALUES($1,1,1,$2)`, previous.ID, previous.ObjectKey)
	mustDocument(t, err)
	previousSession := uuid.NewString()
	_, err = db.Exec(ctx, `INSERT INTO document_edit_sessions(key,file_id,directory_id,base_object_key,closed_at)
		VALUES($1,$2,$3,$4,now())`, previousSession, previous.ID, previousDir, previous.ObjectKey)
	mustDocument(t, err)

	mustDocument(t, database.Migrate(ctx, db, migrations))
	versionBeforeUpdate, err := readDocumentVersion(ctx, db, previous.ID, 1)
	mustDocument(t, err)
	sessionBeforeUpdate, err := sessionByKey(ctx, db, previousSession, false)
	mustDocument(t, err)
	if versionBeforeUpdate.Format != "docx" || sessionBeforeUpdate.Format != "docx" || versionBeforeUpdate.Key != previous.ObjectKey {
		t.Fatal("existing DOCX version or session did not survive the format migration")
	}
	mustDocument(t, database.Migrate(ctx, db, migrations))

	newOfficeResults := map[string][]byte{
		"xlsx": testOfficeResult(t, "xlsx", "Spreadsheet updated"),
		"pptx": testOfficeResult(t, "pptx", "Presentation updated"),
	}
	var failDownload atomic.Bool
	failDownload.Store(true)
	office := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if result := newOfficeResults[strings.TrimPrefix(filepath.Ext(r.URL.Path), ".")]; result != nil {
			_, _ = w.Write(result)
			return
		}
		if r.URL.Path != "/cache/files/pilot/output.docx" || failDownload.Load() {
			http.Error(w, "temporary editor failure", http.StatusServiceUnavailable)
			return
		}
		_, _ = w.Write(edited)
	}))
	defer office.Close()
	uploads := &documentTestStorage{StorageClient: store}
	opts := DocumentEditorOptions{Enabled: true, PublicURL: office.URL, InternalURL: office.URL,
		StorageURL: "https://sharedspace.example.test", Secret: "test-only-office-secret-minimum-length"}
	svc, err := NewDocumentService(db, repo, uploads, opts)
	mustDocument(t, err)
	history, err := svc.History(ctx, file.ID, users[6])
	mustDocument(t, err)
	if history.CanEdit || history.CanRestore || len(history.Versions) != 0 {
		t.Fatalf("unexpected permissions or legacy history: %+v", history)
	}
	_, err = svc.History(ctx, file.ID, users[7])
	assertDocumentError(t, err, "forbidden")
	_, err = svc.StartSession(ctx, file.ID, users[6], "viewer", "light")
	assertDocumentError(t, err, "forbidden")

	var wg sync.WaitGroup
	results := make(chan error, 6)
	for i := 0; i < 6; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := svc.StartSession(ctx, file.ID, users[i], fmt.Sprintf("editor%d", i), "light")
			results <- err
		}()
	}
	wg.Wait()
	close(results)
	var denied int
	for err := range results {
		if err != nil {
			assertDocumentError(t, err, "document_editor_limit")
			denied++
		}
	}
	if denied != 1 {
		t.Fatalf("blocked %d editor(s), want 1", denied)
	}
	var member string
	mustDocument(t, db.QueryRow(ctx, "SELECT user_id FROM document_edit_members LIMIT 1").Scan(&member))
	result, err := svc.StartSession(ctx, file.ID, member, "editor", "light")
	mustDocument(t, err)
	doc := result.Config["document"].(map[string]any)
	key := doc["key"].(string)
	before, err := repo.FindByID(ctx, db, file.ID)
	mustDocument(t, err)
	if before.ObjectKey != originalKey {
		t.Fatal("session creation replaced the original object")
	}

	sign := func(event officeEvent) string {
		t.Helper()
		token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, officeCallbackClaims{Payload: event}).SignedString([]byte(opts.Secret))
		mustDocument(t, err)
		return token
	}
	assertDocumentError(t, svc.ProcessCallback(ctx, "invalid"), "unauthorized")
	mustDocument(t, svc.ProcessCallback(ctx, sign(officeEvent{Key: key, Status: 1, Users: []string{member}})))
	callback := sign(officeEvent{Key: key, Status: 2, URL: office.URL + "/cache/files/pilot/output.docx"})
	if err := svc.ProcessCallback(ctx, callback); err == nil {
		t.Fatal("expected temporary download error")
	}
	history, err = svc.History(ctx, file.ID, users[0])
	mustDocument(t, err)
	if !history.SavePending || len(history.Versions) != 0 {
		t.Fatalf("failed save should leave the original visible: %+v", history)
	}
	failDownload.Store(false)
	uploads.fail.Store(true)
	if err := svc.finishDocument(ctx, key); err == nil {
		t.Fatal("expected temporary MinIO upload failure")
	}
	session, err := sessionByKey(ctx, db, key, false)
	mustDocument(t, err)
	if session.ResultURL == nil || session.PendingKey != nil {
		t.Fatal("failed upload discarded the result URL or recorded a missing object")
	}
	uploads.fail.Store(false)
	_, err = db.Exec(ctx, "UPDATE users SET storage_quota=storage_used WHERE id=$1", users[0])
	mustDocument(t, err)
	assertDocumentError(t, svc.finishDocument(ctx, key), "document_quota_exceeded")
	var stagedKey string
	mustDocument(t, db.QueryRow(ctx, "SELECT pending_key FROM document_edit_sessions WHERE key=$1", key).Scan(&stagedKey))
	staged, err := store.Get(ctx, stagedKey)
	mustDocument(t, err)
	staged.Close()

	_, err = db.Exec(ctx, "UPDATE users SET storage_quota=1048576 WHERE id=$1", users[0])
	mustDocument(t, err)
	// Recreate the service to verify that the save can resume after a restart.
	svc, err = NewDocumentService(db, repo, uploads, opts)
	mustDocument(t, err)
	mustDocument(t, svc.finishDocument(ctx, key))
	mustDocument(t, svc.ProcessCallback(ctx, callback))
	history, err = svc.History(ctx, file.ID, users[6])
	mustDocument(t, err)
	if history.SavePending || len(history.Versions) != 2 || history.Versions[0].Number != 2 || history.Versions[1].Number != 1 {
		t.Fatalf("unexpected history after retry and duplicate callback: %+v", history)
	}
	saved, err := repo.FindByID(ctx, db, file.ID)
	mustDocument(t, err)
	defer store.Delete(context.Background(), saved.ObjectKey)
	reader, err := store.Get(ctx, saved.ObjectKey)
	mustDocument(t, err)
	actual, err := io.ReadAll(reader)
	reader.Close()
	mustDocument(t, err)
	if !bytes.Equal(actual, edited) {
		t.Fatal("saved object differs from the editor result")
	}
	assertDocumentError(t, svc.RestoreVersion(ctx, file.ID, users[6], "viewer", 1), "forbidden")
	mustDocument(t, svc.RestoreVersion(ctx, file.ID, users[0], "owner", 1))
	restored, err := repo.FindByID(ctx, db, file.ID)
	mustDocument(t, err)
	if restored.ID != file.ID || restored.ObjectKey != originalKey {
		t.Fatal("restore did not keep the file ID and current content")
	}
	var used, size int64
	mustDocument(t, db.QueryRow(ctx, "SELECT storage_used FROM users WHERE id=$1", users[0]).Scan(&used))
	mustDocument(t, db.QueryRow(ctx, "SELECT size_bytes FROM directories WHERE id=$1", dir).Scan(&size))
	if used != file.Size || size != file.Size {
		t.Fatalf("restore did not reconcile storage and directory size: quota %d, dir %d, expected %d", used, size, file.Size)
	}
	// A callback from the previous folder must never overwrite the current file.
	movedSession, err := svc.StartSession(ctx, file.ID, users[0], "owner", "light")
	mustDocument(t, err)
	movedKey := movedSession.Config["document"].(map[string]any)["key"].(string)
	mustDocument(t, svc.ProcessCallback(ctx, sign(officeEvent{Key: movedKey, Status: 1, Users: []string{users[0]}})))
	var movedDir string
	mustDocument(t, db.QueryRow(ctx, `INSERT INTO directories(owner_id,name)
		VALUES($1,'DOCX moved') RETURNING id`, users[0]).Scan(&movedDir))
	_, err = db.Exec(ctx, "UPDATE files SET directory_id=$1 WHERE id=$2", movedDir, file.ID)
	mustDocument(t, err)
	mustDocument(t, svc.ProcessCallback(ctx, sign(officeEvent{Key: movedKey, Status: 2, URL: office.URL + "/cache/files/pilot/output.docx"})))
	stale, err := sessionByKey(ctx, db, movedKey, false)
	mustDocument(t, err)
	if stale.ClosedAt == nil || stale.PendingKey == nil {
		t.Fatal("stale callback should close the session and retain a recoverable file")
	}
	defer store.Delete(context.Background(), *stale.PendingKey)
	moved, err := repo.FindByID(ctx, db, file.ID)
	mustDocument(t, err)
	if moved.ObjectKey != originalKey || moved.DirectoryID != movedDir {
		t.Fatal("stale callback overwrote the current moved file")
	}

	_, err = db.Exec(ctx, "DELETE FROM files WHERE id=$1", file.ID)
	mustDocument(t, err)
	_, err = db.Exec(ctx, "UPDATE file_version_cleanup SET eligible_at=now() - interval '1 minute'")
	mustDocument(t, err)
	svc.cleanupDocumentVersions(ctx, "")
	for _, key := range []string{originalKey, saved.ObjectKey} {
		if obj, err := store.Get(ctx, key); err == nil {
			obj.Close()
			t.Fatal("object from deleted document remained in MinIO")
		}
	}

	for extension, expected := range newOfficeResults {
		t.Run(extension, func(t *testing.T) {
			format := officeFormats[extension]
			initial := testOfficeResult(t, extension, "Before editing")
			sourceKey := uuid.NewString()
			mustDocument(t, store.Upload(ctx, sourceKey, bytes.NewReader(initial), int64(len(initial)), format.mime))
			defer store.Delete(context.Background(), sourceKey)
			officeFile, err := repo.Save(ctx, db, fileRecord{DirectoryID: dir, OwnerID: users[0],
				Filename: "test." + extension, Extension: extension, MimeType: format.mime, ObjectKey: sourceKey, Size: int64(len(initial))})
			mustDocument(t, err)
			mustDocument(t, repo.AddUserStorageUsed(ctx, db, users[0], officeFile.Size))

			preview, err := svc.StartPreview(ctx, officeFile.ID, users[6], "viewer", "dark")
			mustDocument(t, err)
			config := preview.Config["editorConfig"].(map[string]any)
			doc := preview.Config["document"].(map[string]any)
			if config["mode"] != "view" || config["callbackUrl"] != nil ||
				doc["permissions"].(map[string]bool)["edit"] || preview.Config["documentType"] != format.documentType ||
				config["customization"].(map[string]any)["uiTheme"] != "theme-night" {
				t.Fatalf("unexpected preview configuration for %s", extension)
			}
			source, err := url.Parse(doc["url"].(string))
			mustDocument(t, err)
			grant := source.Query().Get("grant")
			previewFile, err := svc.previewSourceFile(ctx, grant)
			mustDocument(t, err)
			if previewFile.ObjectKey != sourceKey {
				t.Fatal("preview did not bind to the saved object")
			}
			_, err = svc.sourceFile(ctx, grant)
			assertDocumentError(t, err, "unauthorized")
			_, err = svc.StartPreview(ctx, officeFile.ID, users[7], "outsider", "dark")
			assertDocumentError(t, err, "forbidden")
			_, err = activeDocumentSession(ctx, db, officeFile.ID)
			if !errors.Is(err, pgx.ErrNoRows) {
				t.Fatalf("preview opened an editing session: %v", err)
			}
			history, err := svc.History(ctx, officeFile.ID, users[6])
			mustDocument(t, err)
			if len(history.Versions) != 0 || history.CanEdit {
				t.Fatal("preview created a file version or granted editing rights")
			}

			editing, err := svc.StartSession(ctx, officeFile.ID, users[0], "owner", "light")
			mustDocument(t, err)
			key := editing.Config["document"].(map[string]any)["key"].(string)
			mustDocument(t, svc.ProcessCallback(ctx, sign(officeEvent{Key: key, Status: 1, Users: []string{users[0]}})))
			mustDocument(t, svc.ProcessCallback(ctx, sign(officeEvent{Key: key, Status: 2, URL: office.URL + "/cache/files/output." + extension})))

			saved, err := repo.FindByID(ctx, db, officeFile.ID)
			mustDocument(t, err)
			defer store.Delete(context.Background(), saved.ObjectKey)
			if saved.MimeType != format.mime || saved.Filename != officeFile.Filename {
				t.Fatal("saving changed the file format")
			}
			reader, err := store.Get(ctx, saved.ObjectKey)
			mustDocument(t, err)
			data, err := io.ReadAll(reader)
			reader.Close()
			mustDocument(t, err)
			if !bytes.Equal(data, expected) {
				t.Fatal("saved bytes differ from the Office editor output")
			}
			_, err = svc.previewSourceFile(ctx, grant)
			assertDocumentError(t, err, "conflict")
			mustDocument(t, svc.RestoreVersion(ctx, officeFile.ID, users[0], "owner", 1))
			current, err := repo.FindByID(ctx, db, officeFile.ID)
			mustDocument(t, err)
			if current.ObjectKey != sourceKey || current.MimeType != format.mime {
				t.Fatal("restoring changed the source format")
			}
		})
	}
}

type documentTestStorage struct {
	StorageClient
	fail atomic.Bool
}

func (store *documentTestStorage) Upload(ctx context.Context, key string, body io.Reader, size int64, contentType string) error {
	if store.fail.Load() {
		return errors.New("simulated MinIO upload outage")
	}
	return store.StorageClient.Upload(ctx, key, body, size, contentType)
}

func TestDocumentResultURL(t *testing.T) {
	svc, err := NewDocumentService(nil, nil, nil, DocumentEditorOptions{Enabled: true,
		PublicURL: "https://office.example.test", InternalURL: "http://office",
		StorageURL: "https://storage.example.test", Secret: "test-only-office-secret-minimum-length"})
	mustDocument(t, err)
	got, err := svc.resultDownloadURL("https://office.example.test/cache/files/data/key/output.docx?md5=signature")
	mustDocument(t, err)
	if got.String() != "http://office/cache/files/data/key/output.docx?md5=signature" {
		t.Fatalf("unexpected internal URL: %v", got)
	}
	for _, raw := range []string{"http://elsewhere/cache/files/a", "http://office/cache/files/%2e%2e/admin", "http://office@another/cache/files/a"} {
		if _, err := svc.resultDownloadURL(raw); err == nil {
			t.Errorf("accepted unsafe result URL %q", raw)
		}
	}
}

func testDOCX(t *testing.T, text string) []byte {
	t.Helper()
	return testOfficeResult(t, "docx", text)
}

func testOfficeResult(t *testing.T, extension, text string) []byte {
	t.Helper()
	var result bytes.Buffer
	zw := zip.NewWriter(&result)
	for _, name := range []string{"[Content_Types].xml", officeFormats[extension].mainPart} {
		file, err := zw.Create(name)
		mustDocument(t, err)
		_, err = io.WriteString(file, text)
		mustDocument(t, err)
	}
	mustDocument(t, zw.Close())
	return result.Bytes()
}

func assertDocumentError(t *testing.T, err error, code string) {
	t.Helper()
	var e *apperror.Error
	if !errors.As(err, &e) || e.Code() != code {
		t.Fatalf("want error %q, got %v", code, err)
	}
}

func mustDocument(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

func TestOfficeResultDoesNotAcceptOtherFormats(t *testing.T) {
	data := testOfficeResult(t, "xlsx", "test worksheet")
	if err := validateOfficeResult(bytes.NewReader(data), int64(len(data)), "pptx"); err == nil {
		t.Fatal("accepted spreadsheet content as a presentation")
	}
	for _, extension := range []string{"doc", "xls", "ppt", "odt", "ods", "odp"} {
		if officeFormats[extension].documentType == "" || officeFormats[extension].editable() {
			t.Errorf("%s should be available for preview only", extension)
		}
	}
}
