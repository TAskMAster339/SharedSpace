package sharing

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"sharedspace/internal/access"
	"sharedspace/internal/apperror"
)

type mockRepo struct {
	findByMemberResult []sharedDirectoryRecord
	findByMemberErr    error
	findMembersResult  []memberRecord
	findMembersErr     error
	findByIDResult     sharedDirectoryRecord
	findByIDErr        error
}

func (m *mockRepo) FindByMember(_ context.Context, _ dbTX, _ string) ([]sharedDirectoryRecord, error) {
	return m.findByMemberResult, m.findByMemberErr
}

func (m *mockRepo) FindMembers(_ context.Context, _ dbTX, _ string) ([]memberRecord, error) {
	return m.findMembersResult, m.findMembersErr
}

func (m *mockRepo) FindByID(_ context.Context, _ dbTX, _ string) (sharedDirectoryRecord, error) {
	return m.findByIDResult, m.findByIDErr
}

func (m *mockRepo) CreateShared(_ context.Context, _ interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}, _, _ string) error {
	return nil
}

type mockTX struct{}

func (mockTX) QueryRow(_ context.Context, _ string, _ ...any) pgx.Row        { return nil }
func (mockTX) Query(_ context.Context, _ string, _ ...any) (pgx.Rows, error) { return nil, nil }
func (mockTX) Exec(_ context.Context, _ string, _ ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, nil
}

type mockAccessChecker struct {
	canFn func(ctx context.Context, userID, directoryID string, action access.Action) (bool, error)
}

func (m *mockAccessChecker) Can(ctx context.Context, userID, directoryID string, action access.Action) (bool, error) {
	return m.canFn(ctx, userID, directoryID, action)
}

func newTestService(repo RepositoryInterface) *Service {
	return &Service{
		beginTx:       func(_ context.Context, _ pgx.TxOptions) (transaction, error) { return nil, nil },
		db:            mockTX{},
		repo:          repo,
		accessChecker: &mockAccessChecker{canFn: func(_ context.Context, _, _ string, _ access.Action) (bool, error) { return true, nil }},
	}
}

func TestServiceGetSharedWithMe(t *testing.T) {
	now := time.Now()

	t.Run("success", func(t *testing.T) {
		repo := &mockRepo{
			findByMemberResult: []sharedDirectoryRecord{
				{ID: "s-1", DirectoryID: "d-1", OwnerID: "user-2", Name: "photos", OwnerName: "ivan", Role: "admin", CreatedAt: now},
				{ID: "s-2", DirectoryID: "d-2", OwnerID: "user-3", Name: "docs", OwnerName: "petr", Role: "viewer", CreatedAt: now},
			},
		}
		svc := newTestService(repo)

		resp, err := svc.GetSharedWithMe(context.Background(), "user-1")
		if err != nil {
			t.Fatalf("GetSharedWithMe returned error: %v", err)
		}
		if len(resp) != 2 {
			t.Fatalf("expected 2 items, got %d", len(resp))
		}
		if resp[0].Name != "photos" || resp[0].Role != RoleAdmin {
			t.Fatalf("unexpected first item: %+v", resp[0])
		}
		if resp[1].Name != "docs" || resp[1].Role != RoleViewer {
			t.Fatalf("unexpected second item: %+v", resp[1])
		}
	})

	t.Run("empty result", func(t *testing.T) {
		repo := &mockRepo{findByMemberResult: []sharedDirectoryRecord{}}
		svc := newTestService(repo)

		resp, err := svc.GetSharedWithMe(context.Background(), "user-1")
		if err != nil {
			t.Fatalf("GetSharedWithMe returned error: %v", err)
		}
		if len(resp) != 0 {
			t.Fatalf("expected empty, got %d", len(resp))
		}
	})

	t.Run("repository error", func(t *testing.T) {
		repo := &mockRepo{findByMemberErr: errors.New("db error")}
		svc := newTestService(repo)

		_, err := svc.GetSharedWithMe(context.Background(), "user-1")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeInternal {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestServiceGetMembers(t *testing.T) {
	now := time.Now()

	t.Run("success as owner", func(t *testing.T) {
		repo := &mockRepo{
			findByIDResult: sharedDirectoryRecord{ID: "s-1", DirectoryID: "d-1", OwnerID: "user-1"},
			findMembersResult: []memberRecord{
				{ID: "m-1", UserID: "user-1", Username: "alice", Role: "admin", JoinedAt: now},
				{ID: "m-2", UserID: "user-2", Username: "bob", Role: "viewer", JoinedAt: now},
			},
		}
		svc := newTestService(repo)

		resp, err := svc.GetMembers(context.Background(), "user-1", "s-1")
		if err != nil {
			t.Fatalf("GetMembers returned error: %v", err)
		}
		if len(resp) != 2 {
			t.Fatalf("expected 2 members, got %d", len(resp))
		}
		if resp[0].Username != "alice" || resp[0].Role != RoleAdmin {
			t.Fatalf("unexpected first member: %+v", resp[0])
		}
		if resp[1].Username != "bob" || resp[1].Role != RoleViewer {
			t.Fatalf("unexpected second member: %+v", resp[1])
		}
	})

	t.Run("success as member", func(t *testing.T) {
		repo := &mockRepo{
			findByIDResult: sharedDirectoryRecord{ID: "s-1", DirectoryID: "d-1", OwnerID: "user-2"},
			findMembersResult: []memberRecord{
				{ID: "m-1", UserID: "user-1", Username: "alice", Role: "editor", JoinedAt: now},
				{ID: "m-2", UserID: "user-2", Username: "ivan", Role: "admin", JoinedAt: now},
			},
		}
		svc := newTestService(repo)

		resp, err := svc.GetMembers(context.Background(), "user-1", "s-1")
		if err != nil {
			t.Fatalf("GetMembers returned error: %v", err)
		}
		if len(resp) != 2 {
			t.Fatalf("expected 2 members, got %d", len(resp))
		}
		if resp[0].Role != RoleEditor {
			t.Fatalf("expected editor role, got %s", resp[0].Role)
		}
	})

	t.Run("forbidden for non-member", func(t *testing.T) {
		repo := &mockRepo{
			findByIDResult: sharedDirectoryRecord{ID: "s-1", DirectoryID: "d-1", OwnerID: "user-2"},
			findMembersResult: []memberRecord{
				{ID: "m-1", UserID: "user-2", Username: "ivan", Role: "admin", JoinedAt: now},
			},
		}
		svc := newTestService(repo)
		svc.accessChecker = &mockAccessChecker{canFn: func(_ context.Context, _, _ string, _ access.Action) (bool, error) { return false, nil }}

		_, err := svc.GetMembers(context.Background(), "user-1", "s-1")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeForbidden {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("not found", func(t *testing.T) {
		repo := &mockRepo{findByIDErr: pgx.ErrNoRows}
		svc := newTestService(repo)

		_, err := svc.GetMembers(context.Background(), "user-1", "missing")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeNotFound {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}
