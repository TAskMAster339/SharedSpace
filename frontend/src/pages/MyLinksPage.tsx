import React, { useCallback, useEffect, useState } from 'react';
import { Share2, Trash2, List, LayoutGrid } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useFavorites } from '../hooks/useFavorites';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { getLinks, deleteAllLinks, LinkItem } from '../api/mylinks';
import { softDeleteFile, restoreFile, renameFile, getFileContentUrl } from '../api/files';
import { softDeleteDirectory, restoreDirectory, renameDirectory } from '../api/directories';
import { ApiError } from '../api/client';
import { ViewToggle, ViewMode } from '../components/ui/ViewToggle';
import { ItemGroup } from '../components/ui/ItemGroup';
import { FolderItem } from '../components/ui/FolderItem';
import { FolderGridItem } from '../components/ui/FolderGridItem';
import { FileItem } from '../components/ui/FileItem';
import { FileGridItem } from '../components/ui/FileGridItem';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { RenameModal } from '../components/ui/RenameModal';
import { ShareLinkModal } from '../components/ui/ShareLinkModal';
import { ConvertModal } from '../components/ui/ConvertModal';
import { useFileConversion } from '../hooks/useFileConversion';
import { formatFileSize, formatDate } from '../utils/format';
import { useToastStore } from '../hooks/useToast';
import SEOHead from '../components/SEOHead';
import { resolveFileIconType } from '../utils/fileType';
import { ContextMenu } from '../components/ui/ContextMenu';

const PAGE_LIMIT = 20;

const MyLinksPage: React.FC = () => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshUser = useAuthStore((state) => state.refreshUser);
  const showToast = useToastStore((s) => s.showToast);
  const { toggleFavorite } = useFavorites();
  const { isConverting, conversionProgress, convertAndDownload, convertAndSave } =
    useFileConversion();

  const [items, setItems] = useState<LinkItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [itemsWithLinks, setItemsWithLinks] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem('directoryViewMode') as ViewMode) || 'grid';
  });

  const [convertFileData, setConvertFileData] = useState<{
    id: string;
    filename: string;
    mimeType: string;
    extension: string;
  } | null>(null);
  const [shareModalState, setShareModalState] = useState<{
    itemId: string;
    itemName: string;
    itemType: 'file' | 'directory';
  } | null>(null);
  const [renameState, setRenameState] = useState<{
    id: string;
    name: string;
    extension?: string;
    type: 'file' | 'directory';
  } | null>(null);

  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [pageMenuPos, setPageMenuPos] = useState<{ x: number; y: number } | null>(null);

  const loadLinks = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError('');
    setCursor(undefined);
    setHasMore(false);

    try {
      const data = await getLinks(accessToken, { limit: PAGE_LIMIT });
      setItems(data.items);
      setItemsWithLinks(new Set(data.items.map((i) => i.id)));
      setCursor(data.next_cursor);
      setHasMore(!!data.next_cursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить список ссылок.');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  const loadMore = useCallback(() => {
    if (!accessToken || !cursor || isLoadingMore) return;
    setIsLoadingMore(true);
    getLinks(accessToken, { limit: PAGE_LIMIT, cursor })
      .then((data) => {
        setItems((prev) => [...prev, ...data.items]);
        setCursor(data.next_cursor);
        setHasMore(!!data.next_cursor);
      })
      .catch((err) => console.error('Failed to load more links:', err))
      .finally(() => setIsLoadingMore(false));
  }, [accessToken, cursor, isLoadingMore]);

  const { sentinelRef } = useInfiniteScroll(loadMore, hasMore && !isLoadingMore);

  useEffect(() => {
    localStorage.setItem('directoryViewMode', viewMode);
  }, [viewMode]);

  const directories = items.filter((item) => item.item_type === 'directory');
  const files = items.filter((item) => item.item_type === 'file');

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  const handleToggleFavorite = async (fileId: string) => {
    if (!accessToken) return;
    const file = items.find((f) => f.id === fileId);
    const name = file?.filename || 'Файл';
    try {
      await toggleFavorite(fileId);
      showToast(`«${name}» добавлен в избранное`, 'success');
    } catch {
      showToast('Не удалось изменить избранное', 'error');
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!accessToken) return;
    const file = items.find((f) => f.id === fileId);
    const name = file?.filename || 'Файл';
    setItems((prev) => prev.filter((f) => f.id !== fileId));

    try {
      await softDeleteFile(accessToken, fileId);
      refreshUser();
      let undoing = false;
      showToast(`«${name}» перемещён в корзину`, 'undo', 'Отменить', async () => {
        if (undoing) return;
        undoing = true;
        try {
          await restoreFile(accessToken, fileId);
          if (file) setItems((prev) => [...prev, file]);
        } catch (err) {
          console.error('Failed to restore file:', err);
        }
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось удалить файл.');
      const data = await getLinks(accessToken, { limit: PAGE_LIMIT });
      setItems(data.items);
      setCursor(data.next_cursor);
      setHasMore(!!data.next_cursor);
    }
  };

  const handleDeleteDirectory = async (dirId: string) => {
    if (!accessToken) return;
    const dir = items.find((d) => d.id === dirId);
    const name = dir?.filename || 'Папка';
    setItems((prev) => prev.filter((d) => d.id !== dirId));

    try {
      await softDeleteDirectory(accessToken, dirId);
      refreshUser();
      let undoing = false;
      showToast(`«${name}» перемещена в корзину`, 'undo', 'Отменить', async () => {
        if (undoing) return;
        undoing = true;
        try {
          await restoreDirectory(accessToken, dirId);
          if (dir) setItems((prev) => [...prev, dir]);
        } catch (err) {
          console.error('Failed to restore directory:', err);
        }
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось удалить папку.');
      const data = await getLinks(accessToken, { limit: PAGE_LIMIT });
      setItems(data.items);
      setCursor(data.next_cursor);
      setHasMore(!!data.next_cursor);
    }
  };

  const handleDownload = useCallback(
    async (fileId: string) => {
      if (!accessToken) return;
      const file = items.find((f) => f.id === fileId);
      if (!file) return;
      try {
        const { url } = await getFileContentUrl(accessToken, fileId);
        const response = await fetch(url);
        const blob = await response.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = file.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(link.href), 100);
      } catch (err) {
        console.error('Ошибка скачивания:', err);
        showToast('Не удалось скачать файл', 'error');
      }
    },
    [accessToken, items, showToast],
  );

  const handleConvert = useCallback(
    (fileId: string) => {
      const file = items.find((f) => f.id === fileId);
      if (!file) return;
      setConvertFileData({
        id: file.id,
        filename: file.filename,
        mimeType: file.mime_type,
        extension: file.extension,
      });
    },
    [items],
  );

  const handleConvertAndDownload = useCallback(
    (format: string) => {
      if (!convertFileData) return Promise.reject('No file');
      return convertAndDownload(convertFileData.id, format, convertFileData.filename);
    },
    [convertFileData, convertAndDownload],
  );

  const handleConvertAndSave = useCallback(
    async (format: string) => {
      if (!convertFileData) return null;
      const resultFileId = await convertAndSave(
        convertFileData.id,
        format,
        convertFileData.filename,
      );
      loadLinks();
      return resultFileId;
    },
    [convertFileData, convertAndSave, loadLinks],
  );

  const handleRename = useCallback(
    async (newName: string) => {
      if (!accessToken || !renameState) return;
      const oldName = renameState.name;
      try {
        if (renameState.type === 'directory') {
          await renameDirectory(accessToken, renameState.id, newName);
        } else {
          await renameFile(accessToken, renameState.id, newName);
        }
        showToast(`«${oldName}» переименован в «${newName}»`, 'success');
        await loadLinks();
      } catch (err) {
        console.error('Failed to rename:', err);
      }
    },
    [accessToken, renameState, showToast, loadLinks],
  );

  const handleDeleteAllLinks = useCallback(async () => {
    if (!accessToken) return;
    setIsDeletingAll(true);
    try {
      await deleteAllLinks(accessToken);
      refreshUser();
      await loadLinks();
      showToast('Все ссылки удалены', 'success');
    } catch {
      showToast('Не удалось удалить ссылки', 'error');
    } finally {
      setIsDeletingAll(false);
      setIsDeleteAllModalOpen(false);
    }
  }, [accessToken, refreshUser, loadLinks, showToast]);

  const handlePageContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPageMenuPos({ x: e.clientX, y: e.clientY });
  }, []);

  const closePageMenu = useCallback(() => {
    setPageMenuPos(null);
  }, []);

  return (
    <div className="flex flex-col flex-1 space-y-6" onContextMenu={handlePageContextMenu}>
      <SEOHead
        title="Мои ссылки"
        description="Файлы и папки, на которые созданы публичные ссылки."
      />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-theme-primary mb-1 flex items-center gap-2">
            <Share2 size={28} className="text-green-500 shrink-0" />
            Мои ссылки
          </h1>
          <p className="text-sm text-theme-muted">Файлы и папки, на которые созданы ссылки</p>
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap sm:flex-nowrap justify-end sm:justify-start">
          <ViewToggle viewMode={viewMode} onViewModeChange={handleViewModeChange} />
          {items.length > 0 && (
            <Button
              variant="danger"
              onClick={() => setIsDeleteAllModalOpen(true)}
              className="flex items-center gap-1.5 !bg-danger !text-white hover:brightness-110 transition-all duration-200"
            >
              <Trash2 size={16} />
              <span className="hidden sm:inline">Удалить все ссылки</span>
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-theme-muted py-8 text-center">Загрузка...</p>
      ) : error ? (
        <p className="text-danger text-sm py-8 text-center">{error}</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Share2 size={24} className="text-green-500" />}
          description="Здесь появятся файлы и папки, на которые вы создали ссылки."
        />
      ) : (
        <div className="space-y-6">
          {directories.length > 0 && (
            <ItemGroup title="Папки" viewMode={viewMode}>
              {directories.map((item) =>
                viewMode === 'grid' ? (
                  <FolderGridItem
                    key={item.id}
                    id={item.id}
                    name={item.filename}
                    to={`/directories/${item.id}`}
                    hasShareLinks={itemsWithLinks.has(item.id)}
                    onRename={() =>
                      setRenameState({ id: item.id, name: item.filename, type: 'directory' })
                    }
                    onDelete={handleDeleteDirectory}
                    onShare={() =>
                      setShareModalState({
                        itemId: item.id,
                        itemName: item.filename,
                        itemType: 'directory',
                      })
                    }
                  />
                ) : (
                  <FolderItem
                    key={item.id}
                    id={item.id}
                    name={item.filename}
                    to={`/directories/${item.id}`}
                    hasShareLinks={itemsWithLinks.has(item.id)}
                    onRename={() =>
                      setRenameState({ id: item.id, name: item.filename, type: 'directory' })
                    }
                    onDelete={handleDeleteDirectory}
                    onShare={() =>
                      setShareModalState({
                        itemId: item.id,
                        itemName: item.filename,
                        itemType: 'directory',
                      })
                    }
                  />
                ),
              )}
            </ItemGroup>
          )}

          {files.length > 0 && (
            <ItemGroup title="Файлы" viewMode={viewMode}>
              {files.map((item) =>
                viewMode === 'grid' ? (
                  <FileGridItem
                    key={item.id}
                    id={item.id}
                    name={item.filename}
                    type={resolveFileIconType(item.mime_type, item.extension)}
                    to={`/files/${item.id}`}
                    isFavorite={false}
                    hasShareLinks={itemsWithLinks.has(item.id)}
                    onToggleFavorite={handleToggleFavorite}
                    onRename={() =>
                      setRenameState({
                        id: item.id,
                        name: item.filename,
                        extension: item.extension,
                        type: 'file',
                      })
                    }
                    onDelete={handleDeleteFile}
                    onDownload={handleDownload}
                    onConvert={handleConvert}
                    onShare={() =>
                      setShareModalState({
                        itemId: item.id,
                        itemName: item.filename,
                        itemType: 'file',
                      })
                    }
                  />
                ) : (
                  <FileItem
                    key={item.id}
                    id={item.id}
                    name={item.filename}
                    date={formatDate(item.link_created_at)}
                    size={formatFileSize(item.size)}
                    type={resolveFileIconType(item.mime_type, item.extension)}
                    to={`/files/${item.id}`}
                    isFavorite={false}
                    hasShareLinks={itemsWithLinks.has(item.id)}
                    onToggleFavorite={handleToggleFavorite}
                    onRename={() =>
                      setRenameState({
                        id: item.id,
                        name: item.filename,
                        extension: item.extension,
                        type: 'file',
                      })
                    }
                    onDelete={handleDeleteFile}
                    onDownload={handleDownload}
                    onConvert={handleConvert}
                    onShare={() =>
                      setShareModalState({
                        itemId: item.id,
                        itemName: item.filename,
                        itemType: 'file',
                      })
                    }
                  />
                ),
              )}
            </ItemGroup>
          )}

          {hasMore && (
            <div className="flex items-center justify-center py-2">
              {isLoadingMore ? (
                <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              ) : (
                <div ref={sentinelRef} className="h-1" />
              )}
            </div>
          )}
        </div>
      )}

      {convertFileData && (
        <ConvertModal
          key={convertFileData.id}
          isOpen={true}
          onClose={() => setConvertFileData(null)}
          fileId={convertFileData.id}
          fileName={convertFileData.filename}
          mimeType={convertFileData.mimeType}
          extension={convertFileData.extension}
          onConvertAndDownload={handleConvertAndDownload}
          onConvertAndSave={handleConvertAndSave}
          isConverting={isConverting}
          conversionProgress={conversionProgress}
        />
      )}

      {renameState && accessToken && (
        <RenameModal
          isOpen={true}
          onClose={() => setRenameState(null)}
          currentName={renameState.name}
          extension={renameState.extension}
          type={renameState.type}
          onRename={handleRename}
        />
      )}

      <div className="flex-1" />

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
                setIsDeleteAllModalOpen(true);
              }}
              className="group flex items-center gap-3 w-full px-4 py-3.5 text-base text-theme-secondary hover:bg-theme-hover transition-colors sm:px-3 sm:py-2 sm:text-sm"
            >
              <Trash2 size={18} className="group-hover:text-red-500 transition-colors" />
              Удалить все ссылки
            </button>
          )}
        </div>
      </ContextMenu>

      <ConfirmModal
        isOpen={isDeleteAllModalOpen}
        onClose={() => !isDeletingAll && setIsDeleteAllModalOpen(false)}
        onConfirm={handleDeleteAllLinks}
        variant="danger"
        confirmLabel="Удалить все"
        isConfirming={isDeletingAll}
        title={<h3 className="font-medium text-theme-primary">Удалить все ссылки?</h3>}
        description={
          <p className="text-sm text-theme-secondary">
            Все ваши ссылки будут безвозвратно удалены. Файлы и папки останутся нетронутыми.
          </p>
        }
      />

      {shareModalState && accessToken && (
        <ShareLinkModal
          isOpen={true}
          onClose={() => setShareModalState(null)}
          itemId={shareModalState.itemId}
          itemName={shareModalState.itemName}
          itemType={shareModalState.itemType}
          accessToken={accessToken}
          onLinksChanged={(hasLinks) => {
            setItemsWithLinks((prev) => {
              const next = new Set(prev);
              if (hasLinks) next.add(shareModalState.itemId);
              else next.delete(shareModalState.itemId);
              return next;
            });
          }}
        />
      )}
    </div>
  );
};

export default MyLinksPage;
