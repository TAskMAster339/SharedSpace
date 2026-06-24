import React, { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { getFavorites, removeFavorite, FavoriteFile } from '../api/favorites';
import { ApiError } from '../api/client';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { FileItem } from '../components/ui/FileItem';
import { EmptyState } from '../components/ui/EmptyState';
import { formatBytes, formatDate } from '../utils/format';
import { resolveFileIconType } from '../utils/fileType';

const FavoritesPage: React.FC = () => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const [favorites, setFavorites] = useState<FavoriteFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!accessToken) return;

    let isMounted = true;
    setIsLoading(true);
    setError('');

    getFavorites(accessToken)
      .then((data) => {
        if (isMounted) setFavorites(data.favorites);
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

  const handleToggleFavorite = async (fileId: string) => {
    if (!accessToken) return;

    setFavorites((prev) => prev.filter((file) => file.id !== fileId));
    try {
      await removeFavorite(accessToken, fileId);
    } catch {
      // Откатываем удаление из списка, если запрос не удался.
      getFavorites(accessToken).then((data) => setFavorites(data.favorites));
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
        ) : favorites.length === 0 ? (
          <EmptyState
            icon={<Star size={24} />}
            description="Здесь появятся файлы, отмеченные звёздочкой."
          />
        ) : (
          <div className="space-y-4">
            {favorites.map((file) => (
              <FileItem
                key={file.id}
                id={file.id}
                name={file.filename}
                date={formatDate(file.favorited_at)}
                size={formatBytes(file.size)}
                type={resolveFileIconType(file.mime_type, file.extension)}
                to={`/files/${file.id}`}
                isFavorite
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
