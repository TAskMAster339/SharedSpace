import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Link2, Folder, ExternalLink, Power, PowerOff } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useFavorites } from '../hooks/useFavorites';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { getLinks, LinkItem } from '../api/mylinks';
import { softDeleteFile, restoreFile, renameFile, getFileContentUrl } from '../api/files';
import { softDeleteDirectory, restoreDirectory, renameDirectory } from '../api/directories';
import { ApiError } from '../api/client';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { FileItem } from '../components/ui/FileItem';
import { ItemActionsMenu } from '../components/ui/ItemActionsMenu';
import { EmptyState } from '../components/ui/EmptyState';
import { RenameModal } from '../components/ui/RenameModal';
import { ShareLinkModal } from '../components/ui/ShareLinkModal';
import { ConvertModal } from '../components/ui/ConvertModal';
import { useFileConversion } from '../hooks/useFileConversion';
import { formatFileSize, formatDate } from '../utils/format';
import { useToastStore } from '../hooks/useToast';
import { resolveFileIconType } from '../utils/fileType';

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

  const files = items.filter((item) => item.item_type === 'file');
  const directories = items.filter((item) => item.item_type === 'directory');

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-semibold text-theme-primary mb-1 flex items-center gap-2">
          <Link2 size={28} className="text-brand shrink-0" />
          Мои ссылки
        </h1>
        <p className="text-sm text-theme-muted">Файлы и папки, на которые созданы ссылки</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Элементы</CardTitle>
        </CardHeader>

        {isLoading ? (
          <p className="text-sm text-theme-muted py-8 text-center">Загрузка...</p>
        ) : error ? (
          <p className="text-danger text-sm py-8 text-center">{error}</p>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Link2 size={24} />}
            description="Здесь появятся файлы и папки, на которые вы создали ссылки."
          />
        ) : (
          <div className="space-y-6">
            {directories.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-theme-secondary mb-3">Папки</h3>
                <div className="space-y-1">
                  {directories.map((item) => (
                    <Link
                      key={item.id}
                      to={`/directories/${item.id}`}
                      className="group flex items-center justify-between p-3 rounded-theme-md transition-colors cursor-pointer bg-theme-tertiary hover:bg-theme-hover border border-theme"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="p-2 bg-theme-secondary rounded-theme-sm shadow-theme-card shrink-0 relative">
                          <Folder
                            size={20}
                            className="text-theme-muted group-hover:text-brand transition-colors"
                          />
                          <span
                            className={`absolute -top-1.5 flex items-center justify-center rounded-full bg-theme-tertiary border border-theme p-0.5 shadow-theme-card ${
                              item.is_active ? 'opacity-100' : 'opacity-0'
                            }`}
                            style={{ left: '25px' }}
                          >
                            <ExternalLink size={11} className="text-green-500" />
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm text-theme-primary font-medium truncate">
                            {item.filename}
                          </p>
                          <p className="text-xs text-theme-muted">
                            Создана {formatDate(item.created_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-3">
                        <ItemActionsMenu
                          iconSize={16}
                          onRename={() =>
                            setRenameState({
                              id: item.id,
                              name: item.filename,
                              type: 'directory',
                            })
                          }
                          onDelete={() => handleDeleteDirectory(item.id)}
                          onShare={() =>
                            setShareModalState({
                              itemId: item.id,
                              itemName: item.filename,
                              itemType: 'directory',
                            })
                          }
                        />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {files.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-theme-secondary mb-3">Файлы</h3>
                <div className="space-y-1">
                  {files.map((file) => (
                    <FileItem
                      key={file.id}
                      id={file.id}
                      name={file.filename}
                      date={formatDate(file.link_created_at)}
                      size={formatFileSize(file.size)}
                      type={resolveFileIconType(file.mime_type, file.extension)}
                      to={`/files/${file.id}`}
                      isFavorite={false}
                      hasShareLinks={itemsWithLinks.has(file.id)}
                      onToggleFavorite={handleToggleFavorite}
                      onRename={(id) => {
                        const f = items.find((d) => d.id === id);
                        if (f)
                          setRenameState({
                            id: f.id,
                            name: f.filename,
                            extension: f.extension,
                            type: 'file',
                          });
                      }}
                      onDelete={handleDeleteFile}
                      onDownload={handleDownload}
                      onConvert={handleConvert}
                      onShare={(id) => {
                        const f = items.find((d) => d.id === id);
                        if (f)
                          setShareModalState({
                            itemId: f.id,
                            itemName: f.filename,
                            itemType: 'file',
                          });
                      }}
                    />
                  ))}
                </div>
              </div>
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
      </Card>

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
