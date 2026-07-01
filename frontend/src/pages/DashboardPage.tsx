import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Folder, Star } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useAuthStore } from '../store/authStore';
import { useDirectoryStore } from '../store/directoryStore';
import { useDragDropStore } from '../store/dragDropStore';
import { useFavorites } from '../hooks/useFavorites';
import { getRecentFiles, FileMetadata, getFileContentUrl } from '../api/files';
import { getSharedWithMe, SharedDirectory } from '../api/sharing';
import { ApiError } from '../api/client';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { FileItem } from '../components/ui/FileItem';
import { DirectoryItem } from '../components/ui/DirectoryItem';
import { ConvertModal } from '../components/ui/ConvertModal';
import { ShareLinkModal } from '../components/ui/ShareLinkModal';
import { EmptyState } from '../components/ui/EmptyState';
import { Link as UILink } from '../components/ui/Link';
import { useFileConversion } from '../hooks/useFileConversion';
import { useToastStore } from '../hooks/useToast';
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
  const { isFavorite, toggleFavorite, favorites: storeFavorites, loadFavorites } = useFavorites();
  const { setOnUploadComplete } = useDragDropStore();

  const [recentFiles, setRecentFiles] = useState<FileMetadata[]>([]);
  const [sharedDirectories, setSharedDirectories] = useState<SharedDirectory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const showToast = useToastStore((s) => s.showToast);
  const { isConverting, convertAndDownload, convertAndSave } = useFileConversion();

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

  const loadDashboardData = useCallback(async () => {
    if (!accessToken) return;

    setIsLoading(true);
    setError('');

    try {
      const [recent, shared] = await Promise.all([
        getRecentFiles(accessToken, RECENT_FILES_LIMIT),
        getSharedWithMe(accessToken, SHARED_DIRECTORIES_LIMIT),
        loadFavorites(accessToken),
      ]);
      setRecentFiles(recent.files);
      setSharedDirectories(shared);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить данные.');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, loadFavorites]);

  useEffect(() => {
    loadDashboardData();
  }, [accessToken, loadDashboardData]);

  useEffect(() => {
    setOnUploadComplete(() => {
      loadDashboardData();
    });

    return () => {
      setOnUploadComplete(null);
    };
  }, [accessToken, setOnUploadComplete, loadDashboardData]);

  const handleDownload = useCallback(
    async (fileId: string) => {
      if (!accessToken) return;
      const file =
        recentFiles.find((f) => f.id === fileId) || storeFavorites.find((f) => f.id === fileId);
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
    [accessToken, recentFiles, storeFavorites, showToast],
  );

  const handleConvert = useCallback(
    (fileId: string) => {
      const file =
        recentFiles.find((f) => f.id === fileId) || storeFavorites.find((f) => f.id === fileId);
      if (!file) return;
      setConvertFileData({
        id: file.id,
        filename: file.filename,
        mimeType: file.mime_type,
        extension: file.extension,
      });
    },
    [recentFiles, storeFavorites],
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
      refreshDashboard();
      return resultFileId;
    },
    [convertFileData, convertAndSave, refreshDashboard],
  );

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

  const refreshDashboard = async (forceFavorites = false) => {
    if (!accessToken) return;
    try {
      const [recent, shared] = await Promise.all([
        getRecentFiles(accessToken, RECENT_FILES_LIMIT),
        getSharedWithMe(accessToken, SHARED_DIRECTORIES_LIMIT),
        loadFavorites(accessToken, forceFavorites),
      ]);
      setRecentFiles(recent.files);
      setSharedDirectories(shared);
    } catch {
      // игнорируем
    }
  };

  const handleToggleFavorite = async (fileId: string) => {
    const wasFavorite = isFavorite(fileId);
    const sourceFile =
      recentFiles.find((f) => f.id === fileId) || storeFavorites.find((f) => f.id === fileId);
    const name = sourceFile?.filename || 'Файл';

    try {
      await toggleFavorite(fileId);
      await refreshDashboard(true);
      let undoing = false;
      showToast(
        `«${name}» ${!wasFavorite ? 'добавлен в избранное' : 'удалён из избранного'}`,
        'favorite',
        'Отменить',
        async () => {
          if (undoing) return;
          undoing = true;
          try {
            await toggleFavorite(fileId);
            await refreshDashboard(true);
          } catch (err) {
            console.error('Failed to undo favorite:', err);
          }
        },
      );
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
      await refreshDashboard(true);
    }
  };

  const displayFavorites = storeFavorites.slice(0, FAVORITES_LIMIT);
  const favoritesFullWidth = recentFiles.length > 0 && displayFavorites.length > 0;

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
                  onDownload={handleDownload}
                  onConvert={handleConvert}
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
            {displayFavorites.length > 0 ? (
              <div
                className={
                  favoritesFullWidth ? 'grid grid-cols-1 sm:grid-cols-3 gap-4' : 'space-y-4'
                }
              >
                {displayFavorites.map((fav) => (
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
                    onDownload={handleDownload}
                    onConvert={handleConvert}
                    onShare={(id) => {
                      const f = storeFavorites.find((d) => d.id === id);
                      if (f) setShareModalState({ itemId: f.id, itemName: f.filename });
                    }}
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
        />
      )}
    </div>
  );
};

export default DashboardPage;
