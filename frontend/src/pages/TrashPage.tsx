import React, { useCallback, useEffect, useState } from 'react';
import { Trash2, Folder, File, RotateCcw, MoreVertical, List, LayoutGrid } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { getTrashList, clearAllTrash, TrashItem, TrashPaginationParams } from '../api/trash';
import { restoreFile, permanentDeleteFile } from '../api/files';
import { restoreDirectory, permanentDeleteDirectory } from '../api/directories';
import { ApiError } from '../api/client';
import { Button } from '../components/ui/Button';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { ContextMenu } from '../components/ui/ContextMenu';
import { EmptyState } from '../components/ui/EmptyState';
import { ViewToggle, ViewMode } from '../components/ui/ViewToggle';
import { ItemGroup } from '../components/ui/ItemGroup';
import { useToastStore } from '../hooks/useToast';
import SEOHead from '../components/SEOHead';
import { formatFileSize, formatDate } from '../utils/format';

const PAGE_LIMIT = 20;

const MENU_WIDTH = 216;
const GAP = 4;

const TrashPage: React.FC = () => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshUser = useAuthStore((state) => state.refreshUser);
  const [items, setItems] = useState<TrashItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [itemToDelete, setItemToDelete] = useState<TrashItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [isClearAllOpen, setIsClearAllOpen] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [clearAllError, setClearAllError] = useState('');

  const [filesCursor, setFilesCursor] = useState<string | undefined>();
  const [dirsCursor, setDirsCursor] = useState<string | undefined>();
  const [hasMoreFiles, setHasMoreFiles] = useState(false);
  const [hasMoreDirs, setHasMoreDirs] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem('directoryViewMode') as ViewMode) || 'grid';
  });

  const showToast = useToastStore((state) => state.showToast);

  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [pageMenuPos, setPageMenuPos] = useState<{ x: number; y: number } | null>(null);

  const loadTrash = useCallback(
    async (pagination?: TrashPaginationParams, append = false) => {
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
    },
    [accessToken],
  );

  useEffect(() => {
    loadTrash({
      files_limit: PAGE_LIMIT,
      dirs_limit: PAGE_LIMIT,
    });
  }, [loadTrash]);

  const loadMore = useCallback(() => {
    if (!accessToken || isLoadingMore) return;
    if (!hasMoreFiles && !hasMoreDirs) return;

    setIsLoadingMore(true);
    loadTrash(
      {
        files_limit: PAGE_LIMIT,
        files_cursor: filesCursor,
        dirs_limit: PAGE_LIMIT,
        dirs_cursor: dirsCursor,
      },
      true,
    );
  }, [accessToken, filesCursor, dirsCursor, hasMoreFiles, hasMoreDirs, isLoadingMore, loadTrash]);

  const { sentinelRef } = useInfiniteScroll(
    loadMore,
    (hasMoreFiles || hasMoreDirs) && !isLoadingMore,
  );

  useEffect(() => {
    localStorage.setItem('directoryViewMode', viewMode);
  }, [viewMode]);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  const handleRestore = async (item: TrashItem) => {
    if (!accessToken) return;

    try {
      if (item.type === 'directory') {
        await restoreDirectory(accessToken, item.id);
      } else {
        await restoreFile(accessToken, item.id);
      }
      refreshUser();
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      const label = item.type === 'directory' ? 'Папка' : 'Файл';
      const restored = item.type === 'directory' ? 'восстановлена' : 'восстановлен';
      showToast(`${label} «${item.name}» ${restored}`, 'success');
    } catch (err) {
      showToast(
        err instanceof ApiError ? err.message : 'Не удалось восстановить элемент.',
        'error',
      );
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
      refreshUser();
      const label = itemToDelete.type === 'directory' ? 'Папка' : 'Файл';
      const deleted = itemToDelete.type === 'directory' ? 'удалена' : 'удален';
      showToast(`${label} «${itemToDelete.name}» ${deleted}`, 'success');
      setItemToDelete(null);
    } catch (err) {
      setDeleteError(
        err instanceof ApiError ? err.message : 'Не удалось удалить элемент навсегда.',
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const closeMenu = useCallback(() => {
    setActiveMenuId(null);
    setMenuPosition(null);
  }, []);

  const handlePageContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveMenuId(null);
    setMenuPosition(null);
    setPageMenuPos({ x: e.clientX, y: e.clientY });
  }, []);

  const closePageMenu = useCallback(() => {
    setPageMenuPos(null);
  }, []);

  const handleClearAll = async () => {
    if (!accessToken) return;

    setIsClearingAll(true);
    setClearAllError('');
    try {
      await clearAllTrash(accessToken);
      setItems([]);
      refreshUser();
      setIsClearAllOpen(false);
      showToast('Корзина очищена', 'success');
    } catch (err) {
      setClearAllError(err instanceof ApiError ? err.message : 'Не удалось очистить корзину.');
    } finally {
      setIsClearingAll(false);
    }
  };

  const handleMenuClick = (e: React.MouseEvent<HTMLButtonElement>, itemId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (activeMenuId === itemId) {
      closeMenu();
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setActiveMenuId(itemId);
    setMenuPosition({ x: rect.right - MENU_WIDTH, y: rect.bottom + GAP });
  };

  const handleItemClick = (e: React.MouseEvent, itemId: string) => {
    setActiveMenuId(itemId);
    setMenuPosition({ x: e.clientX, y: e.clientY });
  };

  const handleContextMenu = (e: React.MouseEvent, itemId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveMenuId(itemId);
    setMenuPosition({ x: e.clientX, y: e.clientY });
  };

  const files = items.filter((item) => item.type === 'file');
  const directories = items.filter((item) => item.type === 'directory');
  const activeItem = activeMenuId ? items.find((i) => i.id === activeMenuId) : null;

  return (
    <div
      className="flex flex-col min-h-[calc(100vh-12rem)] space-y-6 pb-10"
      onContextMenu={handlePageContextMenu}
    >
      <SEOHead title="Корзина" description="Удалённые файлы и папки." />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-theme-primary mb-1 flex items-center gap-2">
            <Trash2 size={28} className="text-red-500 shrink-0" />
            Корзина
          </h1>
          <p className="text-sm text-theme-muted">Удалённые файлы и папки</p>
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap sm:flex-nowrap justify-end sm:justify-start">
          <ViewToggle viewMode={viewMode} onViewModeChange={handleViewModeChange} />
          {items.length > 0 && (
            <Button
              variant="danger"
              onClick={() => {
                setClearAllError('');
                setIsClearAllOpen(true);
              }}
              className="flex items-center gap-1.5 !bg-danger !text-white hover:brightness-110 transition-all duration-200"
            >
              <Trash2 size={16} />
              <span className="hidden sm:inline">Очистить корзину</span>
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-theme-muted py-8 text-center">Загрузка...</p>
      ) : error ? (
        <p className="text-danger text-sm py-8 text-center">{error}</p>
      ) : items.length === 0 ? (
        <EmptyState icon={<Trash2 size={24} />} description="Корзина пуста." />
      ) : (
        <div className="space-y-6">
          {directories.length > 0 && (
            <ItemGroup title="Папки" viewMode={viewMode}>
              {directories.map((item) =>
                viewMode === 'grid' ? (
                  <div
                    key={item.id}
                    onContextMenu={(e) => handleContextMenu(e, item.id)}
                    className="group flex flex-col items-center p-3 rounded-theme-md transition-colors cursor-pointer relative min-w-0 bg-theme-tertiary hover:bg-theme-hover border border-theme"
                  >
                    <div className="w-16 h-16 flex items-center justify-center text-theme-muted group-hover:text-brand transition-colors">
                      <Folder size={40} strokeWidth={1.5} />
                    </div>
                    <p className="text-sm text-theme-primary font-medium text-center mt-2 truncate w-full max-w-[120px]">
                      {item.name}
                    </p>
                    <button
                      type="button"
                      aria-label="Открыть меню действий"
                      aria-haspopup="menu"
                      aria-expanded={activeMenuId === item.id}
                      onClick={(e) => handleMenuClick(e, item.id)}
                      className="absolute top-2 right-2 p-1 rounded-theme-sm text-theme-muted hover:text-theme-primary hover:bg-theme-hover transition-colors "
                    >
                      <MoreVertical size={16} />
                    </button>
                  </div>
                ) : (
                  <div
                    key={item.id}
                    onClick={(e) => handleItemClick(e, item.id)}
                    onContextMenu={(e) => handleContextMenu(e, item.id)}
                    className="group flex items-center gap-3 p-3 rounded-theme-md bg-theme-tertiary border border-theme hover:bg-theme-hover transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="p-2 bg-theme-secondary rounded-theme-sm shadow-theme-card shrink-0 text-theme-muted group-hover:text-brand transition-colors">
                        <Folder size={20} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-theme-primary font-medium truncate">
                          {item.name}
                        </p>
                        <p className="text-xs text-theme-muted">
                          Удалено {formatDate(item.deleted_at)} · {formatFileSize(item.size)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label="Открыть меню действий"
                      aria-haspopup="menu"
                      aria-expanded={activeMenuId === item.id}
                      onClick={(e) => handleMenuClick(e, item.id)}
                      className="p-2 -m-1 rounded-theme-sm text-theme-muted hover:text-theme-primary hover:bg-theme-hover transition-colors shrink-0"
                    >
                      <MoreVertical size={18} />
                    </button>
                  </div>
                ),
              )}
            </ItemGroup>
          )}

          {files.length > 0 && (
            <ItemGroup title="Файлы" viewMode={viewMode}>
              {files.map((item) =>
                viewMode === 'grid' ? (
                  <div
                    key={item.id}
                    onContextMenu={(e) => handleContextMenu(e, item.id)}
                    className="group flex flex-col items-center p-3 rounded-theme-md transition-colors cursor-pointer relative min-w-0 bg-theme-tertiary hover:bg-theme-hover border border-theme"
                  >
                    <div className="w-16 h-16 flex items-center justify-center text-theme-muted group-hover:text-brand transition-colors">
                      <File size={40} strokeWidth={1.5} />
                    </div>
                    <p className="text-sm text-theme-primary font-medium text-center mt-2 truncate w-full max-w-[120px]">
                      {item.name}
                    </p>
                    <button
                      type="button"
                      aria-label="Открыть меню действий"
                      aria-haspopup="menu"
                      aria-expanded={activeMenuId === item.id}
                      onClick={(e) => handleMenuClick(e, item.id)}
                      className="absolute top-2 right-2 p-1 rounded-theme-sm text-theme-muted hover:text-theme-primary hover:bg-theme-hover transition-colors "
                    >
                      <MoreVertical size={16} />
                    </button>
                  </div>
                ) : (
                  <div
                    key={item.id}
                    onClick={(e) => handleItemClick(e, item.id)}
                    onContextMenu={(e) => handleContextMenu(e, item.id)}
                    className="group flex items-center gap-3 p-3 rounded-theme-md bg-theme-tertiary border border-theme hover:bg-theme-hover transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="p-2 bg-theme-secondary rounded-theme-sm shadow-theme-card shrink-0 text-theme-muted group-hover:text-brand transition-colors">
                        <File size={20} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-theme-primary font-medium truncate">
                          {item.name}
                        </p>
                        <p className="text-xs text-theme-muted">
                          Удалено {formatDate(item.deleted_at)} · {formatFileSize(item.size)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label="Открыть меню действий"
                      aria-haspopup="menu"
                      aria-expanded={activeMenuId === item.id}
                      onClick={(e) => handleMenuClick(e, item.id)}
                      className="p-2 -m-1 rounded-theme-sm text-theme-muted hover:text-theme-primary hover:bg-theme-hover transition-colors shrink-0"
                    >
                      <MoreVertical size={18} />
                    </button>
                  </div>
                ),
              )}
            </ItemGroup>
          )}

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

      <div className="flex-1" />

      <ContextMenu
        isOpen={activeMenuId !== null && menuPosition !== null}
        onClose={closeMenu}
        position={menuPosition}
        width={MENU_WIDTH}
      >
        {activeItem && (
          <div>
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                closeMenu();
                handleRestore(activeItem);
              }}
              className="group flex items-center gap-3 w-full px-4 py-3.5 text-base text-theme-secondary hover:bg-theme-hover transition-colors sm:px-3 sm:py-2 sm:text-sm"
            >
              <RotateCcw size={18} className="group-hover:text-brand transition-colors" />
              Восстановить
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                closeMenu();
                setDeleteError('');
                setItemToDelete(activeItem);
              }}
              className="group flex items-center gap-3 w-full px-4 py-3.5 text-base text-theme-secondary hover:bg-theme-hover transition-colors sm:px-3 sm:py-2 sm:text-sm"
            >
              <Trash2 size={18} className="group-hover:text-red-500 transition-colors" />
              Удалить навсегда
            </button>
          </div>
        )}
      </ContextMenu>

      <ContextMenu isOpen={!!pageMenuPos} onClose={closePageMenu} position={pageMenuPos}>
        <div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              handleViewModeChange(viewMode === 'grid' ? 'list' : 'grid');
              closePageMenu();
            }}
            className="group flex items-center gap-3 w-full px-4 py-3.5 text-base text-theme-secondary hover:bg-theme-hover transition-colors sm:px-3 sm:py-2 sm:text-sm"
          >
            {viewMode === 'grid' ? (
              <List size={18} className="group-hover:text-brand transition-colors sm:size-4" />
            ) : (
              <LayoutGrid
                size={18}
                className="group-hover:text-brand transition-colors sm:size-4"
              />
            )}
            Сменить вид
          </button>
          {items.length > 0 && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                closePageMenu();
                setClearAllError('');
                setIsClearAllOpen(true);
              }}
              className="group flex items-center gap-3 w-full px-4 py-3.5 text-base text-theme-secondary hover:bg-theme-hover transition-colors sm:px-3 sm:py-2 sm:text-sm"
            >
              <Trash2 size={18} className="group-hover:text-red-500 transition-colors" />
              Очистить корзину
            </button>
          )}
        </div>
      </ContextMenu>

      <ConfirmModal
        isOpen={itemToDelete !== null}
        onClose={() => !isDeleting && setItemToDelete(null)}
        onConfirm={handleConfirmDelete}
        variant="danger"
        isConfirming={isDeleting}
        error={deleteError}
        confirmLabel="Удалить"
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

      <ConfirmModal
        isOpen={isClearAllOpen}
        onClose={() => !isClearingAll && setIsClearAllOpen(false)}
        onConfirm={handleClearAll}
        variant="danger"
        isConfirming={isClearingAll}
        error={clearAllError}
        confirmLabel="Очистить"
        title={<h3 className="font-medium text-theme-primary">Очистить корзину?</h3>}
        description={
          <p className="text-sm text-theme-secondary">
            Все файлы и папки будут безвозвратно удалены. Это действие невозможно отменить.
          </p>
        }
      />
    </div>
  );
};

export default TrashPage;
