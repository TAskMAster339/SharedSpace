import React, { useEffect, useState, useCallback } from 'react';
import { Star } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useDragDropStore } from '../store/dragDropStore';
import { useFavorites } from '../hooks/useFavorites';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { getFavorites, FavoriteFile } from '../api/favorites';
import { softDeleteFile, restoreFile, renameFile, getFileContentUrl } from '../api/files';
import { ApiError } from '../api/client';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { FileItem } from '../components/ui/FileItem';
import { EmptyState } from '../components/ui/EmptyState';
import { ConvertModal } from '../components/ui/ConvertModal';
import { RenameModal } from '../components/ui/RenameModal';
import { ShareLinkModal } from '../components/ui/ShareLinkModal';
import { useFileConversion } from '../hooks/useFileConversion';
import { formatFileSize, formatDate } from '../utils/format';
import { useToastStore } from '../hooks/useToast';
import { resolveFileIconType } from '../utils/fileType';

const PAGE_LIMIT = 20;

const FavoritesPage: React.FC = () => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshUser = useAuthStore((state) => state.refreshUser);
  const { toggleFavorite } = useFavorites();
  const { setOnUploadComplete } = useDragDropStore();
  const [files, setFiles] = useState<FavoriteFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const showToast = useToastStore((s) => s.showToast);
  const { isConverting, conversionProgress, convertAndDownload, convertAndSave } =
    useFileConversion();

  const [convertFileData, setConvertFileData] = useState<{
    id: string;
    filename: string;
    mimeType: string;
    extension: string;
  } | null>(null);
  const [shareModalState, setShareModalState] = useState<{
    itemId: string;
    itemName: string;
  } | null>(null);
  const [renameState, setRenameState] = useState<{
    id: string;
    name: string;
    extension?: string;
    type: 'file' | 'directory';
  } | null>(null);
  const [itemsWithLinks, setItemsWithLinks] = useState<Set<string>>(new Set());

  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const loadFavorites = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError('');
    setCursor(undefined);
    setHasMore(false);

    try {
      const data = await getFavorites(accessToken, { limit: PAGE_LIMIT });
      setFiles(data.favorites);
      setItemsWithLinks(new Set(data.favorites.filter((f) => f.has_share_links).map((f) => f.id)));
      setCursor(data.next_cursor);
      setHasMore(!!data.next_cursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить избранное.');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    loadFavorites();
  }, [accessToken, loadFavorites]);

  // Регистрируем callback для обновления после загрузки через DnD
  useEffect(() => {
    setOnUploadComplete(() => {
      loadFavorites();
    });

    return () => {
      setOnUploadComplete(null);
    };
  }, [accessToken, setOnUploadComplete, loadFavorites]);

  const loadMore = useCallback(() => {
    if (!accessToken || !cursor || isLoadingMore) return;
    setIsLoadingMore(true);
    getFavorites(accessToken, { limit: PAGE_LIMIT, cursor })
      .then((data) => {
        setFiles((prev) => [...prev, ...data.favorites]);
        setCursor(data.next_cursor);
        setHasMore(!!data.next_cursor);
      })
      .catch((err) => console.error('Failed to load more favorites:', err))
      .finally(() => setIsLoadingMore(false));
  }, [accessToken, cursor, isLoadingMore]);

  const { sentinelRef } = useInfiniteScroll(loadMore, hasMore && !isLoadingMore);

  const handleToggleFavorite = async (fileId: string) => {
    if (!accessToken) return;
    const file = files.find((f) => f.id === fileId);
    const name = file?.filename || 'Файл';
    setFiles((prev) => prev.filter((f) => f.id !== fileId));

    try {
      await toggleFavorite(fileId);
      let undoing = false;
      showToast(`«${name}» удалён из избранного`, 'favorite', 'Отменить', async () => {
        if (undoing) return;
        undoing = true;
        try {
          await toggleFavorite(fileId);
          if (file) setFiles((prev) => [...prev, file]);
        } catch (err) {
          console.error('Failed to undo favorite:', err);
        }
      });
    } catch {
      const data = await getFavorites(accessToken, { limit: PAGE_LIMIT });
      setFiles(data.favorites);
      setCursor(data.next_cursor);
      setHasMore(!!data.next_cursor);
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!accessToken) return;
    const file = files.find((f) => f.id === fileId);
    const name = file?.filename || 'Файл';

    setFiles((prev) => prev.filter((f) => f.id !== fileId));

    try {
      await softDeleteFile(accessToken, fileId);
      refreshUser();
      let undoing = false;
      showToast(`«${name}» перемещён в корзину`, 'undo', 'Отменить', async () => {
        if (undoing) return;
        undoing = true;
        try {
          await restoreFile(accessToken, fileId);
          if (file) setFiles((prev) => [...prev, file]);
        } catch (err) {
          console.error('Failed to restore file:', err);
        }
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось удалить файл.');
      const data = await getFavorites(accessToken, { limit: PAGE_LIMIT });
      setFiles(data.favorites);
      setCursor(data.next_cursor);
      setHasMore(!!data.next_cursor);
    }
  };

  const handleDownload = useCallback(
    async (fileId: string) => {
      if (!accessToken) return;
      const file = files.find((f) => f.id === fileId);
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
    [accessToken, files, showToast],
  );

  const handleConvert = useCallback(
    (fileId: string) => {
      const file = files.find((f) => f.id === fileId);
      if (!file) return;
      setConvertFileData({
        id: file.id,
        filename: file.filename,
        mimeType: file.mime_type,
        extension: file.extension,
      });
    },
    [files],
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
      loadFavorites();
      return resultFileId;
    },
    [convertFileData, convertAndSave, loadFavorites],
  );

  const handleRenameFile = useCallback(
    async (newName: string) => {
      if (!accessToken || !renameState) return;
      const oldName = renameState.name;
      await renameFile(accessToken, renameState.id, newName);
      showToast(`Файл «${oldName}» переименован в «${newName}»`, 'success');
      await loadFavorites();
    },
    [accessToken, renameState, showToast, loadFavorites],
  );

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-semibold text-theme-primary mb-1 flex items-center gap-2">
          <Star size={28} className="text-yellow-400 shrink-0" />
          Избранное
        </h1>
        <p className="text-sm text-theme-muted">Файлы, отмеченные звёздочкой</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Файлы</CardTitle>
        </CardHeader>

        {isLoading ? (
          <p className="text-sm text-theme-muted py-8 text-center">Загрузка...</p>
        ) : error ? (
          <p className="text-danger text-sm py-8 text-center">{error}</p>
        ) : files.length === 0 ? (
          <EmptyState
            icon={<Star size={24} />}
            description="Здесь появятся файлы, отмеченные звёздочкой."
          />
        ) : (
          <div className="space-y-4">
            {files.map((file) => (
              <FileItem
                key={file.id}
                id={file.id}
                name={file.filename}
                date={formatDate(file.favorited_at)}
                size={formatFileSize(file.size)}
                type={resolveFileIconType(file.mime_type, file.extension)}
                to={`/files/${file.id}`}
                isFavorite={true}
                hasShareLinks={itemsWithLinks.has(file.id)}
                onToggleFavorite={handleToggleFavorite}
                onRename={(id) => {
                  const f = files.find((d) => d.id === id);
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
                  const f = files.find((d) => d.id === id);
                  if (f) setShareModalState({ itemId: f.id, itemName: f.filename });
                }}
              />
            ))}
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
          onRename={handleRenameFile}
        />
      )}

      {shareModalState && accessToken && (
        <ShareLinkModal
          isOpen={true}
          onClose={() => setShareModalState(null)}
          itemId={shareModalState.itemId}
          itemName={shareModalState.itemName}
          itemType="file"
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

export default FavoritesPage;
