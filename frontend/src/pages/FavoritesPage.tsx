import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Star } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useDragDropStore } from '../store/dragDropStore';
import { useFavorites } from '../hooks/useFavorites';
import { getFavorites, FavoriteFile } from '../api/favorites';
import { softDeleteFile, restoreFile } from '../api/files';
import { ApiError } from '../api/client';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { FileItem } from '../components/ui/FileItem';
import { EmptyState } from '../components/ui/EmptyState';
import { Toast } from '../components/ui/Toast';
import { formatFileSize, formatDate } from '../utils/format';
import { resolveFileIconType } from '../utils/fileType';

const PAGE_LIMIT = 20;

const FavoritesPage: React.FC = () => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const { toggleFavorite } = useFavorites();
  const { setOnUploadComplete } = useDragDropStore();
  const [files, setFiles] = useState<FavoriteFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletedToast, setDeletedToast] = useState<{ id: string; name: string } | null>(null);
  const [favoriteToast, setFavoriteToast] = useState<{ id: string; name: string } | null>(null);

  // Pagination — автозагрузка при скролле
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadFavorites = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError('');
    setCursor(undefined);
    setHasMore(false);

    try {
      const data = await getFavorites(accessToken, { limit: PAGE_LIMIT });
      setFiles(data.favorites);
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

  // Автозагрузка при скролле
  const checkAndLoad = useCallback(() => {
    if (!accessToken || !hasMore || !cursor || isLoadingMore) return;
    const el = sentinelRef.current;
    if (el && el.getBoundingClientRect().top < window.innerHeight + 300) {
      setIsLoadingMore(true);
      getFavorites(accessToken, { limit: PAGE_LIMIT, cursor })
        .then((data) => {
          setFiles((prev) => [...prev, ...data.favorites]);
          setCursor(data.next_cursor);
          setHasMore(!!data.next_cursor);
        })
        .catch((err) => console.error('Failed to load more favorites:', err))
        .finally(() => setIsLoadingMore(false));
    }
  }, [accessToken, cursor, hasMore, isLoadingMore]);

  useEffect(() => {
    checkAndLoad();
    window.addEventListener('scroll', checkAndLoad, { passive: true });
    window.addEventListener('resize', checkAndLoad, { passive: true });
    return () => {
      window.removeEventListener('scroll', checkAndLoad);
      window.removeEventListener('resize', checkAndLoad);
    };
  }, [checkAndLoad]);

  const handleToggleFavorite = async (fileId: string) => {
    if (!accessToken) return;
    const file = files.find((f) => f.id === fileId);
    setFiles((prev) => prev.filter((f) => f.id !== fileId));

    try {
      await toggleFavorite(fileId);
      setFavoriteToast({ id: fileId, name: file?.filename || 'Файл' });
    } catch {
      const data = await getFavorites(accessToken, { limit: PAGE_LIMIT, cursor });
      setFiles(data.favorites);
    }
  };

  const handleUndoFavorite = async () => {
    if (!favoriteToast || !accessToken) return;
    try {
      await toggleFavorite(favoriteToast.id);
      const data = await getFavorites(accessToken, { limit: PAGE_LIMIT, cursor });
      setFiles(data.favorites);
    } catch (err) {
      console.error('Failed to undo favorite:', err);
    }
    setFavoriteToast(null);
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!accessToken) return;
    const file = files.find((f) => f.id === fileId);

    setFiles((prev) => prev.filter((f) => f.id !== fileId));

    try {
      await softDeleteFile(accessToken, fileId);
      setDeletedToast({ id: fileId, name: file?.filename || 'Файл' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось удалить файл.');
      const data = await getFavorites(accessToken, { limit: PAGE_LIMIT, cursor });
      setFiles(data.favorites);
    }
  };

  const handleUndoDelete = async () => {
    if (!deletedToast || !accessToken) return;

    try {
      await restoreFile(accessToken, deletedToast.id);
      const data = await getFavorites(accessToken, { limit: PAGE_LIMIT, cursor });
      setFiles(data.favorites);
    } catch (err) {
      console.error('Failed to restore file:', err);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-semibold text-theme-primary mb-1">Избранное</h1>
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
                onToggleFavorite={handleToggleFavorite}
                onDelete={handleDeleteFile}
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

      {(deletedToast || favoriteToast) && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
          {favoriteToast && (
            <Toast
              variant="favorite"
              message={`«${favoriteToast.name}» удалён из избранного`}
              actionLabel="Отменить"
              onAction={handleUndoFavorite}
              onClose={() => setFavoriteToast(null)}
            />
          )}
          {deletedToast && (
            <Toast
              variant="undo"
              message={`«${deletedToast.name}» перемещён в корзину`}
              actionLabel="Отменить"
              onAction={handleUndoDelete}
              onClose={() => setDeletedToast(null)}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default FavoritesPage;
