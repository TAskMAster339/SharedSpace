package files

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"sharedspace/internal/access"
	"sharedspace/internal/apperror"
	"sharedspace/internal/database"
	"sharedspace/internal/jobqueue"
	"sharedspace/internal/storage"
)

func TestMediaWorkerIntegration(t *testing.T) {
	dsn, endpoint := os.Getenv("TEST_DATABASE_URL"), os.Getenv("MINIO_ENDPOINT")
	if dsn == "" || endpoint == "" {
		t.Skip("set TEST_DATABASE_URL and MINIO_ENDPOINT for the media worker integration test")
	}
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	admin, err := pgx.Connect(ctx, dsn)
	mustDocument(t, err)
	defer admin.Close(context.Background())
	schema := "media_test_" + uuid.NewString()[:8]
	_, err = admin.Exec(ctx, "CREATE SCHEMA "+schema)
	mustDocument(t, err)
	defer admin.Exec(context.Background(), "DROP SCHEMA "+schema+" CASCADE")
	cfg, err := pgxpool.ParseConfig(dsn)
	mustDocument(t, err)
	cfg.ConnConfig.RuntimeParams["search_path"] = schema + ",public"
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	mustDocument(t, err)
	defer pool.Close()

	migrations := "../database/migrations"
	old := t.TempDir()
	entries, err := os.ReadDir(migrations)
	mustDocument(t, err)
	for _, entry := range entries {
		if entry.Name() >= "015" {
			continue
		}
		data, err := os.ReadFile(filepath.Join(migrations, entry.Name()))
		mustDocument(t, err)
		mustDocument(t, os.WriteFile(filepath.Join(old, entry.Name()), data, 0600))
	}
	mustDocument(t, database.Migrate(ctx, pool, old))

	repo := NewRepository()
	store, err := storage.New(ctx, endpoint, os.Getenv("MINIO_ACCESS_KEY"), os.Getenv("MINIO_SECRET_KEY"),
		"media-integration", endpoint, false, false, "")
	mustDocument(t, err)
	tmpStore, err := storage.New(ctx, endpoint, os.Getenv("MINIO_ACCESS_KEY"), os.Getenv("MINIO_SECRET_KEY"),
		"media-integration-tmp", endpoint, false, false, "")
	mustDocument(t, err)
	var owner, other, dir string
	for name, id := range map[string]*string{"media-owner": &owner, "media-other": &other} {
		mustDocument(t, pool.QueryRow(ctx, `INSERT INTO users(username,email,password_hash,storage_quota,storage_used,activated)
			VALUES ($1,$2,'test',1073741824,0,true) RETURNING id`, name, name+"@example.test").Scan(id))
	}
	mustDocument(t, pool.QueryRow(ctx, `INSERT INTO directories(owner_id,name) VALUES($1,'Media') RETURNING id`, owner).Scan(&dir))
	data, key := makePNG(t), uuid.NewString()
	mustDocument(t, store.Upload(ctx, key, bytes.NewReader(data), int64(len(data)), "image/png"))
	defer store.Delete(context.Background(), key)
	file, err := repo.Save(ctx, pool, fileRecord{DirectoryID: dir, OwnerID: owner, Filename: "source.png", Extension: "png",
		MimeType: "image/png", Size: int64(len(data)), ObjectKey: key})
	mustDocument(t, err)
	mustDocument(t, repo.AddUserStorageUsed(ctx, pool, owner, file.Size))
	mustDocument(t, database.Migrate(ctx, pool, migrations))
	mustDocument(t, database.Migrate(ctx, pool, migrations))

	queue, err := jobqueue.New(pool)
	mustDocument(t, err)
	checker := access.NewChecker(pool, access.NewRepository())
	svc := NewService(pool, repo, store, tmpStore, checker, nil)
	mustDocument(t, svc.ConfigureMediaQueue(queue))
	svc.mediaLimits.perUser = 1
	req := ConvertRequest{TargetFormat: "jpg", Save: true}
	requestKey := uuid.NewString()
	accepted, err := svc.RequestConversion(ctx, owner, file.ID, req, true, requestKey)
	mustDocument(t, err)
	duplicate, err := svc.RequestConversion(ctx, owner, file.ID, req, true, requestKey)
	mustDocument(t, err)
	if accepted.JobID != duplicate.JobID || accepted.State != "queued" {
		t.Fatalf("repeated request %+v, first %+v", duplicate, accepted)
	}
	_, err = svc.RequestConversion(ctx, owner, file.ID, req, true, uuid.NewString())
	assertMediaHTTPError(t, err, http.StatusTooManyRequests)
	_, err = svc.MediaJob(ctx, other, accepted.JobID)
	assertMediaHTTPError(t, err, http.StatusNotFound)
	_, err = svc.RequestConversion(ctx, other, file.ID, req, true, requestKey)
	assertMediaHTTPError(t, err, http.StatusForbidden)

	var sharedID string
	mustDocument(t, pool.QueryRow(ctx, `INSERT INTO shared_directories(directory_id,owner_id)
        VALUES ($1,$2) RETURNING id`, dir, owner).Scan(&sharedID))
	_, err = pool.Exec(ctx, `INSERT INTO shared_directory_members(shared_directory_id,user_id,role)
        VALUES ($1,$2,'editor')`, sharedID, other)
	mustDocument(t, err)
	revoked, err := svc.RequestConversion(ctx, other, file.ID, req, true, uuid.NewString())
	mustDocument(t, err)
	_, err = pool.Exec(ctx, `DELETE FROM shared_directory_members WHERE shared_directory_id=$1 AND user_id=$2`, sharedID, other)
	mustDocument(t, err)

	removed, err := repo.Save(ctx, pool, fileRecord{DirectoryID: dir, OwnerID: owner, Filename: "gone.png",
		Extension: "png", MimeType: "image/png", Size: file.Size, ObjectKey: uuid.NewString()})
	mustDocument(t, err)
	deletedJob, err := svc.RequestPreview(ctx, owner, removed.ID, true)
	mustDocument(t, err)
	mustDocument(t, repo.HardDeleteFile(ctx, pool, removed.ID))

	stale := uuid.NewString()
	_, err = pool.Exec(ctx, `UPDATE background_jobs SET state='running', attempts=1, lease_token=$2,
		lease_until=clock_timestamp()-interval '1 second' WHERE id=$1`, accepted.JobID, stale)
	mustDocument(t, err)
	orphan := savedMediaPrefix + stale + ".jpg"
	mustDocument(t, store.Upload(ctx, orphan, bytes.NewReader(data), int64(len(data)), "image/jpeg"))
	defer store.Delete(context.Background(), orphan)
	j, err := queue.Get(ctx, owner, accepted.JobID)
	mustDocument(t, err)
	payload := mediaPayload{FileID: file.ID, ObjectKey: key, Target: "jpg", Save: true}
	if err := svc.publishMedia(ctx, pool, j, payload, mediaResult{ObjectKey: orphan}, int64(len(data)), "png"); !errors.Is(err, jobqueue.ErrLeaseLost) {
		t.Fatalf("expired lease published: %v", err)
	}

	preview, err := svc.RequestPreview(ctx, owner, file.ID, true)
	mustDocument(t, err)
	stop, shutdown := context.WithCancel(ctx)
	workerDone := make(chan struct{}, 2)
	for range 2 {
		dir := t.TempDir()
		go func() {
			defer func() { workerDone <- struct{}{} }()
			queue.Run(stop, svc.MediaHandlers(pool, dir), func() {})
		}()
	}
	defer func() {
		shutdown()
		<-workerDone
		<-workerDone
	}()

	gotPreview := awaitMediaJob(t, ctx, svc, owner, preview.JobID)
	if gotPreview.Preview == nil {
		t.Fatalf("preview %+v", gotPreview)
	}
	got := awaitMediaJob(t, ctx, svc, owner, accepted.JobID)
	if got.Conversion == nil {
		t.Fatalf("conversion %+v", got)
	}
	for _, tc := range []struct {
		id, user string
		status   int
	}{{revoked.JobID, other, http.StatusForbidden}, {deletedJob.JobID, owner, http.StatusNotFound}} {
		failed, err := queue.Get(ctx, tc.user, tc.id)
		mustDocument(t, err)
		if failed.State != "failed" || failed.Attempts != 1 || failed.Failure == nil || failed.Failure.Status != tc.status {
			t.Fatalf("expected a terminal failure with status %d: %+v", tc.status, failed)
		}
	}

	converted, err := repo.FindByID(ctx, pool, got.Conversion.ResultFileID)
	mustDocument(t, err)
	defer store.Delete(context.Background(), converted.ObjectKey)
	var count, attempts int
	mustDocument(t, pool.QueryRow(ctx, `SELECT count(*) FROM files WHERE directory_id=$1`, dir).Scan(&count))
	mustDocument(t, pool.QueryRow(ctx, `SELECT attempts FROM background_jobs WHERE id=$1`, accepted.JobID).Scan(&attempts))
	used, _, err := repo.GetUserStorage(ctx, pool, owner)
	mustDocument(t, err)
	history, err := svc.ListConversions(ctx, owner, file.ID)
	mustDocument(t, err)
	if count != 2 || attempts != 2 || used != file.Size+converted.Size || len(history.Conversions) != 1 {
		t.Fatalf("files=%d attempts=%d usage=%d history=%d", count, attempts, used, len(history.Conversions))
	}
	cached, err := svc.RequestPreview(ctx, owner, file.ID, true)
	mustDocument(t, err)
	if cached.Preview == nil || cached.JobID != "" {
		t.Fatalf("preview cache miss: %+v", cached)
	}
	var previewKey string
	mustDocument(t, pool.QueryRow(ctx, `SELECT object_key FROM file_previews WHERE file_id=$1`, file.ID).Scan(&previewKey))
	defer store.Delete(context.Background(), previewKey)
	svc.cleanupMediaObjects(ctx, savedMediaPrefix, "", time.Now().Add(time.Minute))
	if r, err := store.Get(ctx, orphan); err == nil {
		r.Close()
		t.Fatal("orphan survived")
	}
	r, err := store.Get(ctx, converted.ObjectKey)
	mustDocument(t, err)
	r.Close()

	download, err := svc.RequestConversion(ctx, owner, file.ID, ConvertRequest{TargetFormat: "webp"}, false, "")
	mustDocument(t, err)
	if download.Download == nil || download.Download.Filename != "source.webp" {
		t.Fatalf("download %+v", download)
	}
	ready, err := http.Get(download.Download.DownloadURL)
	mustDocument(t, err)
	ready.Body.Close()
	if ready.StatusCode != 200 {
		t.Fatalf("download status %d", ready.StatusCode)
	}
}

func awaitMediaJob(t *testing.T, ctx context.Context, svc *Service, owner, id string) MediaJobResponse {
	t.Helper()
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	for {
		result, err := svc.MediaJob(ctx, owner, id)
		mustDocument(t, err)
		if result.State == "succeeded" {
			return result
		}
		select {
		case <-ctx.Done():
			t.Fatal(ctx.Err())
		case <-ticker.C:
		}
	}
}

func assertMediaHTTPError(t *testing.T, err error, status int) {
	t.Helper()
	apiErr, ok := apperror.From(err)
	if !ok || apiErr.Status() != status {
		t.Fatalf("expected status %d: %v", status, err)
	}
}
