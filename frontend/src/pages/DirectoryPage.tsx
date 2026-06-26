import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Upload, FolderPlus, Settings, ChevronRight, Home, Users } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useDirectoryStore } from '../store/directoryStore';
import { useDragDropStore } from '../store/dragDropStore';
import { useSharedDirectories } from '../hooks/useSharedDirectories';
import { Modal } from '../components/ui/Modal';
import { Toast } from '../components/ui/Toast';
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
  softDeleteDirectory,
  restoreDirectory,
  DirectoryContents,
  Directory,
} from '../api/directories';
import { uploadFilesWithProgress, softDeleteFile, restoreFile } from '../api/files';
import { formatFileSize, formatDate } from '../utils/format';
import { useFavorites } from '../hooks/useFavorites';
import { useToastStore } from '../hooks/useToast';
import { buildUploadSuccessMessage, buildUploadErrorMessage } from '../utils/uploadMessage';
import { resolveFileIconType } from '../utils/fileType';

interface BreadcrumbItem {
  id: string;
  name: string;
  isRoot?: boolean;
  isShared?: boolean;
}

const DirectoryPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const { personalStorageId } = useDirectoryStore();
  const { isShared: checkIsShared, isLoading: isLoadingShared } = useSharedDirectories();
  const { setTargetDirectoryId, setOnUploadComplete } = useDragDropStore();

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
  const { isFavorite, toggleFavorite } = useFavorites();
  const showToast = useToastStore((state) => state.showToast);
  const [isShared, setIsShared] = useState(false);
  const [deletedToast, setDeletedToast] = useState<{
    id: string;
    name: string;
    kind: 'file' | 'directory';
  } | null>(null);
  const [favoriteToast, setFavoriteToast] = useState<{
    id: string;
    name: string;
    wasAdded: boolean;
  } | null>(null);

  // Breadcrumbs
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [isLoadingBreadcrumbs, setIsLoadingBreadcrumbs] = useState(false);

  // Используем refs для предотвращения повторных вызовов
  const redirectDone = useRef(false);
  const isLoadingBreadcrumbsRef = useRef(false);
  const [actualId, setActualId] = useState<string | null>(null);

  // --- Функция загрузки breadcrumbs ---
  const loadBreadcrumbs = useCallback(
    async (directoryId: string, isSharedDir: boolean) => {
      if (!accessToken) return;

      // Предотвращаем повторные вызовы
      if (isLoadingBreadcrumbsRef.current) {
        return;
      }

      isLoadingBreadcrumbsRef.current = true;
      setIsLoadingBreadcrumbs(true);
      setBreadcrumbs([]);

      try {
        const crumbs: BreadcrumbItem[] = [];

        if (isSharedDir) {
          const currentDir = await getDirectory(accessToken, directoryId);
          crumbs.push({
            id: currentDir.id,
            name: currentDir.name,
            isRoot: false,
            isShared: true,
          });
          setBreadcrumbs([...crumbs]);
          setIsLoadingBreadcrumbs(false);
          isLoadingBreadcrumbsRef.current = false;
          return;
        }

        const currentDir = await getDirectory(accessToken, directoryId);
        if (currentDir.type === 'root') {
          crumbs.push({
            id: currentDir.id,
            name: 'Личное хранилище',
            isRoot: true,
          });
          setBreadcrumbs([...crumbs]);
          setIsLoadingBreadcrumbs(false);
          isLoadingBreadcrumbsRef.current = false;
          return;
        }

        let parentId = currentDir.parent_id;
        crumbs.push({
          id: currentDir.id,
          name: currentDir.name,
        });

        while (parentId) {
          const parentDir = await getDirectory(accessToken, parentId);
          const parentIsShared = checkIsShared(parentId);

          if (parentIsShared) {
            crumbs.unshift({
              id: parentDir.id,
              name: parentDir.name,
              isRoot: false,
              isShared: true,
            });
            break;
          } else if (parentDir.type === 'root') {
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

        setBreadcrumbs([...crumbs]);
      } catch (err) {
        console.error('Failed to load breadcrumbs:', err);
        setBreadcrumbs([
          {
            id: directoryId,
            name: directoryInfo?.name || 'Текущая папка',
            isShared: isSharedDir,
          },
        ]);
      } finally {
        setIsLoadingBreadcrumbs(false);
        isLoadingBreadcrumbsRef.current = false;
      }
    },
    [accessToken, directoryInfo, checkIsShared],
  );

  // --- Функция загрузки содержимого ---
  const loadDirectory = useCallback(
    async (dirId: string) => {
      if (!accessToken || !dirId) return;

      setTargetDirectoryId(dirId);

      setIsLoading(true);
      setError(null);

      try {
        const [info, contents] = await Promise.all([
          getDirectoryById(accessToken, dirId),
          getDirectoryContents(accessToken, dirId),
        ]);

        setDirectoryInfo(info);
        setDirectoryContents(contents);

        // Проверяем, является ли директория общей
        const shared = checkIsShared(dirId);
        setIsShared(shared);

        // Загружаем breadcrumbs
        await loadBreadcrumbs(dirId, shared);
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
    [accessToken, navigate, loadBreadcrumbs, checkIsShared, setTargetDirectoryId],
  );

  // --- Обработчик навигации по breadcrumbs ---
  const handleBreadcrumbClick = useCallback(
    async (crumbId: string) => {
      navigate(`/directories/${crumbId}`);
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
    if (id && id !== 'personal' && id !== actualId && accessToken && !isLoadingShared) {
      setActualId(id);
      loadDirectory(id);
    }
  }, [id, actualId, accessToken, loadDirectory, isLoadingShared]);

  // --- Эффект 3: Перепроверяем статус общей директории ---
  useEffect(() => {
    if (!isLoadingShared && actualId && accessToken) {
      const shared = checkIsShared(actualId);

      // Обновляем статус только если он изменился
      if (shared !== isShared) {
        setIsShared(shared);
        // Перезагружаем breadcrumbs только если статус изменился
        loadBreadcrumbs(actualId, shared);
      }
    }
  }, [isLoadingShared, actualId, accessToken, checkIsShared, loadBreadcrumbs, isShared]);

  // --- Эффект 4: Обновляем DnD target при изменении actualId ---
  useEffect(() => {
    if (actualId) {
      setTargetDirectoryId(actualId);
    }
  }, [actualId, setTargetDirectoryId]);

  // Эффект 5: Регистрируем callback для обновления после загрузки через DnD
  useEffect(() => {
    setOnUploadComplete(() => {
      if (actualId) {
        loadDirectory(actualId);
      }
    });

    return () => {
      setOnUploadComplete(null); // <-- меняем undefined на null
    };
  }, [actualId, loadDirectory, setOnUploadComplete]);

  // Эффект 6: Очищаем DnD target при размонтировании
  useEffect(() => {
    return () => {
      setTargetDirectoryId(null);
      setOnUploadComplete(null); // <-- меняем undefined на null
    };
  }, [setTargetDirectoryId, setOnUploadComplete]);

  // --- Сохраняем режим просмотра ---
  useEffect(() => {
    localStorage.setItem('directoryViewMode', viewMode);
  }, [viewMode]);

  // --- Вычисляемые значения ---
  const isPersonal = useMemo(() => directoryInfo?.type === 'root', [directoryInfo]);
  const isOwner = useMemo(() => directoryInfo?.owner_id === user?.id, [directoryInfo, user]);

  const isSharedDirectory = useMemo(() => {
    return isShared && !isPersonal;
  }, [isShared, isPersonal]);

  // Фильтруем папки: в личном хранилище скрываем общие директории
  const filteredSubdirectories = useMemo(() => {
    if (!directoryContents) return [];

    if (isPersonal) {
      return directoryContents.subdirectories.filter((folder) => !checkIsShared(folder.id));
    }

    return directoryContents.subdirectories;
  }, [directoryContents, isPersonal, checkIsShared]);

  const displayFiles = useMemo(() => {
    if (!directoryContents) return [];

    return directoryContents.files.map((f) => ({
      id: f.id,
      name: f.filename,
      date: formatDate(f.created_at),
      size: formatFileSize(f.size),
      type: resolveFileIconType(f.mime_type, f.extension),
      isFavorite: isFavorite(f.id),
    }));
  }, [directoryContents, isFavorite]);

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

        showToast(buildUploadSuccessMessage(files), 'success');

        // Закрываем модалку после успешной загрузки
        setTimeout(() => {
          setIsUploadModalOpen(false);
          setIsUploading(false);
          setUploadProgress(0);
        }, 500);
      } catch (err) {
        console.error('Upload failed:', err);
        const reason = err instanceof Error ? err.message : undefined;
        setUploadError(reason || 'Ошибка загрузки файлов');
        showToast(buildUploadErrorMessage(files, reason), 'error');
        setIsUploading(false);
        setUploadProgress(0);
      }
    },
    [accessToken, actualId, loadDirectory, showToast],
  );

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim() || !accessToken || !actualId) return;

    setIsCreatingFolder(true);
    try {
      await createDirectory(accessToken, {
        name: newFolderName.trim(),
        parent_id: actualId,
        shared: false,
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
  }, [newFolderName, accessToken, actualId, loadDirectory]);

  const handleDeleteFile = useCallback(
    async (fileId: string) => {
      if (!accessToken || !actualId) return;
      const file = directoryContents?.files.find((f) => f.id === fileId);

      try {
        await softDeleteFile(accessToken, fileId);
        await loadDirectory(actualId);
        setDeletedToast({ id: fileId, name: file?.filename || 'Файл', kind: 'file' });
      } catch (err) {
        console.error('Failed to delete file:', err);
        setError('Не удалось удалить файл');
      }
    },
    [accessToken, actualId, directoryContents, loadDirectory],
  );

  const handleDeleteFolder = useCallback(
    async (folderId: string) => {
      if (!accessToken || !actualId) return;
      const folder = filteredSubdirectories.find((f) => f.id === folderId);

      try {
        await softDeleteDirectory(accessToken, folderId);
        await loadDirectory(actualId);
        setDeletedToast({ id: folderId, name: folder?.name || 'Папка', kind: 'directory' });
      } catch (err) {
        console.error('Failed to delete folder:', err);
        setError('Не удалось удалить папку');
      }
    },
    [accessToken, actualId, filteredSubdirectories, loadDirectory],
  );

  const handleUndoDelete = useCallback(async () => {
    if (!deletedToast || !accessToken) return;

    try {
      if (deletedToast.kind === 'file') {
        await restoreFile(accessToken, deletedToast.id);
      } else {
        await restoreDirectory(accessToken, deletedToast.id);
      }
      if (actualId) await loadDirectory(actualId);
    } catch (err) {
      console.error('Failed to restore item:', err);
    }
  }, [deletedToast, accessToken, actualId, loadDirectory]);

  const handleToggleFavorite = useCallback(
    async (fileId: string) => {
      const file = directoryContents?.files.find((f) => f.id === fileId);
      try {
        const wasAdded = await toggleFavorite(fileId);
        setFavoriteToast({ id: fileId, name: file?.filename || 'Файл', wasAdded });
      } catch (err) {
        console.error('Failed to toggle favorite:', err);
        setError('Не удалось обновить избранное');
      }
    },
    [directoryContents, toggleFavorite],
  );

  const handleUndoFavorite = useCallback(async () => {
    if (!favoriteToast) return;
    try {
      await toggleFavorite(favoriteToast.id);
    } catch (err) {
      console.error('Failed to undo favorite:', err);
    }
    setFavoriteToast(null);
  }, [favoriteToast, toggleFavorite]);

  // --- Рендер breadcrumbs ---
  const renderBreadcrumbs = () => {
    if (isLoadingBreadcrumbs || isLoadingShared) {
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
                  ) : crumb.isShared ? (
                    <span className="flex items-center gap-1">
                      <Users size={14} className="text-brand" />
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
                  ) : crumb.isShared ? (
                    <span className="flex items-center gap-1">
                      <Users size={14} />
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
  if (isLoading || isLoadingShared) {
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

  const { files } = directoryContents;
  const isEmpty = filteredSubdirectories.length === 0 && files.length === 0;

  const canModify = isPersonal || isOwner;

  return (
    <div className="space-y-6 pb-10">
      {/* Заголовок */}
      <div>
        <h1 className="text-2xl font-semibold text-theme-primary flex items-center gap-2">
          {isPersonal ? 'Личное хранилище' : directoryContents.name}
          {isSharedDirectory && (
            <span className="text-xs font-medium px-2 py-0.5 bg-brand/10 text-brand rounded-full">
              Общая
            </span>
          )}
        </h1>
        <p className="text-sm text-theme-muted mt-0.5">
          {isPersonal
            ? 'Ваши личные файлы и папки'
            : isSharedDirectory
              ? isOwner
                ? 'Ваша общая директория'
                : 'Общая директория, доступная вам'
              : isOwner
                ? 'Ваша директория'
                : 'Доступная директория'}
        </p>

        <div className="mt-2">{renderBreadcrumbs()}</div>
      </div>

      {/* Кнопки действий */}
      {(isPersonal || isOwner) && (
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
      )}

      {!isPersonal && !isOwner && (
        <div className="flex items-center justify-end gap-2 flex-wrap -mt-2">
          <ViewToggle viewMode={viewMode} onViewModeChange={handleViewModeChange} />
        </div>
      )}

      {/* Настройки директории */}
      {isSharedDirectory && isOwner && (
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
          {canModify ? (
            <DropZone
              onFilesDrop={handleFilesDrop}
              isUploading={isUploading}
              uploadProgress={uploadProgress}
              uploadError={uploadError}
              className="min-h-[300px]"
            />
          ) : (
            <div className="min-h-[300px] flex items-center justify-center border-2 border-dashed border-theme-hover rounded-theme-lg bg-theme-tertiary">
              <p className="text-theme-muted">Директория пуста</p>
            </div>
          )}
          <div className="text-center mt-6">
            <p className="text-sm text-theme-secondary">
              {canModify ? (
                <>
                  <button
                    onClick={() => setIsCreateFolderModalOpen(true)}
                    className="text-brand hover:text-brand-hover font-medium"
                  >
                    Создайте свою первую папку
                  </button>
                  <br />
                  для удобного хранения файлов
                </>
              ) : (
                'У вас нет прав для добавления файлов в эту директорию'
              )}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Папки */}
          {filteredSubdirectories.length > 0 && (
            <div>
              <div className="bg-theme-secondary border border-theme rounded-theme-lg p-4 shadow-theme-card">
                <h2 className="text-sm font-medium text-theme-secondary mb-3">Папки</h2>
                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {filteredSubdirectories.map((folder) => (
                      <FolderGridItem
                        key={folder.id}
                        id={folder.id}
                        name={folder.name}
                        to={`/directories/${folder.id}`}
                        onDelete={
                          canModify && !checkIsShared(folder.id) ? handleDeleteFolder : undefined
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredSubdirectories.map((folder) => (
                      <FolderItem
                        key={folder.id}
                        id={folder.id}
                        name={folder.name}
                        to={`/directories/${folder.id}`}
                        onDelete={
                          canModify && !checkIsShared(folder.id) ? handleDeleteFolder : undefined
                        }
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
                        isFavorite={file.isFavorite}
                        onToggleFavorite={handleToggleFavorite}
                        onDelete={canModify ? handleDeleteFile : undefined}
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
                        isFavorite={file.isFavorite}
                        onToggleFavorite={handleToggleFavorite}
                        onDelete={canModify ? handleDeleteFile : undefined}
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

      {/* Уведомления */}
      {(deletedToast || favoriteToast) && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
          {favoriteToast && (
            <Toast
              variant="favorite"
              message={`«${favoriteToast.name}» ${favoriteToast.wasAdded ? 'добавлен в избранное' : 'удалён из избранного'}`}
              actionLabel="Отменить"
              onAction={handleUndoFavorite}
              onClose={() => setFavoriteToast(null)}
            />
          )}
          {deletedToast && (
            <Toast
              variant="undo"
              message={`«${deletedToast.name}» перемещ${deletedToast.kind === 'directory' ? 'ена' : 'ён'} в корзину`}
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

export default DirectoryPage;
