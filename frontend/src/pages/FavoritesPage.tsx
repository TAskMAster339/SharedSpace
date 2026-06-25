import React, { useEffect, useState, useCallback } from 'react';
import { Star } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useDragDropStore } from '../store/dragDropStore';
import { useFavorites } from '../hooks/useFavorites';
import { getFavorites, FavoriteFile } from '../api/favorites';
import { ApiError } from '../api/client';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { FileItem } from '../components/ui/FileItem';
import { EmptyState } from '../components/ui/EmptyState';
import { formatFileSize, formatDate } from '../utils/format';
import { resolveFileIconType } from '../utils/fileType';

const FavoritesPage: React.FC = () => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const { toggleFavorite } = useFavorites();
  const { setOnUploadComplete } = useDragDropStore();
  const [files, setFiles] = useState<FavoriteFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!accessToken) return;

    let isMounted = true;
    setIsLoading(true);
    setError('');

    getFavorites(accessToken)
      .then((data) => {
        if (isMounted) setFiles(data.favorites);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err instanceof ApiError ? err.message : 'Не удалось загрузить избранное.');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  const loadFavorites = useCallback(async () => {
    if (!accessToken) return;

    setIsLoading(true);
    setError('');

    try {
      const data = await getFavorites(accessToken);
      setFiles(data.favorites);
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

  const handleToggleFavorite = async (fileId: string) => {
    if (!accessToken) return;
    // Оптимистично удаляем файл из списка
    setFiles((prev) => prev.filter((file) => file.id !== fileId));

    try {
      // Вызываем toggleFavorite из хука
      await toggleFavorite(fileId);
    } catch {
      // Если ошибка - возвращаем файл обратно в список
      const data = await getFavorites(accessToken!);
      setFiles(data.favorites);
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
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default FavoritesPage;
