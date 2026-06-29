import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2, Folder, File as FileIconLucide, RotateCcw } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { getTrashList, TrashItem, TrashPaginationParams } from '../api/trash';
import { restoreFile, permanentDeleteFile } from '../api/files';
import { restoreDirectory, permanentDeleteDirectory } from '../api/directories';
import { ApiError } from '../api/client';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { EmptyState } from '../components/ui/EmptyState';
import { formatFileSize, formatDate } from '../utils/format';

const PAGE_LIMIT = 20;

const TrashPage: React.FC = () => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const [items, setItems] = useState<TrashItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<TrashItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Pagination — автозагрузка при скролле
  const [filesCursor, setFilesCursor] = useState<string | undefined>();
  const [dirsCursor, setDirsCursor] = useState<string | undefined>();
  const [hasMoreFiles, setHasMoreFiles] = useState(false);
  const [hasMoreDirs, setHasMoreDirs] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadTrash = useCallback(async (pagination?: TrashPaginationParams, append = false) => {
    if (!accessToken) return;

    if (!append) {
      setIsLoading(true);
      setError('');
    }

    try {
      const data = await getTrashList(accessToken, pagination);
      if (append) {
        setItems((prev) => [...prev, ...data.items]);
      } else {
        setItems(data.items);
      }
      setFilesCursor(data.next_files_cursor);
      setDirsCursor(data.next_dirs_cursor);
      setHasMoreFiles(!!data.next_files_cursor);
      setHasMoreDirs(!!data.next_dirs_cursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить корзину.');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [accessToken]);

  useEffect(() => {
    loadTrash();
  }, [loadTrash]);

  // Автозагрузка при скролле
  const checkAndLoad = useCallback(() => {
    if (!accessToken || isLoadingMore) return;
    if (!hasMoreFiles && !hasMoreDirs) return;

    const el = sentinelRef.current;
    if (el && el.getBoundingClientRect().top < window.innerHeight + 300) {
      setIsLoadingMore(true);
      loadTrash(
        {
          files_limit: PAGE_LIMIT,
          files_cursor: filesCursor,
          dirs_limit: PAGE_LIMIT,
          dirs_cursor: dirsCursor,
        },
        true
      );
    }
  }, [accessToken, filesCursor, dirsCursor, hasMoreFiles, hasMoreDirs, isLoadingMore, loadTrash]);

  useEffect(() => {
    checkAndLoad();
    window.addEventListener('scroll', checkAndLoad, { passive: true });
    window.addEventListener('resize', checkAndLoad, { passive: true });
    return () => {
      window.removeEventListener('scroll', checkAndLoad);
      window.removeEventListener('resize', checkAndLoad);
    };
  }, [checkAndLoad]);

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

  // Separate files and directories for display
  const files = items.filter((item) => item.type === 'file');
  const directories = items.filter((item) => item.type === 'directory');

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
          <div className="space-y-6">
            {/* Directories */}
            {directories.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-theme-secondary mb-3">Папки</h3>
                <div className="space-y-1">
                  {directories.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-3 p-3 rounded-theme-md bg-theme-tertiary border border-theme sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 bg-theme-secondary rounded-theme-sm shadow-theme-card shrink-0 text-theme-muted">
                          <Folder size={20} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm text-theme-primary font-medium truncate">{item.name}</p>
                          <p className="text-xs text-theme-muted">
                            Удалено {formatDate(item.deleted_at)} · {formatFileSize(item.size)}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:shrink-0">
                        <button
                          type="button"
                          onClick={() => handleRestore(item)}
                          disabled={restoringId === item.id}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-theme-on-brand bg-brand hover:bg-brand-hover rounded-theme-md transition-colors disabled:opacity-50 sm:py-1.5"
                        >
                          <RotateCcw size={16} className="shrink-0" />
                          Восстановить
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError('');
                            setItemToDelete(item);
                          }}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-danger hover:bg-danger-hover rounded-theme-md transition-colors sm:py-1.5"
                        >
                          <Trash2 size={16} className="shrink-0" />
                          Удалить навсегда
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Files */}
            {files.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-theme-secondary mb-3">Файлы</h3>
                <div className="space-y-1">
                  {files.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-3 p-3 rounded-theme-md bg-theme-tertiary border border-theme sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 bg-theme-secondary rounded-theme-sm shadow-theme-card shrink-0 text-theme-muted">
                          <FileIconLucide size={20} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm text-theme-primary font-medium truncate">{item.name}</p>
                          <p className="text-xs text-theme-muted">
                            Удалено {formatDate(item.deleted_at)} · {formatFileSize(item.size)}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:shrink-0">
                        <button
                          type="button"
                          onClick={() => handleRestore(item)}
                          disabled={restoringId === item.id}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-theme-on-brand bg-brand hover:bg-brand-hover rounded-theme-md transition-colors disabled:opacity-50 sm:py-1.5"
                        >
                          <RotateCcw size={16} className="shrink-0" />
                          Восстановить
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError('');
                            setItemToDelete(item);
                          }}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-danger hover:bg-danger-hover rounded-theme-md transition-colors sm:py-1.5"
                        >
                          <Trash2 size={16} className="shrink-0" />
                          Удалить навсегда
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pagination sentinel */}
            {(hasMoreFiles || hasMoreDirs) && (
              <div className="flex items-center justify-center py-2">
                {isLoadingMore ? (
                  <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                ) : (
                  <div ref={sentinelRef} className="h-2" />
                )}
              </div>
            )}
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
