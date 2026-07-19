import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Link2, Pencil, Trash2 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import {
  getDirectoryById,
  getDirectoryPath,
  renameDirectory,
  softDeleteDirectory,
  Directory,
} from '../api/directories';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { RenameModal } from '../components/ui/RenameModal';
import { ShareLinkModal } from '../components/ui/ShareLinkModal';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { useToastStore } from '../hooks/useToast';
import SEOHead from '../components/SEOHead';

const FolderSettingsPage: React.FC = () => {
  const { id: directoryId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const showToast = useToastStore((s) => s.showToast);

  const [directory, setDirectory] = useState<Directory | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const load = useCallback(async () => {
    if (!accessToken || !directoryId) return;

    setIsLoading(true);
    setError('');
    try {
      const [dir, pathResult] = await Promise.all([
        getDirectoryById(accessToken, directoryId),
        getDirectoryPath(accessToken, directoryId),
      ]);

      if (dir.type === 'root') {
        setError('Настройки личного хранилища недоступны.');
        return;
      }

      const path = pathResult.path;
      const parent = path.length > 1 ? path[path.length - 2].id : dir.parent_id;

      setDirectory(dir);
      setParentId(parent || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить настройки папки.');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, directoryId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRename = async (newName: string) => {
    if (!accessToken || !directory) return;

    const oldName = directory.name;
    const updated = await renameDirectory(accessToken, directory.id, newName);
    setDirectory(updated);
    showToast(`Папка «${oldName}» переименована в «${newName}»`, 'success');
  };

  const handleDelete = async () => {
    if (!accessToken || !directory) return;

    setIsDeleting(true);
    setDeleteError('');
    try {
      await softDeleteDirectory(accessToken, directory.id);
      refreshUser();
      showToast(`«${directory.name}» перемещена в корзину`, 'success');
      navigate(parentId ? `/directories/${parentId}` : '/directories');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Не удалось удалить папку.');
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <SEOHead title="Настройки папки" description="Загрузка..." />
        <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !directory) {
    return (
      <div className="space-y-6">
        <SEOHead title="Настройки папки" description={error || 'Папка не найдена.'} />
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-sm text-theme-secondary hover:text-theme-primary transition-colors"
        >
          <ArrowLeft size={16} />
          Назад
        </button>
        <p className="text-danger text-sm py-8 text-center">{error || 'Папка не найдена.'}</p>
      </div>
    );
  }

  const canRename = Boolean(directory.permissions?.rename);
  const canDelete = Boolean(
    directory.permissions?.delete_directory ?? directory.permissions?.delete,
  );

  return (
    <div className="space-y-6">
      <SEOHead
        title={directory?.name ? `Настройки — ${directory.name}` : 'Настройки папки'}
        description={`Управление настройками папки — ${directory?.name || 'папка'}.`}
      />
      <button
        onClick={() => navigate(`/directories/${directory.id}`)}
        className="inline-flex items-center gap-2 text-sm text-theme-secondary hover:text-theme-primary transition-colors"
      >
        <ArrowLeft size={16} />
        Назад к папке
      </button>

      <div className="min-w-0">
        <h1 className="text-2xl font-semibold text-theme-primary mb-1 break-words">
          Настройки папки
        </h1>
        <p className="text-sm text-theme-muted truncate">«{directory.name}»</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Действия</CardTitle>
        </CardHeader>

        <div className="divide-y divide-theme">
          {canRename && (
            <button
              type="button"
              onClick={() => setIsRenameOpen(true)}
              className="flex w-full items-center justify-between gap-4 py-4 text-left group"
            >
              <span>
                <span className="block text-sm font-medium text-theme-primary">
                  Переименовать папку
                </span>
                <span className="block text-xs text-theme-muted">
                  Изменить название, которое видно в списке папок.
                </span>
              </span>
              <Pencil size={18} className="shrink-0 text-theme-muted group-hover:text-brand" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsShareOpen(true)}
            className="flex w-full items-center justify-between gap-4 py-4 text-left group"
          >
            <span>
              <span className="block text-sm font-medium text-theme-primary">
                Создать общую ссылку
              </span>
              <span className="block text-xs text-theme-muted">
                Управлять публичными ссылками на эту папку.
              </span>
            </span>
            <Link2 size={18} className="shrink-0 text-theme-muted group-hover:text-green-500" />
          </button>
        </div>
      </Card>

      {canDelete && (
        <Card>
          <CardHeader>
            <CardTitle>Опасная зона</CardTitle>
          </CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-theme-primary">Удалить папку</p>
              <p className="text-xs text-theme-muted">
                Папка будет перемещена в корзину вместе с содержимым.
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
              Удалить папку
            </button>
          </div>
        </Card>
      )}

      <RenameModal
        isOpen={isRenameOpen}
        onClose={() => setIsRenameOpen(false)}
        currentName={directory.name}
        type="directory"
        onRename={handleRename}
      />

      {accessToken && (
        <ShareLinkModal
          isOpen={isShareOpen}
          onClose={() => setIsShareOpen(false)}
          itemId={directory.id}
          itemName={directory.name}
          itemType="directory"
          accessToken={accessToken}
          onLinksChanged={(hasLinks) =>
            setDirectory((prev) => (prev ? { ...prev, has_share_links: hasLinks } : prev))
          }
        />
      )}

      <ConfirmModal
        isOpen={isDeleteOpen}
        onClose={() => !isDeleting && setIsDeleteOpen(false)}
        onConfirm={handleDelete}
        variant="danger"
        isConfirming={isDeleting}
        error={deleteError}
        confirmLabel="Удалить папку"
        title={
          <h3 className="font-medium text-theme-primary break-words">
            Удалить «{directory.name}»?
          </h3>
        }
        description={
          <p className="text-sm text-theme-secondary">
            Папка будет перемещена в корзину вместе с содержимым. Восстановить её можно из корзины.
          </p>
        }
      />
    </div>
  );
};

export default FolderSettingsPage;
