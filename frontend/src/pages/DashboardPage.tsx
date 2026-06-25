import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Folder, Star } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useAuthStore } from '../store/authStore';
import { useDirectoryStore } from '../store/directoryStore';
import { useFavorites } from '../hooks/useFavorites';
import { getRecentFiles, FileMetadata } from '../api/files';
import { getSharedWithMe, SharedDirectory } from '../api/sharing';
import { getFavorites, FavoriteFile } from '../api/favorites';
import { ApiError } from '../api/client';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { FileItem } from '../components/ui/FileItem';
import { DirectoryItem } from '../components/ui/DirectoryItem';
import { EmptyState } from '../components/ui/EmptyState';
import { Link as UILink } from '../components/ui/Link';
import { formatFileSize, formatDate } from '../utils/format';
import { resolveFileIconType } from '../utils/fileType';

const RECENT_FILES_LIMIT = 5;
const FAVORITES_LIMIT = 3;
const SHARED_DIRECTORIES_LIMIT = 5;

const DashboardPage: React.FC = () => {
  const { firstName } = useAuth();
  const navigate = useNavigate();
  const accessToken = useAuthStore((state) => state.accessToken);
  const { personalStorageId, isLoading: isStorageLoading } = useDirectoryStore();
  const { isFavorite, toggleFavorite } = useFavorites();

  const [recentFiles, setRecentFiles] = useState<FileMetadata[]>([]);
  const [sharedDirectories, setSharedDirectories] = useState<SharedDirectory[]>([]);
  const [favorites, setFavorites] = useState<FavoriteFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!accessToken) return;

    let isMounted = true;
    setIsLoading(true);
    setError('');

    Promise.all([
      getRecentFiles(accessToken, RECENT_FILES_LIMIT),
      getSharedWithMe(accessToken, SHARED_DIRECTORIES_LIMIT),
      getFavorites(accessToken, FAVORITES_LIMIT),
    ])
      .then(([recent, shared, favoritesRes]) => {
        if (!isMounted) return;
        setRecentFiles(recent.files);
        setSharedDirectories(shared);
        setFavorites(favoritesRes.favorites);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err instanceof ApiError ? err.message : 'Не удалось загрузить данные.');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  if (isStorageLoading || isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return <p className="text-danger text-sm py-8 text-center">{error}</p>;
  }

  const handleUploadClick = () => {
    navigate(`/directories/${personalStorageId}`);
  };

  const handleToggleFavorite = (fileId: string) => {
    const wasFavorite = isFavorite(fileId);
    toggleFavorite(fileId);

    if (wasFavorite) {
      setFavorites((prev) => prev.filter((f) => f.id !== fileId));
      return;
    }

    const file = recentFiles.find((f) => f.id === fileId);
    if (file) {
      setFavorites((prev) => {
        if (prev.some((f) => f.id === fileId)) return prev;
        return [{ ...file, favorited_at: new Date().toISOString() }, ...prev].slice(
          0,
          FAVORITES_LIMIT,
        );
      });
    }
  };

  const favoritesFullWidth = recentFiles.length > 0 && favorites.length > 0;

  return (
    <div className="space-y-8 pb-10">
      {/* Приветствие */}
      <div>
        <h1 className="text-2xl font-semibold text-theme-primary mb-1">
          С возвращением, {firstName} ✦
        </h1>
        <p className="text-sm text-theme-muted">SharedSpace — просторный как космос</p>
      </div>

      {/* Недавние файлы */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {recentFiles.length === 0 ? (
          <div className="lg:col-span-2">
            <EmptyState
              icon={<Folder size={32} />}
              title="Нет загруженных файлов"
              description="Начните загружать файлы в ваше личное хранилище"
              action={{
                label: 'Загрузить первый файл',
                onClick: handleUploadClick,
              }}
            />
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Недавние файлы</CardTitle>
              <UILink to={`/directories/${personalStorageId}`}>Смотреть все</UILink>
            </CardHeader>
            <div className="space-y-4">
              {recentFiles.map((file) => (
                <FileItem
                  key={file.id}
                  id={file.id}
                  name={file.filename}
                  date={formatDate(file.created_at)}
                  size={formatFileSize(file.size)}
                  type={resolveFileIconType(file.mime_type, file.extension)}
                  to={`/files/${file.id}`}
                  isFavorite={isFavorite(file.id)}
                  onToggleFavorite={handleToggleFavorite}
                />
              ))}
            </div>
          </Card>
        )}

        {/* Правая колонка: Общие директории (ограничение 5) */}
        <Card>
          <CardHeader>
            <CardTitle>Общие директории</CardTitle>
            <UILink to="/directories">Смотреть все</UILink>
          </CardHeader>
          {sharedDirectories.length === 0 ? (
            <EmptyState
              icon={<Folder size={24} />}
              description="Нет общих директорий."
              action={{
                label: 'Создай первую',
                onClick: () => navigate('/directories'),
              }}
              size="sm"
            />
          ) : (
            <div className="space-y-4">
              {sharedDirectories.map((dir) => (
                <DirectoryItem
                  key={dir.id}
                  id={dir.id}
                  name={dir.name}
                  to={`/directories/${dir.directory_id}`}
                />
              ))}
            </div>
          )}
        </Card>

        {/* Блок Избранного: на всю ширину только если есть и недавние файлы, и избранное */}
        <div className={favoritesFullWidth ? 'lg:col-span-2' : ''}>
          <Card>
            <CardHeader>
              <CardTitle>Избранное</CardTitle>
              <UILink to="/favorites">Смотреть все</UILink>
            </CardHeader>
            {favorites.length > 0 ? (
              <div
                className={
                  favoritesFullWidth ? 'grid grid-cols-1 sm:grid-cols-3 gap-4' : 'space-y-4'
                }
              >
                {favorites.map((fav) => (
                  <FileItem
                    key={fav.id}
                    id={fav.id}
                    name={fav.filename}
                    date={formatDate(fav.favorited_at)}
                    size={formatFileSize(fav.size)}
                    type={resolveFileIconType(fav.mime_type, fav.extension)}
                    to={`/files/${fav.id}`}
                    isFavorite={isFavorite(fav.id)}
                    onToggleFavorite={handleToggleFavorite}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Star size={24} />}
                description="Избранных нет."
                action={{
                  label: 'Отметь файл',
                  onClick: handleUploadClick,
                }}
                size="sm"
              />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
