import React, { useEffect, useState } from 'react';
import { Users, Plus, X, Check, UserPlus } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import {
  getSharedWithMeStats,
  getMembers,
  SharedDirectoryWithStats,
  inviteToDirectory,
} from '../api/sharing';
import { createDirectory, getRootContents } from '../api/dirs';
import { ApiError } from '../api/client';
import { DirectoryCard } from '../components/ui/DirectoryCard';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { ContextMenu } from '../components/ui/ContextMenu';
import { QuotaIndicator } from '../components/ui/QuotaIndicator';
import { useToastStore } from '../hooks/useToast';

interface DirectoryCardData extends SharedDirectoryWithStats {
  memberUsernames: string[];
}

const AVATAR_LIMIT = 4;

function roleLabel(dir: SharedDirectoryWithStats, currentUserId: string | undefined): string {
  if (dir.owner_id === currentUserId) return 'Owner';
  if (dir.role === 'admin') return 'Admin';
  if (dir.role === 'editor') return 'Contributor';
  return 'Viewer';
}

const SharedDirListPage: React.FC = () => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const userId = useAuthStore((state) => state.user?.id);
  const sharedDirsUsed = useAuthStore((state) => state.user?.shared_dirs_count ?? 0);
  const sharedDirsQuota = useAuthStore((state) => state.user?.shared_dirs_quota ?? 0);
  const refreshUser = useAuthStore((state) => state.refreshUser);
  const atDirsLimit = sharedDirsQuota > 0 && sharedDirsUsed >= sharedDirsQuota;

  const [directories, setDirectories] = useState<DirectoryCardData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const loadDirectories = async (token: string) => {
    setIsLoading(true);
    setError('');
    try {
      const shared = await getSharedWithMeStats(token);
      const withDetails = await Promise.all(
        shared.map(async (dir) => {
          const members = await getMembers(token, dir.id, AVATAR_LIMIT).catch(() => []);
          return {
            ...dir,
            memberUsernames: members.map((m) => m.username),
          };
        }),
      );
      setDirectories(withDetails);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить директории.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!accessToken) return;
    loadDirectories(accessToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const [contextMenuDir, setContextMenuDir] = useState<{
    id: string;
    name: string;
    sharedId: string;
  } | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);

  const [inviteDir, setInviteDir] = useState<{ id: string; name: string } | null>(null);
  const [inviteUsername, setInviteUsername] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');

  const showToast = useToastStore((state) => state.showToast);

  const handleContextMenu = (e: React.MouseEvent, dir: DirectoryCardData) => {
    e.preventDefault();
    setContextMenuDir({ id: dir.directory_id, name: dir.name, sharedId: dir.id });
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  };

  const handleOpenInvite = () => {
    if (!contextMenuDir) return;
    setInviteDir({ id: contextMenuDir.sharedId, name: contextMenuDir.name });
    setInviteUsername('');
    setInviteError('');
    setContextMenuDir(null);
    setContextMenuPos(null);
  };

  const closeContextMenu = () => {
    setContextMenuDir(null);
    setContextMenuPos(null);
  };

  const handleInvite = async () => {
    if (!accessToken || !inviteDir || !inviteUsername.trim()) return;
    setIsInviting(true);
    setInviteError('');
    try {
      await inviteToDirectory(accessToken, inviteDir.id, inviteUsername.trim());
      showToast(`Приглашение отправлено: ${inviteUsername.trim()}`, 'success');
      setInviteDir(null);
      setInviteUsername('');
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : 'Не удалось отправить приглашение.');
    } finally {
      setIsInviting(false);
    }
  };

  const openModal = () => {
    setNewName('');
    setCreateError('');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setCreateError('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;

    const name = newName.trim();
    if (!name) {
      setCreateError('Введите название директории');
      return;
    }

    setIsCreating(true);
    setCreateError('');
    try {
      const root = await getRootContents(accessToken);
      await createDirectory(accessToken, { name, parent_id: root.id, shared: true });
      setIsModalOpen(false);
      await loadDirectories(accessToken);
      refreshUser();
    } catch (err) {
      setCreateError(
        err instanceof ApiError ? err.message : 'Не удалось создать директорию. Попробуйте позже.',
      );
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-theme-primary mb-1 flex items-center gap-2">
            <Users size={28} className="text-brand shrink-0" />
            Общие директории
          </h1>
          <p className="text-sm text-theme-muted mb-2">
            Сотрудничайте с командой в общих пространствах
          </p>
          <QuotaIndicator
            icon={Users}
            label="Директории"
            used={sharedDirsUsed}
            total={sharedDirsQuota}
          />
        </div>
        <Button
          onClick={openModal}
          disabled={atDirsLimit}
          title={atDirsLimit ? 'Достигнут лимит общих директорий' : undefined}
          className="flex items-center gap-1.5 shrink-0"
        >
          <Plus size={16} /> Создать
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-theme-muted py-8 text-center">Загрузка...</p>
      ) : error ? (
        <p className="text-danger text-sm py-8 text-center">{error}</p>
      ) : directories.length === 0 ? (
        <EmptyState
          icon={<Users size={24} />}
          description="У вас пока нет общих директорий."
          action={{ label: 'Создать первую', onClick: openModal }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {directories.map((dir) => (
            <DirectoryCard
              key={dir.id}
              id={dir.id}
              name={dir.name}
              role={roleLabel(dir, userId)}
              memberCount={dir.member_count}
              fileCount={dir.file_count}
              memberUsernames={dir.memberUsernames}
              to={`/directories/${dir.directory_id}`}
              onContextMenu={(e) => handleContextMenu(e, dir)}
            />
          ))}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-theme-secondary rounded-theme-xl max-w-md w-full p-6 shadow-theme-dropdown border border-theme">
            <h3 className="text-lg font-semibold text-theme-primary mb-4">
              Новая общая директория
            </h3>
            <form onSubmit={handleCreate} className="flex flex-col gap-4" noValidate>
              <div>
                <label className="text-xs font-medium text-theme-secondary mb-1.5 block">
                  Название
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Marketing Team"
                  className="w-full px-3 py-2.5 rounded-theme-md border-2 outline-none transition-colors text-sm bg-theme-tertiary text-theme-primary placeholder:text-theme-muted border-theme-hover focus:border-brand"
                />
              </div>

              {createError && <p className="text-danger text-sm">{createError}</p>}

              <div className="flex gap-3 mt-1">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={closeModal}
                  disabled={isCreating}
                  className="flex-1 flex items-center justify-center gap-1.5"
                >
                  <X size={16} /> Отмена
                </Button>
                <Button
                  type="submit"
                  disabled={isCreating}
                  className="flex-1 flex items-center justify-center gap-1.5"
                >
                  <Check size={16} /> {isCreating ? 'Создание...' : 'Создать'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ContextMenu isOpen={!!contextMenuDir} onClose={closeContextMenu} position={contextMenuPos}>
        <button
          type="button"
          onClick={handleOpenInvite}
          className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-theme-secondary hover:bg-theme-hover transition-colors group"
        >
          <UserPlus size={16} className="group-hover:text-green-500 transition-colors" />
          Пригласить
        </button>
      </ContextMenu>

      <Modal
        isOpen={inviteDir !== null}
        onClose={() => !isInviting && setInviteDir(null)}
        title={inviteDir ? `Пригласить в «${inviteDir.name}»` : ''}
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
              onClick={() => setInviteDir(null)}
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
    </div>
  );
};

export default SharedDirListPage;
