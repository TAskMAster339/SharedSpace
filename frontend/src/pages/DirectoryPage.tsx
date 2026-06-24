import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Upload, FolderPlus, Settings } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useDirectoryStore } from '../store/directoryStore';
import { Modal } from '../components/ui/Modal';
import { DropZone } from '../components/ui/DropZone';
import { ViewToggle, ViewMode } from '../components/ui/ViewToggle';
import { Button } from '../components/ui/Button';
import { FolderGridItem } from '../components/ui/FolderGridItem';
import { FileGridItem } from '../components/ui/FileGridItem';
import { FileItem } from '../components/ui/FileItem';
import {
  getDirectoryContents,
  getDirectoryById,
  createDirectory,
  DirectoryContents,
  Directory,
} from '../api/directories';
import { uploadFilesWithProgress } from '../api/files';
import { formatFileSize, formatDate } from '../utils/format';

const DirectoryPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const { personalStorageId } = useDirectoryStore();

  // Состояния
  const [directoryContents, setDirectoryContents] = useState<DirectoryContents | null>(null);
  const [directoryInfo, setDirectoryInfo] = useState<Directory | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem('directoryViewMode') as ViewMode) || 'grid';
  });
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  
  // Используем refs для предотвращения повторных вызовов
  const redirectDone = useRef(false);
  const initialLoadDone = useRef(false); // <-- Добавляем этот ref
  const [actualId, setActualId] = useState<string | null>(null);

  // --- Эффект 1: Обработка 'personal' ID ---
  useEffect(() => {
    if (redirectDone.current || !accessToken) return;

    if (id === 'personal') {
      const rootId = personalStorageId || localStorage.getItem('rootDirectoryId');
      if (rootId && rootId !== 'personal') {
        setActualId(rootId);
        redirectDone.current = true;
        navigate(`/directories/${rootId}`, { replace: true });
      }
    } else if (id) {
      setActualId(id);
      redirectDone.current = true;
    }
  }, [id, personalStorageId, accessToken, navigate]);

  // --- Эффект 2: Загрузка данных ---
  useEffect(() => {
    // Проверяем все условия для загрузки
    if (!actualId || !accessToken || !redirectDone.current || initialLoadDone.current) {
      return;
    }

    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [info, contents] = await Promise.all([
          getDirectoryById(accessToken, actualId),
          getDirectoryContents(accessToken, actualId),
        ]);
        
        setDirectoryInfo(info);
        setDirectoryContents(contents);
        initialLoadDone.current = true;
      } catch (err) {
        console.error('Failed to load directory:', err);
        // Проверяем, является ли ошибка 404
        if (err instanceof Error && err.message?.includes('404')) {
          navigate('/dashboard', { replace: true });
        } else {
          setError('Не удалось загрузить содержимое директории');
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [actualId, accessToken, navigate]);

  // --- Сохраняем режим просмотра ---
  useEffect(() => {
    localStorage.setItem('directoryViewMode', viewMode);
  }, [viewMode]);

  // --- Вычисляемые значения (мемоизированные) ---
  const isPersonal = useMemo(() => directoryInfo?.type === 'root', [directoryInfo]);
  const isShared = useMemo(() => 
    directoryInfo?.type === 'regular' && directoryInfo?.owner_id !== user?.id,
    [directoryInfo, user]
  );
  const isOwner = useMemo(() => 
    directoryInfo?.owner_id === user?.id,
    [directoryInfo, user]
  );

  // --- Обработчики (мемоизированные) ---
  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  const loadDirectory = useCallback(async () => {
    if (!actualId || !accessToken) return;

    try {
      const [info, contents] = await Promise.all([
        getDirectoryById(accessToken, actualId),
        getDirectoryContents(accessToken, actualId),
      ]);
      
      setDirectoryInfo(info);
      setDirectoryContents(contents);
      setError(null);
    } catch (err) {
      console.error('Failed to reload directory:', err);
      if (err instanceof Error && err.message?.includes('404')) {
        navigate('/dashboard', { replace: true });
      } else {
        setError('Не удалось обновить содержимое');
      }
    }
  }, [actualId, accessToken, navigate]);

  const handleFilesDrop = useCallback(
    async (files: FileList) => {
      if (!accessToken || !actualId) return;

      setIsUploading(true);
      setUploadProgress(0);
      setUploadError(null);

      try {
        await uploadFilesWithProgress(
          accessToken,
          actualId,
          files,
          (progress: number) => {
            setUploadProgress(progress);
          }
        );

        await loadDirectory();

        // Закрываем модалку после успешной загрузки
        setTimeout(() => {
          setIsUploadModalOpen(false);
          setIsUploading(false);
          setUploadProgress(0);
        }, 500);
      } catch (err) {
        console.error('Upload failed:', err);
        setUploadError(err instanceof Error ? err.message : 'Ошибка загрузки файлов');
        setIsUploading(false);
        setUploadProgress(0);
      }
    },
    [accessToken, actualId, loadDirectory]
  );

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim() || !accessToken || !actualId) return;

    setIsCreatingFolder(true);
    try {
      await createDirectory(accessToken, {
        name: newFolderName.trim(),
        parent_id: actualId,
        shared: isShared,
      });

      await loadDirectory();
      setIsCreateFolderModalOpen(false);
      setNewFolderName('');
    } catch (err) {
      console.error('Failed to create folder:', err);
      setError('Не удалось создать папку');
    } finally {
      setIsCreatingFolder(false);
    }
  }, [newFolderName, accessToken, actualId, isShared, loadDirectory]);

  // --- Рендер ---
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !directoryContents) {
    return (
      <div className="py-12 text-center">
        <p className="text-theme-secondary">{error || 'Директория не найдена'}</p>
        <Button
          variant="secondary"
          onClick={() => navigate('/dashboard')}
          className="mt-4"
        >
          Вернуться на дашборд
        </Button>
      </div>
    );
  }

  const { subdirectories, files } = directoryContents;
  const isEmpty = subdirectories.length === 0 && files.length === 0;

  const displayFiles = files.map((f) => ({
    id: f.id,
    name: f.filename,
    date: formatDate(f.created_at),
    size: formatFileSize(f.size),
    type: f.extension || 'file',
  }));

  return (
    <div className="space-y-6 pb-10">
      {/* Заголовок */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-theme-primary">
            {isPersonal ? 'Личное хранилище' : `"${directoryContents.name}"`}
          </h1>
          <p className="text-sm text-theme-muted mt-0.5">
            {isPersonal 
              ? 'Ваши личные файлы и папки' 
              : isShared 
                ? 'Общая директория' 
                : 'Ваша директория'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setUploadError(null);
              setIsUploadModalOpen(true);
            }}
            className="flex items-center gap-1.5"
          >
            <Upload size={16} />
            Загрузить
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsCreateFolderModalOpen(true)}
            className="flex items-center gap-1.5"
          >
            <FolderPlus size={16} />
            Новая папка
          </Button>

          <ViewToggle viewMode={viewMode} onViewModeChange={handleViewModeChange} />
        </div>
      </div>

      {/* Настройки директории */}
      {isShared && isOwner && (
        <div className="flex justify-end">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(`/shared/${actualId}/settings`)}
            className="flex items-center gap-1.5"
          >
            <Settings size={16} />
            Настройки директории
          </Button>
        </div>
      )}

      {/* Содержимое */}
      {isEmpty ? (
        <div className="mt-4">
          <DropZone
            onFilesDrop={handleFilesDrop}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
            uploadError={uploadError}
            className="min-h-[300px]"
          />
          <div className="text-center mt-6">
            <p className="text-sm text-theme-secondary">
              <button
                onClick={() => setIsCreateFolderModalOpen(true)}
                className="text-brand hover:text-brand-hover font-medium"
              >
                Создайте свою первую папку
              </button>
              <br />
              для удобного хранения файлов
            </p>
          </div>
        </div>
      ) : (
        <>
          {subdirectories.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-theme-secondary mb-3">Папки</h2>
              {viewMode === 'grid' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                  {subdirectories.map((folder) => (
                    <FolderGridItem
                      key={folder.id}
                      id={folder.id}
                      name={folder.name}
                      to={`/directories/${folder.id}`}
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {subdirectories.map((folder) => (
                    <FolderGridItem
                      key={folder.id}
                      id={folder.id}
                      name={folder.name}
                      to={`/directories/${folder.id}`}
                      className="flex-row p-3"
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {files.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-theme-secondary mb-3">Файлы</h2>
              {viewMode === 'grid' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                  {displayFiles.map((file) => (
                    <FileGridItem
                      key={file.id}
                      id={file.id}
                      name={file.name}
                      type={file.type}
                      to={`/files/${file.id}`}
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {displayFiles.map((file) => (
                    <FileItem
                      key={file.id}
                      id={file.id}
                      name={file.name}
                      date={file.date}
                      size={file.size}
                      type={file.type}
                      to={`/files/${file.id}`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Модальные окна */}
      <Modal
        isOpen={isUploadModalOpen}
        onClose={() => !isUploading && setIsUploadModalOpen(false)}
        title="Загрузить файл"
        maxWidth="lg"
      >
        <DropZone
          onFilesDrop={handleFilesDrop}
          isUploading={isUploading}
          uploadProgress={uploadProgress}
          uploadError={uploadError}
        />
      </Modal>

      <Modal
        isOpen={isCreateFolderModalOpen}
        onClose={() => !isCreatingFolder && setIsCreateFolderModalOpen(false)}
        title="Новая папка"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-theme-secondary mb-1.5 block">
              Название папки
            </label>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Введите название..."
              className="w-full px-3 py-2.5 rounded-theme-md border-2 border-theme-hover bg-theme-tertiary text-theme-primary placeholder:text-theme-muted outline-none focus:border-brand transition-colors text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder();
              }}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => setIsCreateFolderModalOpen(false)}
              disabled={isCreatingFolder}
              className="flex-1"
            >
              Отмена
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim() || isCreatingFolder}
              className="flex-1"
            >
              {isCreatingFolder ? 'Создание...' : 'Создать'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default DirectoryPage;
