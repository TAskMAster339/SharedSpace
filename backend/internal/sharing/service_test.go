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
	findByMemberResult          []sharedDirectoryRecord
	findByMemberErr             error
	findByMemberWithStatsResult []sharedDirectoryWithStatsRecord
	findByMemberWithStatsErr    error
	findMembersResult           []memberRecord
	findMembersErr              error
	findByIDResult              sharedDirectoryRecord
	findByIDErr                 error
	findUserByUsernameID        string
	findUserByUsernameErr       error
	isMemberResult              bool
	isMemberErr                 error
	createInvitationResult      invitationRecord
	createInvitationErr         error
	findInvitationsResult       []invitationRecord
	findInvitationsErr          error
	findInvitationResult        invitationRecord
	findInvitationErr           error
	updateInvitationErr         error
	addMemberErr                error
	findMemberResult            memberRecord
	findMemberErr               error
	updateMemberRoleErr         error
	removeMemberErr             error
	getUserSharedDirsResult     []SharedDirectoryResponse
	getUserSharedDirsErr        error
}

func (m *mockRepo) FindByMember(_ context.Context, _ dbTX, _ string, _ int) ([]sharedDirectoryRecord, error) {
	return m.findByMemberResult, m.findByMemberErr
}

func (m *mockRepo) FindByMemberWithStats(_ context.Context, _ dbTX, _ string) ([]sharedDirectoryWithStatsRecord, error) {
	return m.findByMemberWithStatsResult, m.findByMemberWithStatsErr
}

func (m *mockRepo) FindMembers(_ context.Context, _ dbTX, _ string, _ int) ([]memberRecord, error) {
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

func (m *mockRepo) FindUserByUsername(_ context.Context, _ dbTX, _ string) (string, error) {
	return m.findUserByUsernameID, m.findUserByUsernameErr
}

func (m *mockRepo) IsMember(_ context.Context, _ dbTX, _, _ string) (bool, error) {
	return m.isMemberResult, m.isMemberErr
}

func (m *mockRepo) CreateInvitation(_ context.Context, _ dbTX, _, _, _, _ string) (invitationRecord, error) {
	return m.createInvitationResult, m.createInvitationErr
}

func (m *mockRepo) FindInvitationsByUser(_ context.Context, _ dbTX, _ string, _ ...string) ([]invitationRecord, error) {
	return m.findInvitationsResult, m.findInvitationsErr
}

func (m *mockRepo) FindInvitationByID(_ context.Context, _ dbTX, _ string) (invitationRecord, error) {
	return m.findInvitationResult, m.findInvitationErr
}

func (m *mockRepo) UpdateInvitationStatus(_ context.Context, _ dbTX, _, _ string) error {
	return m.updateInvitationErr
}

func (m *mockRepo) AddMember(_ context.Context, _ dbTX, _, _, _ string) error {
	return m.addMemberErr
}

func (m *mockRepo) FindMember(_ context.Context, _ dbTX, _, _ string) (memberRecord, error) {
	return m.findMemberResult, m.findMemberErr
}

func (m *mockRepo) UpdateMemberRole(_ context.Context, _ dbTX, _, _, _ string) error {
	return m.updateMemberRoleErr
}

func (m *mockRepo) RemoveMember(_ context.Context, _ dbTX, _, _ string) error {
	return m.removeMemberErr
}

func (m *mockRepo) GetUserSharedDirectories(_ context.Context, _ dbTX, _ string, _ int) ([]SharedDirectoryResponse, error) {
	return m.getUserSharedDirsResult, m.getUserSharedDirsErr
}

type mockTX struct{}

func (mockTX) QueryRow(_ context.Context, _ string, _ ...any) pgx.Row        { return nil }
func (mockTX) Query(_ context.Context, _ string, _ ...any) (pgx.Rows, error) { return nil, nil }
func (mockTX) Exec(_ context.Context, _ string, _ ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, nil
}
func (mockTX) Commit(_ context.Context) error   { return nil }
func (mockTX) Rollback(_ context.Context) error { return nil }

type mockAccessChecker struct {
	canFn            func(ctx context.Context, userID, directoryID string, action access.Action) (bool, error)
	getPermissionsFn func(ctx context.Context, userID, directoryID string) (*access.Permissions, error)
}

func (m *mockAccessChecker) Can(ctx context.Context, userID, directoryID string, action access.Action) (bool, error) {
	return m.canFn(ctx, userID, directoryID, action)
}

func (m *mockAccessChecker) GetPermissions(ctx context.Context, userID, directoryID string) (*access.Permissions, error) {
	if m.getPermissionsFn != nil {
		return m.getPermissionsFn(ctx, userID, directoryID)
	}
	return &access.Permissions{}, nil
}

func newTestService(repo RepositoryInterface) *Service {
	return &Service{
		beginTx:       func(_ context.Context, _ pgx.TxOptions) (transaction, error) { return mockTX{}, nil },
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

		resp, err := svc.GetSharedWithMe(context.Background(), "user-1", 0)
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

		resp, err := svc.GetSharedWithMe(context.Background(), "user-1", 0)
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

		_, err := svc.GetSharedWithMe(context.Background(), "user-1", 0)
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

		resp, err := svc.GetMembers(context.Background(), "user-1", "s-1", 0)
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

		resp, err := svc.GetMembers(context.Background(), "user-1", "s-1", 0)
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

		_, err := svc.GetMembers(context.Background(), "user-1", "s-1", 0)
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

		_, err := svc.GetMembers(context.Background(), "user-1", "missing", 0)
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeNotFound {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestServiceInvite(t *testing.T) {
	t.Run("success as owner", func(t *testing.T) {
		repo := &mockRepo{
			findByIDResult:       sharedDirectoryRecord{ID: "s-1", DirectoryID: "d-1", OwnerID: "user-1", Name: "photos", OwnerName: "alice"},
			findUserByUsernameID: "user-2",
			isMemberResult:       false,
			createInvitationResult: invitationRecord{
				ID: "inv-1", SharedDirectoryID: "s-1", InvitedUserID: "user-2",
				InvitedByUserID: "user-1", Role: "viewer", Status: "pending",
			},
		}
		svc := newTestService(repo)

		resp, err := svc.Invite(context.Background(), "user-1", "s-1", "bob")
		if err != nil {
			t.Fatalf("Invite returned error: %v", err)
		}
		if resp.Role != RoleViewer || resp.Status != InvitationPending {
			t.Fatalf("unexpected response: %+v", resp)
		}
	})

	t.Run("not found shared directory", func(t *testing.T) {
		repo := &mockRepo{findByIDErr: pgx.ErrNoRows}
		svc := newTestService(repo)

		_, err := svc.Invite(context.Background(), "user-1", "missing", "bob")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeNotFound {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("forbidden for non-admin member", func(t *testing.T) {
		repo := &mockRepo{
			findByIDResult: sharedDirectoryRecord{ID: "s-1", DirectoryID: "d-1", OwnerID: "user-2"},
		}
		svc := newTestService(repo)
		svc.accessChecker = &mockAccessChecker{canFn: func(_ context.Context, _, _ string, _ access.Action) (bool, error) {
			return false, nil
		}}

		_, err := svc.Invite(context.Background(), "user-1", "s-1", "bob")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeForbidden {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("user not found", func(t *testing.T) {
		repo := &mockRepo{
			findByIDResult:        sharedDirectoryRecord{ID: "s-1", DirectoryID: "d-1", OwnerID: "user-1"},
			findUserByUsernameID:  "",
			findUserByUsernameErr: pgx.ErrNoRows,
		}
		svc := newTestService(repo)

		_, err := svc.Invite(context.Background(), "user-1", "s-1", "unknown")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeNotFound {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("already a member", func(t *testing.T) {
		repo := &mockRepo{
			findByIDResult:       sharedDirectoryRecord{ID: "s-1", DirectoryID: "d-1", OwnerID: "user-1"},
			findUserByUsernameID: "user-2",
			isMemberResult:       true,
		}
		svc := newTestService(repo)

		_, err := svc.Invite(context.Background(), "user-1", "s-1", "bob")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeConflict {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestServiceGetMyInvitations(t *testing.T) {
	now := time.Now()

	t.Run("success", func(t *testing.T) {
		repo := &mockRepo{
			findInvitationsResult: []invitationRecord{
				{ID: "inv-1", SharedDirectoryID: "s-1", DirectoryName: "photos",
					InvitedUserID: "user-1", InvitedByUserID: "user-2",
					InvitedByUsername: "ivan", Role: "viewer", Status: "pending", CreatedAt: now},
			},
		}
		svc := newTestService(repo)

		resp, err := svc.GetMyInvitations(context.Background(), "user-1")
		if err != nil {
			t.Fatalf("GetMyInvitations returned error: %v", err)
		}
		if len(resp) != 1 || resp[0].ID != "inv-1" || resp[0].Role != RoleViewer {
			t.Fatalf("unexpected response: %+v", resp)
		}
	})

	t.Run("empty result", func(t *testing.T) {
		repo := &mockRepo{findInvitationsResult: []invitationRecord{}}
		svc := newTestService(repo)

		resp, err := svc.GetMyInvitations(context.Background(), "user-1")
		if err != nil {
			t.Fatalf("GetMyInvitations returned error: %v", err)
		}
		if len(resp) != 0 {
			t.Fatalf("expected empty, got %d", len(resp))
		}
	})

	t.Run("repository error", func(t *testing.T) {
		repo := &mockRepo{findInvitationsErr: errors.New("db error")}
		svc := newTestService(repo)

		_, err := svc.GetMyInvitations(context.Background(), "user-1")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeInternal {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestServiceAcceptInvitation(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		repo := &mockRepo{
			findInvitationResult: invitationRecord{
				ID: "inv-1", SharedDirectoryID: "s-1", InvitedUserID: "user-1",
				Role: "viewer", Status: "pending",
			},
		}
		svc := newTestService(repo)

		err := svc.AcceptInvitation(context.Background(), "user-1", "inv-1")
		if err != nil {
			t.Fatalf("AcceptInvitation returned error: %v", err)
		}
	})

	t.Run("not found", func(t *testing.T) {
		repo := &mockRepo{findInvitationErr: pgx.ErrNoRows}
		svc := newTestService(repo)

		err := svc.AcceptInvitation(context.Background(), "user-1", "missing")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeNotFound {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("not the invited user", func(t *testing.T) {
		repo := &mockRepo{
			findInvitationResult: invitationRecord{
				ID: "inv-1", InvitedUserID: "user-2", Status: "pending",
			},
		}
		svc := newTestService(repo)

		err := svc.AcceptInvitation(context.Background(), "user-1", "inv-1")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeForbidden {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("already processed", func(t *testing.T) {
		repo := &mockRepo{
			findInvitationResult: invitationRecord{
				ID: "inv-1", InvitedUserID: "user-1", Status: "accepted",
			},
		}
		svc := newTestService(repo)

		err := svc.AcceptInvitation(context.Background(), "user-1", "inv-1")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeConflict {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestServiceDeclineInvitation(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		repo := &mockRepo{
			findInvitationResult: invitationRecord{
				ID: "inv-1", InvitedUserID: "user-1", Status: "pending",
			},
		}
		svc := newTestService(repo)

		err := svc.DeclineInvitation(context.Background(), "user-1", "inv-1")
		if err != nil {
			t.Fatalf("DeclineInvitation returned error: %v", err)
		}
	})

	t.Run("not the invited user", func(t *testing.T) {
		repo := &mockRepo{
			findInvitationResult: invitationRecord{
				ID: "inv-1", InvitedUserID: "user-2", Status: "pending",
			},
		}
		svc := newTestService(repo)

		err := svc.DeclineInvitation(context.Background(), "user-1", "inv-1")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeForbidden {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("already processed", func(t *testing.T) {
		repo := &mockRepo{
			findInvitationResult: invitationRecord{
				ID: "inv-1", InvitedUserID: "user-1", Status: "declined",
			},
		}
		svc := newTestService(repo)

		err := svc.DeclineInvitation(context.Background(), "user-1", "inv-1")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeConflict {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestServiceRemoveInvitation(t *testing.T) {
	t.Run("success as inviter", func(t *testing.T) {
		now := time.Now()
		repo := &mockRepo{
			findInvitationResult: invitationRecord{
				ID: "inv-1", SharedDirectoryID: "s-1", InvitedUserID: "user-2",
				InvitedByUserID: "user-1", Status: "pending", CreatedAt: now,
			},
			findByIDResult: sharedDirectoryRecord{ID: "s-1", OwnerID: "user-3"},
		}
		svc := newTestService(repo)

		err := svc.RemoveInvitation(context.Background(), "user-1", "inv-1")
		if err != nil {
			t.Fatalf("RemoveInvitation returned error: %v", err)
		}
	})

	t.Run("success as owner", func(t *testing.T) {
		now := time.Now()
		repo := &mockRepo{
			findInvitationResult: invitationRecord{
				ID: "inv-1", SharedDirectoryID: "s-1", InvitedUserID: "user-2",
				InvitedByUserID: "user-3", Status: "pending", CreatedAt: now,
			},
			findByIDResult: sharedDirectoryRecord{ID: "s-1", OwnerID: "user-1"},
		}
		svc := newTestService(repo)

		err := svc.RemoveInvitation(context.Background(), "user-1", "inv-1")
		if err != nil {
			t.Fatalf("RemoveInvitation returned error: %v", err)
		}
	})

	t.Run("forbidden for unrelated user", func(t *testing.T) {
		repo := &mockRepo{
			findInvitationResult: invitationRecord{
				ID: "inv-1", SharedDirectoryID: "s-1", InvitedByUserID: "user-2",
			},
			findByIDResult: sharedDirectoryRecord{ID: "s-1", DirectoryID: "d-1", OwnerID: "user-3"},
		}
		svc := newTestService(repo)
		svc.accessChecker = &mockAccessChecker{canFn: func(_ context.Context, _, _ string, _ access.Action) (bool, error) {
			return false, nil
		}}

		err := svc.RemoveInvitation(context.Background(), "user-1", "inv-1")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeForbidden {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("not found", func(t *testing.T) {
		repo := &mockRepo{findInvitationErr: pgx.ErrNoRows}
		svc := newTestService(repo)

		err := svc.RemoveInvitation(context.Background(), "user-1", "missing")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeNotFound {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestServiceChangeRole(t *testing.T) {
	now := time.Now()

	t.Run("success", func(t *testing.T) {
		repo := &mockRepo{
			findByIDResult: sharedDirectoryRecord{ID: "s-1", DirectoryID: "d-1", OwnerID: "user-1"},
			findMemberResult: memberRecord{
				ID: "m-2", UserID: "user-2", Username: "bob", Role: "viewer", JoinedAt: now,
			},
		}
		svc := newTestService(repo)

		resp, err := svc.ChangeRole(context.Background(), "user-1", "s-1", "user-2", "editor")
		if err != nil {
			t.Fatalf("ChangeRole returned error: %v", err)
		}
		if resp.Role != RoleEditor || resp.UserID != "user-2" || resp.Username != "bob" {
			t.Fatalf("unexpected response: %+v", resp)
		}
	})

	t.Run("shared directory not found", func(t *testing.T) {
		repo := &mockRepo{findByIDErr: pgx.ErrNoRows}
		svc := newTestService(repo)

		_, err := svc.ChangeRole(context.Background(), "user-1", "missing", "user-2", "editor")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeNotFound {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("forbidden for contributor", func(t *testing.T) {
		repo := &mockRepo{
			findByIDResult: sharedDirectoryRecord{ID: "s-1", DirectoryID: "d-1", OwnerID: "user-2"},
		}
		svc := newTestService(repo)
		svc.accessChecker = &mockAccessChecker{canFn: func(_ context.Context, _, _ string, _ access.Action) (bool, error) {
			return false, nil
		}}

		_, err := svc.ChangeRole(context.Background(), "user-1", "s-1", "user-2", "editor")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeForbidden {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("member not found", func(t *testing.T) {
		repo := &mockRepo{
			findByIDResult: sharedDirectoryRecord{ID: "s-1", DirectoryID: "d-1", OwnerID: "user-1"},
			findMemberErr:  pgx.ErrNoRows,
		}
		svc := newTestService(repo)

		_, err := svc.ChangeRole(context.Background(), "user-1", "s-1", "user-3", "editor")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeNotFound {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestServiceRemoveMember(t *testing.T) {
	now := time.Now()

	t.Run("success", func(t *testing.T) {
		repo := &mockRepo{
			findByIDResult: sharedDirectoryRecord{ID: "s-1", DirectoryID: "d-1", OwnerID: "user-1"},
			findMemberResult: memberRecord{
				ID: "m-2", UserID: "user-2", Username: "bob", Role: "viewer", JoinedAt: now,
			},
		}
		svc := newTestService(repo)

		err := svc.RemoveMember(context.Background(), "user-1", "s-1", "user-2")
		if err != nil {
			t.Fatalf("RemoveMember returned error: %v", err)
		}
	})

	t.Run("shared directory not found", func(t *testing.T) {
		repo := &mockRepo{findByIDErr: pgx.ErrNoRows}
		svc := newTestService(repo)

		err := svc.RemoveMember(context.Background(), "user-1", "missing", "user-2")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeNotFound {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("forbidden for contributor", func(t *testing.T) {
		repo := &mockRepo{
			findByIDResult: sharedDirectoryRecord{ID: "s-1", DirectoryID: "d-1", OwnerID: "user-2"},
		}
		svc := newTestService(repo)
		svc.accessChecker = &mockAccessChecker{canFn: func(_ context.Context, _, _ string, _ access.Action) (bool, error) {
			return false, nil
		}}

		err := svc.RemoveMember(context.Background(), "user-1", "s-1", "user-2")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeForbidden {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("forbidden to remove owner", func(t *testing.T) {
		repo := &mockRepo{
			findByIDResult: sharedDirectoryRecord{ID: "s-1", DirectoryID: "d-1", OwnerID: "user-1"},
		}
		svc := newTestService(repo)

		err := svc.RemoveMember(context.Background(), "user-1", "s-1", "user-1")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeForbidden {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("member not found", func(t *testing.T) {
		repo := &mockRepo{
			findByIDResult: sharedDirectoryRecord{ID: "s-1", DirectoryID: "d-1", OwnerID: "user-1"},
			findMemberErr:  pgx.ErrNoRows,
		}
		svc := newTestService(repo)

		err := svc.RemoveMember(context.Background(), "user-1", "s-1", "user-3")
		if err == nil {
			t.Fatal("expected error")
		}
		appErr, ok := apperror.From(err)
		if !ok || appErr.Code() != apperror.CodeNotFound {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}
