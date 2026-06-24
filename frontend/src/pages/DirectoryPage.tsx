import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Upload, FolderPlus, Settings, ChevronRight, Home } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useDirectoryStore } from '../store/directoryStore';
import { Modal } from '../components/ui/Modal';
import { DropZone } from '../components/ui/DropZone';
import { ViewToggle, ViewMode } from '../components/ui/ViewToggle';
import { Button } from '../components/ui/Button';
import { FolderGridItem } from '../components/ui/FolderGridItem';
import { FileGridItem } from '../components/ui/FileGridItem';
import { FolderItem } from '../components/ui/FolderItem';
import { FileItem } from '../components/ui/FileItem';
import {
  getDirectoryContents,
  getDirectoryById,
  createDirectory,
  getDirectoryById as getDirectory,
  DirectoryContents,
  Directory,
} from '../api/directories';
import { uploadFilesWithProgress } from '../api/files';
import { formatFileSize, formatDate } from '../utils/format';

interface BreadcrumbItem {
  id: string;
  name: string;
  isRoot?: boolean;
}

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

  // Breadcrumbs
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [isLoadingBreadcrumbs, setIsLoadingBreadcrumbs] = useState(false);

  // Используем refs для предотвращения повторных вызовов
  const redirectDone = useRef(false);
  const [actualId, setActualId] = useState<string | null>(null);

  // --- Функция загрузки breadcrumbs ---
  const loadBreadcrumbs = useCallback(
    async (directoryId: string) => {
      if (!accessToken) return;

      setIsLoadingBreadcrumbs(true);
      const crumbs: BreadcrumbItem[] = [];
      let currentId = directoryId;

      try {
        // Сначала получаем текущую директорию
        const currentDir = await getDirectory(accessToken, currentId);

        // Если это root директория, добавляем её и выходим
        if (currentDir.type === 'root') {
          crumbs.push({
            id: currentDir.id,
            name: 'Личное хранилище',
            isRoot: true,
          });
          setBreadcrumbs(crumbs);
          setIsLoadingBreadcrumbs(false);
          return;
        }

        // Собираем путь от текущей до корня
        let parentId = currentDir.parent_id;
        // Добавляем текущую директорию
        crumbs.push({
          id: currentDir.id,
          name: currentDir.name,
        });

        // Поднимаемся вверх по дереву
        while (parentId) {
          const parentDir = await getDirectory(accessToken, parentId);
          if (parentDir.type === 'root') {
            crumbs.unshift({
              id: parentDir.id,
              name: 'Личное хранилище',
              isRoot: true,
            });
            break;
          } else {
            crumbs.unshift({
              id: parentDir.id,
              name: parentDir.name,
            });
            parentId = parentDir.parent_id;
          }
        }

        setBreadcrumbs(crumbs);
      } catch (err) {
        console.error('Failed to load breadcrumbs:', err);
        // Если не удалось загрузить полный путь, показываем хотя бы текущую
        setBreadcrumbs([
          {
            id: directoryId,
            name: directoryInfo?.name || 'Текущая папка',
          },
        ]);
      } finally {
        setIsLoadingBreadcrumbs(false);
      }
    },
    [accessToken, directoryInfo],
  );

  // --- Функция загрузки содержимого ---
  const loadDirectory = useCallback(
    async (dirId: string) => {
      if (!accessToken || !dirId) return;

      setIsLoading(true);
      setError(null);

      try {
        const [info, contents] = await Promise.all([
          getDirectoryById(accessToken, dirId),
          getDirectoryContents(accessToken, dirId),
        ]);

        setDirectoryInfo(info);
        setDirectoryContents(contents);

        // Загружаем breadcrumbs после получения информации о директории
        await loadBreadcrumbs(dirId);
      } catch (err) {
        console.error('Failed to load directory:', err);
        if (err instanceof Error && err.message?.includes('404')) {
          navigate('/dashboard', { replace: true });
        } else {
          setError('Не удалось загрузить содержимое директории');
        }
      } finally {
        setIsLoading(false);
      }
    },
    [accessToken, navigate, loadBreadcrumbs],
  );

  // --- Обработчик навигации по breadcrumbs ---
  const handleBreadcrumbClick = useCallback(
    async (crumbId: string) => {
      // Обновляем URL
      navigate(`/directories/${crumbId}`);
      // Загружаем содержимое
      await loadDirectory(crumbId);
      setActualId(crumbId);
    },
    [navigate, loadDirectory],
  );

  // --- Эффект 1: Обработка 'personal' ID ---
  useEffect(() => {
    if (redirectDone.current || !accessToken) return;

    const resolveAndLoad = async () => {
      let targetId = id;

      if (id === 'personal') {
        const rootId = personalStorageId || localStorage.getItem('rootDirectoryId');
        if (rootId && rootId !== 'personal') {
          targetId = rootId;
          redirectDone.current = true;
          navigate(`/directories/${rootId}`, { replace: true });
        }
      } else if (id) {
        redirectDone.current = true;
      }

      if (targetId && targetId !== 'personal') {
        await loadDirectory(targetId);
        setActualId(targetId);
      }
    };

    resolveAndLoad();
  }, [id, personalStorageId, accessToken, navigate, loadDirectory]);

  // --- Эффект 2: Обновление при изменении ID в URL ---
  useEffect(() => {
    // Если ID изменился и это не 'personal', загружаем новую директорию
    if (id && id !== 'personal' && id !== actualId && accessToken) {
      setActualId(id);
      loadDirectory(id);
    }
  }, [id, actualId, accessToken, loadDirectory]);

  // --- Сохраняем режим просмотра ---
  useEffect(() => {
    localStorage.setItem('directoryViewMode', viewMode);
  }, [viewMode]);

  // --- Вычисляемые значения ---
  const isPersonal = useMemo(() => directoryInfo?.type === 'root', [directoryInfo]);
  const isShared = useMemo(
    () => directoryInfo?.type === 'regular' && directoryInfo?.owner_id !== user?.id,
    [directoryInfo, user],
  );
  const isOwner = useMemo(() => directoryInfo?.owner_id === user?.id, [directoryInfo, user]);

  // --- Обработчики ---
  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  const handleFilesDrop = useCallback(
    async (files: FileList) => {
      if (!accessToken || !actualId) return;

      setIsUploading(true);
      setUploadProgress(0);
      setUploadError(null);

      try {
        await uploadFilesWithProgress(accessToken, actualId, files, (progress: number) => {
          setUploadProgress(progress);
        });

        await loadDirectory(actualId);

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
    [accessToken, actualId, loadDirectory],
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

      await loadDirectory(actualId);
      setIsCreateFolderModalOpen(false);
      setNewFolderName('');
    } catch (err) {
      console.error('Failed to create folder:', err);
      setError('Не удалось создать папку');
    } finally {
      setIsCreatingFolder(false);
    }
  }, [newFolderName, accessToken, actualId, isShared, loadDirectory]);

  // --- Рендер breadcrumbs ---
  const renderBreadcrumbs = () => {
    if (isLoadingBreadcrumbs) {
      return (
        <div className="flex items-center gap-2 text-sm text-theme-muted">
          <span>Загрузка...</span>
        </div>
      );
    }

    if (breadcrumbs.length === 0) {
      return null;
    }

    return (
      <nav className="flex items-center gap-1 text-sm flex-wrap" aria-label="Breadcrumb">
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          const isFirst = index === 0;

          return (
            <React.Fragment key={crumb.id}>
              {!isFirst && <ChevronRight size={14} className="text-theme-muted shrink-0" />}
              {isLast ? (
                <span className="text-theme-primary font-medium">
                  {crumb.isRoot ? (
                    <span className="flex items-center gap-1">
                      <Home size={14} />
                      {crumb.name}
                    </span>
                  ) : (
                    crumb.name
                  )}
                </span>
              ) : (
                <button
                  onClick={() => handleBreadcrumbClick(crumb.id)}
                  className="text-theme-secondary hover:text-brand transition-colors hover:underline cursor-pointer"
                >
                  {crumb.isRoot ? (
                    <span className="flex items-center gap-1">
                      <Home size={14} />
                      {crumb.name}
                    </span>
                  ) : (
                    crumb.name
                  )}
                </button>
              )}
            </React.Fragment>
          );
        })}
      </nav>
    );
  };

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
        <Button variant="secondary" onClick={() => navigate('/dashboard')} className="mt-4">
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
      <div>
        <h1 className="text-2xl font-semibold text-theme-primary">
          {isPersonal ? 'Личное хранилище' : directoryContents.name}
        </h1>
        <p className="text-sm text-theme-muted mt-0.5">
          {isPersonal
            ? 'Ваши личные файлы и папки'
            : isShared
              ? 'Общая директория'
              : 'Ваша директория'}
        </p>

        {/* Breadcrumbs под описанием */}
        <div className="mt-2">{renderBreadcrumbs()}</div>
      </div>

      {/* Кнопки действий справа от заголовка */}
      <div className="flex items-center justify-end gap-2 flex-wrap -mt-2">
        <button
          onClick={() => {
            setUploadError(null);
            setIsUploadModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-theme-on-brand rounded-theme-md hover:bg-brand-hover transition-colors text-sm font-medium"
        >
          <Upload size={16} />
          Загрузить
        </button>

        <button
          onClick={() => setIsCreateFolderModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 border border-theme bg-theme-secondary text-theme-secondary hover:text-theme-primary hover:bg-theme-hover rounded-theme-md transition-colors text-sm font-medium"
        >
          <FolderPlus size={16} />
          Новая папка
        </button>

        <ViewToggle viewMode={viewMode} onViewModeChange={handleViewModeChange} />
      </div>

      {/* Настройки директории */}
      {isShared && isOwner && (
        <div className="flex justify-end">
          <button
            onClick={() => navigate(`/shared/${actualId}/settings`)}
            className="inline-flex items-center gap-2 px-4 py-2 border border-theme bg-theme-secondary text-theme-secondary hover:text-theme-primary hover:bg-theme-hover rounded-theme-md transition-colors text-sm font-medium"
          >
            <Settings size={16} />
            Настройки директории
          </button>
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
        <div className="space-y-6">
          {/* Папки */}
          {subdirectories.length > 0 && (
            <div>
              <div className="bg-theme-secondary border border-theme rounded-theme-lg p-4 shadow-theme-card">
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
                      <FolderItem
                        key={folder.id}
                        id={folder.id}
                        name={folder.name}
                        to={`/directories/${folder.id}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Файлы */}
          {files.length > 0 && (
            <div>
              <div className="bg-theme-secondary border border-theme rounded-theme-lg p-4 shadow-theme-card">
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
            </div>
          )}
        </div>
      )}

      {/* Модальное окно загрузки */}
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

      {/* Модальное окно создания папки */}
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
            <button
              onClick={() => setIsCreateFolderModalOpen(false)}
              disabled={isCreatingFolder}
              className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-theme bg-theme-secondary text-theme-secondary hover:text-theme-primary hover:bg-theme-hover rounded-theme-md transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Отмена
            </button>
            <button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim() || isCreatingFolder}
              className="flex-1 inline-flex items-center justify-center px-4 py-2 bg-brand text-theme-on-brand hover:bg-brand-hover rounded-theme-md transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreatingFolder ? 'Создание...' : 'Создать'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default DirectoryPage;
