import React, { useEffect, useState } from 'react';
import { Users, Plus, X, Check } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { getSharedWithMeStats, getMembers, SharedDirectoryWithStats } from '../api/sharing';
import { createDirectory, getRootContents } from '../api/dirs';
import { ApiError } from '../api/client';
import { DirectoryCard } from '../components/ui/DirectoryCard';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { QuotaIndicator } from '../components/ui/QuotaIndicator';

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
          <h1 className="text-2xl font-semibold text-theme-primary mb-1">Общие директории</h1>
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
            />
          ))}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal} />
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
    </div>
  );
};

export default SharedDirListPage;
