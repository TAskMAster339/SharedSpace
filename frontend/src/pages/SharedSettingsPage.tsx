import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, UserPlus, Trash2, Users } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import {
  getSharedWithMeStats,
  getMembers,
  inviteToDirectory,
  changeMemberRole,
  removeMember,
  Member,
  SharingRole,
} from '../api/sharing';
import { softDeleteDirectory } from '../api/directories';
import { ApiError } from '../api/client';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { EmptyState } from '../components/ui/EmptyState';
import { useToastStore } from '../hooks/useToast';
import { formatDateLong } from '../utils/format';

const ROLE_LABELS: Record<SharingRole, string> = {
  viewer: 'Просмотр',
  editor: 'Редактор',
  admin: 'Администратор',
};

const ROLE_OPTIONS: SharingRole[] = ['viewer', 'editor', 'admin'];

const SharedSettingsPage: React.FC = () => {
  const { id: directoryId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);
  const currentUser = useAuthStore((s) => s.user);
  const showToast = useToastStore((s) => s.showToast);

  const [sharedDirId, setSharedDirId] = useState<string | null>(null);
  const [dirName, setDirName] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [currentUserRole, setCurrentUserRole] = useState<SharingRole | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Приглашение
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteUsername, setInviteUsername] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');

  // Удаление директории
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Идёт смена роли / удаление участника
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  const canManage = currentUserRole === 'admin';

  const load = useCallback(async () => {
    if (!accessToken || !directoryId) return;

    setIsLoading(true);
    setError('');
    try {
      const dirs = await getSharedWithMeStats(accessToken);
      const sd = dirs.find((d) => d.directory_id === directoryId);
      if (!sd) {
        setError('Директория не найдена или у вас нет к ней доступа.');
        return;
      }

      setSharedDirId(sd.id);
      setDirName(sd.name);
      setOwnerId(sd.owner_id);
      setCurrentUserRole(sd.role as SharingRole);

      const memberList = await getMembers(accessToken, sd.id);
      setMembers(memberList);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить данные директории.');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, directoryId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleInvite = async () => {
    if (!accessToken || !sharedDirId || !inviteUsername.trim()) return;

    setIsInviting(true);
    setInviteError('');
    try {
      await inviteToDirectory(accessToken, sharedDirId, inviteUsername.trim());
      showToast(`Приглашение отправлено: ${inviteUsername.trim()}`, 'success');
      setIsInviteOpen(false);
      setInviteUsername('');
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : 'Не удалось отправить приглашение.');
    } finally {
      setIsInviting(false);
    }
  };

  const handleChangeRole = async (member: Member, role: SharingRole) => {
    if (!accessToken || !sharedDirId || role === member.role) return;

    const prevRole = member.role;
    setPendingUserId(member.user_id);
    // Оптимистичное обновление
    setMembers((prev) => prev.map((m) => (m.user_id === member.user_id ? { ...m, role } : m)));

    try {
      await changeMemberRole(accessToken, sharedDirId, member.user_id, role);
      showToast(`Роль обновлена: ${member.username} → ${ROLE_LABELS[role]}`, 'success');
    } catch (err) {
      setMembers((prev) =>
        prev.map((m) => (m.user_id === member.user_id ? { ...m, role: prevRole } : m)),
      );
      showToast(err instanceof ApiError ? err.message : 'Не удалось изменить роль.', 'error');
    } finally {
      setPendingUserId(null);
    }
  };

  const handleRemoveMember = async (member: Member) => {
    if (!accessToken || !sharedDirId) return;

    setPendingUserId(member.user_id);
    try {
      await removeMember(accessToken, sharedDirId, member.user_id);
      setMembers((prev) => prev.filter((m) => m.user_id !== member.user_id));
      showToast(`Участник удалён: ${member.username}`, 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Не удалось удалить участника.', 'error');
    } finally {
      setPendingUserId(null);
    }
  };

  const handleDeleteDirectory = async () => {
    if (!accessToken || !directoryId) return;

    setIsDeleting(true);
    setDeleteError('');
    try {
      await softDeleteDirectory(accessToken, directoryId);
      showToast(`«${dirName}» перемещена в корзину`, 'success');
      navigate('/directories');
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Не удалось удалить директорию.');
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 pb-10">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-sm text-theme-secondary hover:text-theme-primary transition-colors"
        >
          <ArrowLeft size={16} />
          Назад
        </button>
        <p className="text-danger text-sm py-8 text-center">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <button
        onClick={() => navigate(`/directories/${directoryId}`)}
        className="inline-flex items-center gap-2 text-sm text-theme-secondary hover:text-theme-primary transition-colors"
      >
        <ArrowLeft size={16} />
        Назад к директории
      </button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-theme-primary mb-1 break-words">
            Настройки директории
          </h1>
          <p className="text-sm text-theme-muted truncate">«{dirName}»</p>
        </div>

        {canManage && (
          <button
            onClick={() => {
              setInviteError('');
              setInviteUsername('');
              setIsInviteOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-brand text-theme-on-brand rounded-theme-md hover:bg-brand-hover transition-colors text-sm font-medium shrink-0"
          >
            <UserPlus size={16} />
            Пригласить человека
          </button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Участники</CardTitle>
          <Badge>{members.length}</Badge>
        </CardHeader>

        {members.length === 0 ? (
          <EmptyState
            icon={<Users size={24} />}
            description="В этой директории пока нет участников."
          />
        ) : (
          <div className="space-y-2">
            {members.map((member) => {
              const isSelf = member.user_id === currentUser?.id;
              const isOwnerMember = member.user_id === ownerId;
              const canEdit = canManage && !isSelf && !isOwnerMember;
              const isPending = pendingUserId === member.user_id;

              return (
                <div
                  key={member.user_id}
                  className="flex flex-col gap-3 p-3 rounded-theme-md bg-theme-tertiary border border-theme sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar username={member.username} className="w-10 h-10 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-theme-primary truncate">
                        {member.username}
                        {isSelf && <span className="text-theme-muted font-normal"> (вы)</span>}
                        {isOwnerMember && (
                          <span className="text-theme-muted font-normal"> · создатель</span>
                        )}
                      </p>
                      <p className="text-xs text-theme-muted">
                        В директории с {formatDateLong(member.joined_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:shrink-0">
                    {canEdit ? (
                      <select
                        value={member.role}
                        disabled={isPending}
                        onChange={(e) => handleChangeRole(member, e.target.value as SharingRole)}
                        className="flex-1 sm:flex-none text-sm rounded-theme-md border border-theme bg-theme-secondary text-theme-primary px-2 py-1.5 outline-none focus:border-brand transition-colors disabled:opacity-50"
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Badge>{ROLE_LABELS[member.role]}</Badge>
                    )}

                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(member)}
                        disabled={isPending}
                        aria-label="Удалить участника"
                        title="Удалить участника"
                        className="p-2 rounded-theme-md text-theme-muted hover:text-danger hover:bg-danger-light transition-colors disabled:opacity-50"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Опасная зона</CardTitle>
          </CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-theme-primary">Удалить директорию</p>
              <p className="text-xs text-theme-muted">
                Директория будет перемещена в корзину. Это действие можно отменить из корзины.
              </p>
            </div>
            <button
              onClick={() => {
                setDeleteError('');
                setIsDeleteOpen(true);
              }}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-danger hover:bg-danger-hover rounded-theme-md transition-colors shrink-0"
            >
              <Trash2 size={16} />
              Удалить директорию
            </button>
          </div>
        </Card>
      )}

      {/* Модалка приглашения */}
      <Modal
        isOpen={isInviteOpen}
        onClose={() => !isInviting && setIsInviteOpen(false)}
        title="Пригласить человека"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-theme-secondary mb-1.5 block">
              Имя пользователя
            </label>
            <input
              type="text"
              value={inviteUsername}
              onChange={(e) => setInviteUsername(e.target.value)}
              placeholder="Введите username..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleInvite();
              }}
              className="w-full px-3 py-2.5 rounded-theme-md border-2 border-theme-hover bg-theme-tertiary text-theme-primary placeholder:text-theme-muted outline-none focus:border-brand transition-colors text-sm"
            />
          </div>

          <p className="text-xs text-theme-muted">
            Пользователь будет приглашён с ролью «Просмотр». Изменить роль можно после того, как он
            примет приглашение.
          </p>

          {inviteError && <p className="text-danger text-sm">{inviteError}</p>}

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setIsInviteOpen(false)}
              disabled={isInviting}
              className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-theme bg-theme-secondary text-theme-secondary hover:text-theme-primary hover:bg-theme-hover rounded-theme-md transition-colors text-sm font-medium disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              onClick={handleInvite}
              disabled={!inviteUsername.trim() || isInviting}
              className="flex-1 inline-flex items-center justify-center px-4 py-2 bg-brand text-theme-on-brand hover:bg-brand-hover rounded-theme-md transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isInviting ? 'Отправка...' : 'Пригласить'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Подтверждение удаления директории */}
      <ConfirmModal
        isOpen={isDeleteOpen}
        onClose={() => !isDeleting && setIsDeleteOpen(false)}
        onConfirm={handleDeleteDirectory}
        variant="danger"
        isConfirming={isDeleting}
        error={deleteError}
        confirmLabel="Удалить директорию"
        title={<h3 className="font-medium text-theme-primary break-words">Удалить «{dirName}»?</h3>}
        description={
          <p className="text-sm text-theme-secondary">
            Директория будет перемещена в корзину вместе с содержимым. Восстановить её можно из
            корзины.
          </p>
        }
      />
    </div>
  );
};

export default SharedSettingsPage;
