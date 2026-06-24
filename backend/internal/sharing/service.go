package sharing

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"sharedspace/internal/access"
	"sharedspace/internal/apperror"
)

type Service struct {
	beginTx       beginTxFunc
	db            dbTX
	repo          RepositoryInterface
	accessChecker access.AccessChecker
}

func NewService(pool *pgxpool.Pool, repo RepositoryInterface, accessChecker access.AccessChecker) *Service {
	beginTx := func(ctx context.Context, opts pgx.TxOptions) (transaction, error) {
		tx, err := pool.BeginTx(ctx, opts)
		if err != nil {
			return nil, err
		}
		return txWrapper{Tx: tx}, nil
	}
	return &Service{
		beginTx:       beginTx,
		db:            pool,
		repo:          repo,
		accessChecker: accessChecker,
	}
}

func (s *Service) GetSharedWithMe(ctx context.Context, userID string) ([]SharedDirectoryResponse, error) {
	records, err := s.repo.FindByMember(ctx, s.db, userID)
	if err != nil {
		return nil, apperror.WrapInternal("ошибка поиска общих директорий", err)
	}

	resp := make([]SharedDirectoryResponse, 0, len(records))
	for _, r := range records {
		resp = append(resp, SharedDirectoryResponse{
			ID:          r.ID,
			DirectoryID: r.DirectoryID,
			Name:        r.Name,
			OwnerID:     r.OwnerID,
			OwnerName:   r.OwnerName,
			Role:        Role(r.Role),
			CreatedAt:   r.CreatedAt,
		})
	}
	return resp, nil
}

func (s *Service) GetSharedWithMeStats(ctx context.Context, userID string) ([]SharedDirectoryWithStatsResponse, error) {
	records, err := s.repo.FindByMemberWithStats(ctx, s.db, userID)
	if err != nil {
		return nil, apperror.WrapInternal("ошибка поиска общих директорий со статистикой", err)
	}

	resp := make([]SharedDirectoryWithStatsResponse, 0, len(records))
	for _, r := range records {
		resp = append(resp, SharedDirectoryWithStatsResponse{
			ID:          r.ID,
			DirectoryID: r.DirectoryID,
			Name:        r.Name,
			OwnerID:     r.OwnerID,
			OwnerName:   r.OwnerName,
			Role:        Role(r.Role),
			MemberCount: r.MemberCount,
			FileCount:   r.FileCount,
			CreatedAt:   r.CreatedAt,
		})
	}
	return resp, nil
}

func (s *Service) GetMembers(ctx context.Context, userID, sharedDirID string) ([]MemberResponse, error) {
	sd, err := s.repo.FindByID(ctx, s.db, sharedDirID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperror.NotFound("общая директория не найдена")
		}
		return nil, apperror.WrapInternal("ошибка поиска общей директории", err)
	}

	ok, err := s.accessChecker.Can(ctx, userID, sd.DirectoryID, access.ActionView)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, apperror.Forbidden("доступ запрещён")
	}

	members, err := s.repo.FindMembers(ctx, s.db, sharedDirID)
	if err != nil {
		return nil, apperror.WrapInternal("ошибка поиска участников", err)
	}

	return toMemberResponses(members), nil
}

func (s *Service) Invite(ctx context.Context, userID, sharedDirID, username string) (*InvitationResponse, error) {
	sd, err := s.repo.FindByID(ctx, s.db, sharedDirID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperror.NotFound("общая директория не найдена")
		}
		return nil, apperror.WrapInternal("ошибка поиска общей директории", err)
	}

	canInvite := sd.OwnerID == userID
	if !canInvite {
		members, err := s.repo.FindMembers(ctx, s.db, sharedDirID)
		if err != nil {
			return nil, apperror.WrapInternal("ошибка поиска участников", err)
		}
		for _, m := range members {
			if m.UserID == userID && m.Role == string(RoleAdmin) {
				canInvite = true
				break
			}
		}
	}
	if !canInvite {
		return nil, apperror.Forbidden("только владелец или администратор может приглашать")
	}

	invitedUserID, err := s.repo.FindUserByUsername(ctx, s.db, username)
	if err != nil {
		return nil, apperror.NotFound("пользователь не найден")
	}

	isMember, err := s.repo.IsMember(ctx, s.db, sharedDirID, invitedUserID)
	if err != nil {
		return nil, apperror.WrapInternal("ошибка проверки членства", err)
	}
	if isMember {
		return nil, apperror.Conflict("пользователь уже является участником")
	}

	rec, err := s.repo.CreateInvitation(ctx, s.db, sharedDirID, invitedUserID, userID, string(RoleViewer))
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, apperror.Conflict("приглашение этому пользователю уже отправлено")
		}
		return nil, apperror.WrapInternal("ошибка создания приглашения", err)
	}

	return &InvitationResponse{
		ID:                rec.ID,
		SharedDirectoryID: rec.SharedDirectoryID,
		DirectoryName:     sd.Name,
		InvitedByUserID:   userID,
		InvitedByUsername: sd.OwnerName,
		Role:              RoleViewer,
		Status:            InvitationPending,
		CreatedAt:         rec.CreatedAt,
	}, nil
}

func (s *Service) GetMyInvitations(ctx context.Context, userID string) ([]InvitationResponse, error) {
	records, err := s.repo.FindInvitationsByUser(ctx, s.db, userID)
	if err != nil {
		return nil, apperror.WrapInternal("ошибка поиска приглашений", err)
	}

	resp := make([]InvitationResponse, 0, len(records))
	for _, r := range records {
		resp = append(resp, InvitationResponse{
			ID:                r.ID,
			SharedDirectoryID: r.SharedDirectoryID,
			DirectoryName:     r.DirectoryName,
			InvitedByUserID:   r.InvitedByUserID,
			InvitedByUsername: r.InvitedByUsername,
			Role:              Role(r.Role),
			Status:            InvitationStatus(r.Status),
			CreatedAt:         r.CreatedAt,
		})
	}
	return resp, nil
}

func (s *Service) AcceptInvitation(ctx context.Context, userID, invitationID string) error {
	inv, err := s.repo.FindInvitationByID(ctx, s.db, invitationID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperror.NotFound("приглашение не найдено")
		}
		return apperror.WrapInternal("ошибка поиска приглашения", err)
	}

	if inv.InvitedUserID != userID {
		return apperror.Forbidden("нельзя принять чужое приглашение")
	}

	if inv.Status != string(InvitationPending) {
		return apperror.Conflict("приглашение уже обработано")
	}

	tx, err := s.beginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return apperror.WrapInternal("ошибка создания транзакции", err)
	}
	defer tx.Rollback(ctx)

	if err := s.repo.AddMember(ctx, tx, inv.SharedDirectoryID, userID, inv.Role); err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return apperror.Conflict("вы уже являетесь участником")
		}
		return apperror.WrapInternal("ошибка добавления участника", err)
	}

	if err := s.repo.UpdateInvitationStatus(ctx, tx, invitationID, string(InvitationAccepted)); err != nil {
		return apperror.WrapInternal("ошибка обновления статуса приглашения", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return apperror.WrapInternal("ошибка подтверждения транзакции", err)
	}

	return nil
}

func (s *Service) DeclineInvitation(ctx context.Context, userID, invitationID string) error {
	inv, err := s.repo.FindInvitationByID(ctx, s.db, invitationID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperror.NotFound("приглашение не найдено")
		}
		return apperror.WrapInternal("ошибка поиска приглашения", err)
	}

	if inv.InvitedUserID != userID {
		return apperror.Forbidden("нельзя отклонить чужое приглашение")
	}

	if inv.Status != string(InvitationPending) {
		return apperror.Conflict("приглашение уже обработано")
	}

	if err := s.repo.UpdateInvitationStatus(ctx, s.db, invitationID, string(InvitationDeclined)); err != nil {
		return apperror.WrapInternal("ошибка обновления статуса приглашения", err)
	}

	return nil
}

func (s *Service) RemoveInvitation(ctx context.Context, userID, invitationID string) error {
	inv, err := s.repo.FindInvitationByID(ctx, s.db, invitationID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperror.NotFound("приглашение не найдено")
		}
		return apperror.WrapInternal("ошибка поиска приглашения", err)
	}

	sd, err := s.repo.FindByID(ctx, s.db, inv.SharedDirectoryID)
	if err != nil {
		return apperror.WrapInternal("ошибка поиска общей директории", err)
	}

	if inv.InvitedByUserID != userID && sd.OwnerID != userID {
		return apperror.Forbidden("нельзя отозвать это приглашение")
	}

	if err := s.repo.UpdateInvitationStatus(ctx, s.db, invitationID, string(InvitationRevoked)); err != nil {
		return apperror.WrapInternal("ошибка отзыва приглашения", err)
	}

	return nil
}

func toMemberResponses(records []memberRecord) []MemberResponse {
	resp := make([]MemberResponse, 0, len(records))
	for _, m := range records {
		resp = append(resp, MemberResponse{
			ID:       m.ID,
			UserID:   m.UserID,
			Username: m.Username,
			Role:     Role(m.Role),
			JoinedAt: m.JoinedAt,
		})
	}
	return resp
}

func (s *Service) ChangeRole(ctx context.Context, userID, sharedDirID, targetUserID, newRole string) (*MemberResponse, error) {
	sd, err := s.repo.FindByID(ctx, s.db, sharedDirID)
	if err != nil {
		if isNotFound(err) {
			return nil, apperror.NotFound("общая директория не найдена")
		}
		return nil, apperror.WrapInternal("ошибка поиска общей директории", err)
	}

	ok, err := s.accessChecker.Can(ctx, userID, sd.DirectoryID, access.ActionChangeRole)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, apperror.Forbidden("доступ запрещён")
	}

	member, err := s.repo.FindMember(ctx, s.db, sharedDirID, targetUserID)
	if err != nil {
		if isNotFound(err) {
			return nil, apperror.NotFound("участник не найден")
		}
		return nil, apperror.WrapInternal("ошибка поиска участника", err)
	}

	if err := s.repo.UpdateMemberRole(ctx, s.db, sharedDirID, targetUserID, newRole); err != nil {
		return nil, apperror.WrapInternal("ошибка обновления роли", err)
	}

	return &MemberResponse{
		ID:       member.ID,
		UserID:   member.UserID,
		Username: member.Username,
		Role:     Role(newRole),
		JoinedAt: member.JoinedAt,
	}, nil
}

func (s *Service) RemoveMember(ctx context.Context, userID, sharedDirID, targetUserID string) error {
	sd, err := s.repo.FindByID(ctx, s.db, sharedDirID)
	if err != nil {
		if isNotFound(err) {
			return apperror.NotFound("общая директория не найдена")
		}
		return apperror.WrapInternal("ошибка поиска общей директории", err)
	}

	ok, err := s.accessChecker.Can(ctx, userID, sd.DirectoryID, access.ActionRemoveMember)
	if err != nil {
		return err
	}
	if !ok {
		return apperror.Forbidden("доступ запрещён")
	}

	if targetUserID == sd.OwnerID {
		return apperror.Forbidden("нельзя удалить владельца общей директории")
	}

	_, err = s.repo.FindMember(ctx, s.db, sharedDirID, targetUserID)
	if err != nil {
		if isNotFound(err) {
			return apperror.NotFound("участник не найден")
		}
		return apperror.WrapInternal("ошибка поиска участника", err)
	}

	if err := s.repo.RemoveMember(ctx, s.db, sharedDirID, targetUserID); err != nil {
		return apperror.WrapInternal("ошибка удаления участника", err)
	}

	return nil
}

func isNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}
