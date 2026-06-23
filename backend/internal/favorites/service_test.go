package favorites

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"sharedspace/internal/apperror"
)

type mockRepo struct {
	insertErr   error
	deleteErr   error
	findAllErr  error
	findFileErr error
	findAllRes  []favoriteFileRecord
}

func (m *mockRepo) Insert(_ context.Context, _ dbTX, _, _ string) error {
	return m.insertErr
}

func (m *mockRepo) Delete(_ context.Context, _ dbTX, _, _ string) error {
	return m.deleteErr
}

func (m *mockRepo) FindAllByUserID(_ context.Context, _ dbTX, _ string) ([]favoriteFileRecord, error) {
	return m.findAllRes, m.findAllErr
}

func (m *mockRepo) FindFileByID(_ context.Context, _ dbTX, _ string) error {
	return m.findFileErr
}

func (m *mockRepo) FindByUserAndFile(_ context.Context, _ dbTX, _, _ string) (bool, error) {
	return false, nil
}

type mockTx struct {
	commitCount   int
	rollbackCount int
}

func (m *mockTx) QueryRow(_ context.Context, _ string, _ ...any) pgx.Row {
	return mockRow{}
}

func (m *mockTx) Query(_ context.Context, _ string, _ ...any) (pgx.Rows, error) {
	return nil, nil
}

func (m *mockTx) Exec(_ context.Context, _ string, _ ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, nil
}

func (m *mockTx) Commit(_ context.Context) error {
	m.commitCount++
	return nil
}

func (m *mockTx) Rollback(_ context.Context) error {
	m.rollbackCount++
	return nil
}

type mockRow struct{}

func (mockRow) Scan(_ ...any) error { return nil }

func newTestService(repo RepositoryInterface) *Service {
	return &Service{
		beginTx: func(_ context.Context, _ pgx.TxOptions) (transaction, error) {
			return &mockTx{}, nil
		},
		db:   &mockTx{},
		repo: repo,
	}
}

func TestServiceAdd(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		repo := &mockRepo{findFileErr: nil}
		svc := newTestService(repo)

		err := svc.Add(context.Background(), "user-1", "file-1")
		if err != nil {
			t.Fatalf("Add returned error: %v", err)
		}
	})

	t.Run("file not found", func(t *testing.T) {
		repo := &mockRepo{findFileErr: pgx.ErrNoRows}
		svc := newTestService(repo)

		err := svc.Add(context.Background(), "user-1", "file-1")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeNotFound {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("insert error", func(t *testing.T) {
		repo := &mockRepo{
			findFileErr: nil,
			insertErr:   errors.New("db error"),
		}
		svc := newTestService(repo)

		err := svc.Add(context.Background(), "user-1", "file-1")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeInternal {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("find file db error", func(t *testing.T) {
		repo := &mockRepo{findFileErr: errors.New("connection error")}
		svc := newTestService(repo)

		err := svc.Add(context.Background(), "user-1", "file-1")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeInternal {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestServiceRemove(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		repo := &mockRepo{findFileErr: nil}
		svc := newTestService(repo)

		err := svc.Remove(context.Background(), "user-1", "file-1")
		if err != nil {
			t.Fatalf("Remove returned error: %v", err)
		}
	})

	t.Run("file not found", func(t *testing.T) {
		repo := &mockRepo{findFileErr: pgx.ErrNoRows}
		svc := newTestService(repo)

		err := svc.Remove(context.Background(), "user-1", "file-1")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeNotFound {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("delete error", func(t *testing.T) {
		repo := &mockRepo{
			findFileErr: nil,
			deleteErr:   errors.New("db error"),
		}
		svc := newTestService(repo)

		err := svc.Remove(context.Background(), "user-1", "file-1")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeInternal {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestServiceList(t *testing.T) {
	now := time.Now()

	t.Run("success", func(t *testing.T) {
		repo := &mockRepo{
			findAllRes: []favoriteFileRecord{
				{ID: "f-1", Filename: "doc.txt", Extension: "txt", MimeType: "text/plain", Size: 100, DirectoryID: "d-1", OwnerID: "user-1", CreatedAt: now, UpdatedAt: now, FavoritedAt: now},
				{ID: "f-2", Filename: "pic.png", Extension: "png", MimeType: "image/png", Size: 200, DirectoryID: "d-2", OwnerID: "user-2", CreatedAt: now, UpdatedAt: now, FavoritedAt: now},
			},
		}
		svc := newTestService(repo)

		resp, err := svc.List(context.Background(), "user-1")
		if err != nil {
			t.Fatalf("List returned error: %v", err)
		}
		if len(resp.Favorites) != 2 {
			t.Fatalf("expected 2 items, got %d", len(resp.Favorites))
		}
		if resp.Favorites[0].Filename != "doc.txt" {
			t.Fatalf("unexpected first item: %+v", resp.Favorites[0])
		}
		if resp.Favorites[1].Filename != "pic.png" {
			t.Fatalf("unexpected second item: %+v", resp.Favorites[1])
		}
	})

	t.Run("empty result", func(t *testing.T) {
		repo := &mockRepo{findAllRes: []favoriteFileRecord{}}
		svc := newTestService(repo)

		resp, err := svc.List(context.Background(), "user-1")
		if err != nil {
			t.Fatalf("List returned error: %v", err)
		}
		if len(resp.Favorites) != 0 {
			t.Fatalf("expected empty, got %d", len(resp.Favorites))
		}
	})

	t.Run("repository error", func(t *testing.T) {
		repo := &mockRepo{findAllErr: errors.New("db error")}
		svc := newTestService(repo)

		_, err := svc.List(context.Background(), "user-1")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeInternal {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}
