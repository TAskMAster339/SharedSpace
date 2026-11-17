package files

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"sharedspace/internal/access"
	"sharedspace/internal/storage"
)

type previewRow struct {
	value any
	err   error
}

func (r previewRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	switch v := r.value.(type) {
	case fileRecord:
		*dest[0].(*string) = v.DirectoryID
		*dest[1].(*string) = v.OwnerID
		*dest[2].(**time.Time) = v.DeletedAt
	case string:
		*dest[0].(*string) = v
	case []string:
		*dest[0].(*[]string) = v
	}
	return nil
}

type previewDB struct {
	mockTx
	rows    []previewRow
	queries int
}

func (db *previewDB) QueryRow(_ context.Context, _ string, _ ...any) pgx.Row {
	db.queries++
	if len(db.rows) == 0 {
		return previewRow{err: errors.New("unexpected query")}
	}
	row := db.rows[0]
	db.rows = db.rows[1:]
	return row
}

type previewStorage struct {
	mockStorage
	keys     []string
	deleted  []string
	onDelete func()
}

func (s *previewStorage) ListOldObjectPage(_ context.Context, prefix, after string, before time.Time, limit int) ([]string, string, error) {
	if prefix != previewPrefix || time.Since(before) < 59*time.Minute || limit != 500 {
		return nil, "", errors.New("unsafe cleanup scope")
	}
	var keys []string
	for _, key := range s.keys {
		if key > after {
			keys = append(keys, key)
		}
	}
	if len(keys) == 0 {
		return nil, "", nil
	}
	return keys, keys[len(keys)-1], nil
}
func (s *previewStorage) Delete(_ context.Context, key string) error {
	s.deleted = append(s.deleted, key)
	if s.onDelete != nil {
		s.onDelete()
	}
	return nil
}

func TestPreviewDeniedBeforeStorage(t *testing.T) {
	storage := &mockStorage{}
	svc := newTestService(&mockRepo{file: fileRecord{MimeType: "image/png", DirectoryID: "dir"}}, storage)
	svc.accessChecker = &mockAccessChecker{canFn: func(context.Context, string, string, access.Action) (bool, error) { return false, nil }}
	if _, err := svc.GetPreviewURL(context.Background(), "user", "file"); err == nil {
		t.Fatal("expected forbidden")
	}
}

func TestPreviewCached(t *testing.T) {
	storage := &mockStorage{getErr: errors.New("must not read source")}
	svc := newTestService(&mockRepo{file: fileRecord{MimeType: "image/png", DirectoryID: "dir"}}, storage)
	db := &previewDB{rows: []previewRow{{value: fileRecord{DirectoryID: "dir"}}, {value: previewPrefix + "cached.jpg"}}}
	svc.beginTx = func(context.Context, pgx.TxOptions) (transaction, error) { return db, nil }
	resp, err := svc.GetPreviewURL(context.Background(), "user", "file")
	if err != nil || resp.URL == "" {
		t.Fatalf("cached preview: %+v, %v", resp, err)
	}
	if storage.uploadedKey != "" {
		t.Fatal("cached preview regenerated")
	}
}

func TestPreviewDeletedWhileWaiting(t *testing.T) {
	svc := newTestService(&mockRepo{file: fileRecord{MimeType: "image/png"}}, &mockStorage{})
	db := &previewDB{rows: []previewRow{{err: pgx.ErrNoRows}}}
	svc.beginTx = func(context.Context, pgx.TxOptions) (transaction, error) { return db, nil }
	if _, err := svc.GetPreviewURL(context.Background(), "user", "file"); err == nil {
		t.Fatal("deleted file accepted")
	}
}

func TestCleanupPreviews(t *testing.T) {
	for _, tc := range []struct {
		name string
		rows []previewRow
		want int
	}{
		{"keeps live deletes orphan", []previewRow{{value: []string{previewPrefix + "live.jpg"}}}, 1},
		{"database failure keeps objects", []previewRow{{err: errors.New("db unavailable")}}, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			storage := &previewStorage{keys: []string{previewPrefix + "live.jpg", previewPrefix + "orphan.jpg"}}
			svc := newTestService(&mockRepo{}, storage)
			db := &previewDB{rows: tc.rows}
			svc.db = db
			svc.CleanupPreviews(context.Background(), "", time.Now().Add(-time.Hour))
			if db.queries != 1 {
				t.Fatalf("got %d lookups for one page", db.queries)
			}
			if len(storage.deleted) != tc.want {
				t.Fatalf("deleted %v", storage.deleted)
			}
			if tc.want > 0 && storage.deleted[0] != previewPrefix+"orphan.jpg" {
				t.Fatal("deleted live preview")
			}
		})
	}
}

func TestCleanupPreviewsResumesAfterCancellation(t *testing.T) {
	first, second := previewPrefix+"first.jpg", previewPrefix+"second.jpg"
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	storage := &previewStorage{keys: []string{first, second}, onDelete: cancel}
	svc := newTestService(&mockRepo{}, storage)
	svc.db = &previewDB{rows: []previewRow{{value: []string{}}, {value: []string{}}}}
	cutoff := time.Now().Add(-time.Hour)

	cursor := svc.CleanupPreviews(ctx, "", cutoff)
	if cursor != first {
		t.Fatalf("got cursor %q, want %q", cursor, first)
	}
	storage.onDelete = nil
	if cursor := svc.CleanupPreviews(context.Background(), cursor, cutoff); cursor != "" {
		t.Fatalf("expected completed scan, got cursor %q", cursor)
	}
	if len(storage.deleted) != 2 || storage.deleted[0] != first || storage.deleted[1] != second {
		t.Fatalf("deleted %v", storage.deleted)
	}
}

func TestCleanupPreviewsIntegration(t *testing.T) {
	dsn := os.Getenv("PREVIEW_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("PREVIEW_TEST_DATABASE_URL is required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	db, err := pgx.Connect(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close(context.Background())
	if _, err := db.Exec(ctx, "CREATE TEMP TABLE file_previews (object_key text PRIMARY KEY)"); err != nil {
		t.Fatal(err)
	}

	endpoint := os.Getenv("MINIO_ENDPOINT")
	store, err := storage.New(ctx, endpoint, os.Getenv("MINIO_ACCESS_KEY"), os.Getenv("MINIO_SECRET_KEY"),
		"test-bucket", endpoint, false, false, "")
	if err != nil {
		t.Fatal(err)
	}
	live, orphan := previewPrefix+uuid.NewString()+".jpg", previewPrefix+uuid.NewString()+".jpg"
	for _, key := range []string{live, orphan} {
		if err := store.Upload(ctx, key, bytes.NewBufferString("test"), 4, "image/jpeg"); err != nil {
			t.Fatal(err)
		}
		defer store.Delete(ctx, key)
	}
	if _, err := db.Exec(ctx, "INSERT INTO file_previews VALUES ($1)", live); err != nil {
		t.Fatal(err)
	}

	svc := &Service{db: db, storage: store}
	svc.CleanupPreviews(ctx, "", time.Now().Add(-time.Hour))
	if obj, err := store.Get(ctx, orphan); err != nil {
		t.Fatalf("fresh orphan should remain: %v", err)
	} else {
		obj.Close()
	}
	// Advance the worker's age cutoff without changing the storage clock.
	svc.CleanupPreviews(ctx, "", time.Now().Add(time.Hour))
	if obj, err := store.Get(ctx, orphan); err == nil {
		obj.Close()
		t.Fatal("old orphan should have been deleted")
	}
	if obj, err := store.Get(ctx, live); err != nil {
		t.Fatalf("live preview should remain: %v", err)
	} else {
		obj.Close()
	}
}

func requireFFmpeg(t *testing.T) {
	t.Helper()
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg required")
	}
}

func TestPreparePreviewTempDirRemovesStaleSources(t *testing.T) {
	dir := t.TempDir()
	stale := filepath.Join(dir, previewSourcePrefix+"stale")
	unrelated := filepath.Join(dir, "unrelated")
	for _, path := range []string{stale, unrelated} {
		if err := os.WriteFile(path, []byte("data"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err := PreparePreviewTempDir(dir); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(stale); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("stale source still present: %v", err)
	}
	if _, err := os.Stat(unrelated); err != nil {
		t.Fatalf("unrelated file was removed: %v", err)
	}
}

func previewPNG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{uint8(x), uint8(y), 120, 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestRenderPreview(t *testing.T) {
	requireFFmpeg(t)
	for _, tc := range []struct {
		name               string
		w, h, wantW, wantH int
	}{
		{"landscape", 1024, 512, 256, 128}, {"portrait", 512, 1024, 128, 256}, {"small", 32, 16, 32, 16},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			data, err := renderPreview(ctx, t.TempDir(), bytes.NewReader(previewPNG(t, tc.w, tc.h)))
			if err != nil {
				t.Fatal(err)
			}
			img, err := jpeg.Decode(bytes.NewReader(data))
			if err != nil {
				t.Fatal(err)
			}
			if img.Bounds().Dx() != tc.wantW || img.Bounds().Dy() != tc.wantH {
				t.Fatalf("dimensions: %v", img.Bounds())
			}
			if len(data) > 128*1024 {
				t.Fatalf("large preview: %d", len(data))
			}
		})
	}
	t.Run("corrupt", func(t *testing.T) {
		if _, err := renderPreview(context.Background(), t.TempDir(), bytes.NewReader([]byte("not an image"))); err == nil {
			t.Fatal("invalid media accepted")
		}
	})
	t.Run("video first frame", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "sample.mp4")
		cmd := exec.Command("ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=640x360:d=1", "-c:v", "mpeg4", path)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("fixture: %v %s", err, out)
		}
		file, err := os.Open(path)
		if err != nil {
			t.Fatal(err)
		}
		defer file.Close()
		data, err := renderPreview(context.Background(), t.TempDir(), file)
		if err != nil {
			t.Fatal(err)
		}
		img, err := jpeg.Decode(bytes.NewReader(data))
		if err != nil {
			t.Fatal(err)
		}
		if img.Bounds().Dx() != 256 || img.Bounds().Dy() != 144 {
			t.Fatalf("video dimensions: %v", img.Bounds())
		}
		r, g, b, _ := img.At(10, 10).RGBA()
		if r < 50000 || g > 10000 || b > 10000 {
			t.Fatal("unexpected first frame color")
		}
	})
}

func TestPreviewTrashAccess(t *testing.T) {
	deleted := time.Now()
	for _, tc := range []struct {
		name, owner string
		wantErr     bool
	}{
		{"owner sees cached preview", "user", false},
		{"other user cannot see deleted media", "other", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			file := fileRecord{DirectoryID: "dir", OwnerID: tc.owner, DeletedAt: &deleted, MimeType: "image/png"}
			storage := &mockStorage{getErr: errors.New("must use cached preview")}
			svc := newTestService(&mockRepo{file: file}, storage)
			svc.accessChecker = &mockAccessChecker{canFn: func(context.Context, string, string, access.Action) (bool, error) {
				t.Fatal("trash access must use file ownership, including deleted parent directories")
				return false, nil
			}}
			db := &previewDB{rows: []previewRow{{value: file}, {value: previewPrefix + "cached.jpg"}}}
			svc.beginTx = func(context.Context, pgx.TxOptions) (transaction, error) { return db, nil }
			resp, err := svc.GetPreviewURL(context.Background(), "user", "file")
			if (err != nil) != tc.wantErr {
				t.Fatalf("response=%+v error=%v", resp, err)
			}
			if !tc.wantErr && resp.URL == "" {
				t.Fatal("missing preview URL")
			}
		})
	}
}

func TestPreviewRechecksAccessWhenMovedToTrash(t *testing.T) {
	deleted := time.Now()
	svc := newTestService(&mockRepo{file: fileRecord{DirectoryID: "dir", OwnerID: "other", MimeType: "image/png"}}, &mockStorage{})
	db := &previewDB{rows: []previewRow{{value: fileRecord{DirectoryID: "dir", OwnerID: "other", DeletedAt: &deleted}}}}
	svc.beginTx = func(context.Context, pgx.TxOptions) (transaction, error) { return db, nil }
	if _, err := svc.GetPreviewURL(context.Background(), "user", "file"); err == nil {
		t.Fatal("non-owner saw media deleted while waiting for lock")
	}
}
