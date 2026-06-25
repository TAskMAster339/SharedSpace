import React, { useCallback, useEffect, useState } from 'react';
import { Trash2, Folder, File as FileIconLucide, RotateCcw } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { getTrashList, TrashItem } from '../api/trash';
import { restoreFile, permanentDeleteFile } from '../api/files';
import { restoreDirectory, permanentDeleteDirectory } from '../api/directories';
import { ApiError } from '../api/client';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { EmptyState } from '../components/ui/EmptyState';
import { formatFileSize, formatDate } from '../utils/format';

const TrashPage: React.FC = () => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const [items, setItems] = useState<TrashItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<TrashItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const loadTrash = useCallback(() => {
    if (!accessToken) return;

    setIsLoading(true);
    setError('');

    getTrashList(accessToken)
      .then((data) => setItems(data.items))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Не удалось загрузить корзину.');
      })
      .finally(() => setIsLoading(false));
  }, [accessToken]);

  useEffect(() => {
    loadTrash();
  }, [loadTrash]);

  const handleRestore = async (item: TrashItem) => {
    if (!accessToken) return;

    setRestoringId(item.id);
    try {
      if (item.type === 'directory') {
        await restoreDirectory(accessToken, item.id);
      } else {
        await restoreFile(accessToken, item.id);
      }
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось восстановить элемент.');
    } finally {
      setRestoringId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete || !accessToken) return;

    setIsDeleting(true);
    setDeleteError('');
    try {
      if (itemToDelete.type === 'directory') {
        await permanentDeleteDirectory(accessToken, itemToDelete.id);
      } else {
        await permanentDeleteFile(accessToken, itemToDelete.id);
      }
      setItems((prev) => prev.filter((i) => i.id !== itemToDelete.id));
      setItemToDelete(null);
    } catch (err) {
      setDeleteError(
        err instanceof ApiError ? err.message : 'Не удалось удалить элемент навсегда.',
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-semibold text-theme-primary mb-1">Корзина</h1>
        <p className="text-sm text-theme-muted">Удалённые файлы и папки</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Удалённые элементы</CardTitle>
        </CardHeader>

        {isLoading ? (
          <p className="text-sm text-theme-muted py-8 text-center">Загрузка...</p>
        ) : error ? (
          <p className="text-danger text-sm py-8 text-center">{error}</p>
        ) : items.length === 0 ? (
          <EmptyState icon={<Trash2 size={24} />} description="Корзина пуста." />
        ) : (
          <div className="space-y-1">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 p-3 rounded-theme-md bg-theme-tertiary border border-theme"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 bg-theme-secondary rounded-theme-sm shadow-theme-card shrink-0 text-theme-muted">
                    {item.type === 'directory' ? (
                      <Folder size={20} />
                    ) : (
                      <FileIconLucide size={20} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-theme-primary font-medium truncate">{item.name}</p>
                    <p className="text-xs text-theme-muted">
                      Удалено {formatDate(item.deleted_at)} · {formatFileSize(item.size)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleRestore(item)}
                    disabled={restoringId === item.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-theme-on-brand bg-brand hover:bg-brand-hover rounded-theme-md transition-colors disabled:opacity-50"
                  >
                    <RotateCcw size={16} />
                    Восстановить
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteError('');
                      setItemToDelete(item);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-danger hover:bg-danger-hover rounded-theme-md transition-colors"
                  >
                    <Trash2 size={16} />
                    Удалить навсегда
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <ConfirmModal
        isOpen={itemToDelete !== null}
        onClose={() => !isDeleting && setItemToDelete(null)}
        onConfirm={handleConfirmDelete}
        variant="danger"
        isConfirming={isDeleting}
        error={deleteError}
        confirmLabel="Удалить навсегда"
        title={
          <h3 className="font-medium text-theme-primary">
            Удалить «{itemToDelete?.name}» навсегда?
          </h3>
        }
        description={
          <p className="text-sm text-theme-secondary">
            Это действие невозможно отменить. Элемент будет удалён без возможности восстановления.
          </p>
        }
      />
    </div>
  );
};

export default TrashPage;
