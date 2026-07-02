import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Upload, Folder, FolderPlus, Settings, ChevronRight, Home, Users, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useDirectoryStore } from '../store/directoryStore';
import { useDragDropStore } from '../store/dragDropStore';
import { useSharedDirectories } from '../hooks/useSharedDirectories';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { Modal } from '../components/ui/Modal';
import { DropZone } from '../components/ui/DropZone';
import { ViewToggle, ViewMode } from '../components/ui/ViewToggle';
import { Button } from '../components/ui/Button';
import { FolderGridItem } from '../components/ui/FolderGridItem';
import { FileGridItem } from '../components/ui/FileGridItem';
import { FolderItem } from '../components/ui/FolderItem';
import { FileItem } from '../components/ui/FileItem';
import { MoveFileModal } from '../components/ui/MoveFileModal';
import { ShareLinkModal } from '../components/ui/ShareLinkModal';
import { ConvertModal } from '../components/ui/ConvertModal';
import { useFileConversion } from '../hooks/useFileConversion';
import {
  getDirectoryContents,
  getDirectoryById,
  getDirectoryPath,
  createDirectory,
  softDeleteDirectory,
  restoreDirectory,
  DirectoryContents,
  Directory,
  DirectoryPaginationParams,
  File as DirectoryFile,
} from '../api/directories';
import {
  uploadFilesWithProgress,
  softDeleteFile,
  restoreFile,
  moveFile,
  getFileContentUrl,
} from '../api/files';
import { createShareLink, createDirectoryShareLink } from '../api/sharelinks';
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
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const { personalStorageId, currentSection, setCurrentSection } = useDirectoryStore();
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
  const { isConverting, conversionProgress, convertAndDownload, convertAndSave } =
    useFileConversion();
  const [isShared, setIsShared] = useState(false);
  const [isDirectlyShared, setIsDirectlyShared] = useState(false);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [moveFileId, setMoveFileId] = useState<string>('');
  const [moveFileName, setMoveFileName] = useState<string>('');
  const [shareModalState, setShareModalState] = useState<{
    itemId: string;
    itemName: string;
    itemType: 'file' | 'directory';
  } | null>(null);
  const [shareLinkRefreshKey, setShareLinkRefreshKey] = useState(0);
  const [convertFileData, setConvertFileData] = useState<{
    id: string;
    filename: string;
    mimeType: string;
    extension: string;
  } | null>(null);

  // Pagination
  const PAGE_LIMIT = 20;
  const [allSubdirectories, setAllSubdirectories] = useState<Directory[]>([]);
  const [allFiles, setAllFiles] = useState<DirectoryFile[]>([]);
  const [filesCursor, setFilesCursor] = useState<string | undefined>();
  const [dirsCursor, setDirsCursor] = useState<string | undefined>();
  const [hasMoreFiles, setHasMoreFiles] = useState(false);
  const [hasMoreDirs, setHasMoreDirs] = useState(false);
  const [isLoadingMoreDirs, setIsLoadingMoreDirs] = useState(false);
  const [isLoadingMoreFiles, setIsLoadingMoreFiles] = useState(false);

  // Breadcrumbs
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const location = useLocation();

  // Используем refs для предотвращения повторных вызовов
  const redirectDone = useRef(false);
  const isUndoingRef = useRef(false);
  const breadcrumbLoadIdRef = useRef(0);
  const [actualId, setActualId] = useState<string | null>(null);

  // --- Функция загрузки breadcrumbs ---
  const loadBreadcrumbs = useCallback(
    async (directoryId: string): Promise<boolean> => {
      if (!accessToken) return false;

      const crumbId = ++breadcrumbLoadIdRef.current;

      try {
        const { path } = await getDirectoryPath(accessToken, directoryId);

        const crumbs: BreadcrumbItem[] = path.map((item) => ({
          id: item.id,
          name: item.type === 'root' ? 'Личное хранилище' : item.name,
          isRoot: item.type === 'root',
          isShared: item.is_shared,
        }));

        if (crumbId !== breadcrumbLoadIdRef.current) return false;
        setBreadcrumbs(crumbs);
        return crumbs.some((c) => c.isShared);
      } catch {
        if (crumbId !== breadcrumbLoadIdRef.current) return false;
        setBreadcrumbs([
          {
            id: directoryId,
            name: directoryInfo?.name || 'Текущая папка',
          },
        ]);
        return false;
      }
    },
    [accessToken, directoryInfo],
  );

  // --- Функция загрузки содержимого ---
  const loadDirectory = useCallback(
    async (dirId: string, skipLoading = false) => {
      if (!accessToken || !dirId) return;

      setTargetDirectoryId(dirId);

      if (!skipLoading) {
        setIsLoading(true);
      }
      setError(null);

      try {
        const pagination: DirectoryPaginationParams = {
          files_limit: PAGE_LIMIT,
          dirs_limit: PAGE_LIMIT,
        };

        const [info, contents] = await Promise.all([
          getDirectoryById(accessToken, dirId),
          getDirectoryContents(accessToken, dirId, pagination),
        ]);

        setDirectoryInfo(info);
        setDirectoryContents(contents);
        setAllSubdirectories(contents.subdirectories);
        setAllFiles(contents.files);
        setFilesCursor(contents.next_files_cursor);
        setDirsCursor(contents.next_dirs_cursor);
        setHasMoreFiles(!!contents.next_files_cursor);
        setHasMoreDirs(!!contents.next_dirs_cursor);

        // Определяем, является ли директория общей (по данным с бэка)
        const shared = info.shared_directory_id != null;
        setIsDirectlyShared(checkIsShared(dirId));

        // Загружаем breadcrumbs
        try {
          await loadBreadcrumbs(dirId);
          setIsShared(shared);
          if (!isLoadingShared) {
            setCurrentSection(shared ? 'shared' : 'personal');
          }
        } catch (err) {
          setIsShared(shared);
          if (!isLoadingShared) {
            setCurrentSection(shared ? 'shared' : 'personal');
          }
          console.debug('Breadcrumbs loading failed, continuing with page render');
        }
      } catch (err) {
        console.error('Failed to load directory:', err);
        if (err instanceof Error && err.message?.includes('404')) {
          navigate('/dashboard', { replace: true });
        } else {
          setError('Не удалось загрузить содержимое директории');
        }
      } finally {
        if (!skipLoading) {
          setIsLoading(false);
        }
      }
    },
    [accessToken, navigate, loadBreadcrumbs, setTargetDirectoryId, isLoadingShared, user?.id],
  );

  // --- Обработчик навигации по breadcrumbs ---
  // Просто переходим на URL — Effect 2 подхватит и загрузит директорию
  const handleBreadcrumbClick = useCallback(
    (crumbId: string) => {
      navigate(`/directories/${crumbId}`);
    },
    [navigate],
  );

  // --- Эффект 1: Обработка 'personal' ID (только редирект, без загрузки) ---
  useEffect(() => {
    if (redirectDone.current || !accessToken) return;

    if (id === 'personal') {
      const rootId = personalStorageId || localStorage.getItem('rootDirectoryId');
      if (rootId && rootId !== 'personal') {
        redirectDone.current = true;
        navigate(`/directories/${rootId}`, { replace: true });
      }
    } else if (id) {
      redirectDone.current = true;
    }
  }, [id, personalStorageId, accessToken, navigate]);

  // --- Эффект 2: Обновление при изменении ID в URL ---
  useEffect(() => {
    if (id && id !== 'personal' && id !== actualId && accessToken) {
      const prevId = actualId;
      setActualId(id);

      // Определяем раздел до начала загрузки, чтобы сайдбар не моргал
      if (id === personalStorageId) {
        setCurrentSection('personal');
      } else if (prevId && currentSection) {
        setCurrentSection(currentSection);
      }

      loadDirectory(id);
    }
  }, [
    id,
    actualId,
    accessToken,
    loadDirectory,
    personalStorageId,
    currentSection,
    setCurrentSection,
  ]);

  // Эффект 3: Когда список общих директорий загрузился,
  // обновляем isDirectlyShared (checkIsShared мог вернуть false,
  // если список общих директорий ещё не загрузился).
  // Хлебные крошки и isShared уже корректны — они приходят с бэка
  // и не зависят от isLoadingShared.
  useEffect(() => {
    if (!isLoadingShared && actualId && accessToken && directoryInfo) {
      setIsDirectlyShared(checkIsShared(actualId));
      const shared = directoryInfo.shared_directory_id != null;
      if (shared !== isShared) {
        setIsShared(shared);
        setCurrentSection(shared ? 'shared' : 'personal');
      }
    }
  }, [isLoadingShared, actualId, accessToken, directoryInfo, user?.id, checkIsShared, isShared]);

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

  // Эффект 7: Обработка возврата из просмотра файла
  useEffect(() => {
    if (!accessToken || !id) return;

    const state = location.state as { fromFile?: boolean; directoryId?: string } | null;

    if (state?.fromFile && state?.directoryId) {
      // Сбрасываем state, чтобы при обновлении страницы не было проблем
      navigate(location.pathname, { replace: true, state: {} });

      // Если ID из state отличается от текущего в URL — загружаем его.
      // Если совпадает — Effect 2 уже загрузит директорию при монтировании.
      if (state.directoryId !== id) {
        loadDirectory(state.directoryId);
      }
    }
  }, [accessToken, id, location.state, location.pathname, navigate, loadDirectory]);

  // --- Сохраняем режим просмотра ---
  useEffect(() => {
    localStorage.setItem('directoryViewMode', viewMode);
  }, [viewMode]);

  // --- Вычисляемые значения ---
  const isPersonal = useMemo(() => directoryInfo?.type === 'root', [directoryInfo]);
  const isOwner = useMemo(() => directoryInfo?.owner_id === user?.id, [directoryInfo, user]);
  const perms = useMemo(() => directoryInfo?.permissions, [directoryInfo]);

  const isSharedDirectory = useMemo(() => {
    return isDirectlyShared && !isPersonal;
  }, [isDirectlyShared, isPersonal]);

  // Сбрасываем при уходе со страницы
  useEffect(() => {
    return () => setCurrentSection(null);
  }, [setCurrentSection]);

  // Фильтруем папки: в личном хранилище скрываем общие директории
  const filteredSubdirectories = useMemo(() => {
    if (isPersonal) {
      return allSubdirectories.filter((folder) => !checkIsShared(folder.id));
    }
    return allSubdirectories;
  }, [allSubdirectories, isPersonal, checkIsShared]);

  const formattedFiles = useMemo(() => {
    return allFiles.map((f) => ({
      id: f.id,
      name: f.filename,
      date: formatDate(f.created_at),
      size: formatFileSize(f.size),
      type: resolveFileIconType(f.mime_type, f.extension),
      isFavorite: isFavorite(f.id),
      has_share_links: f.has_share_links,
    }));
  }, [allFiles, isFavorite]);

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

        await loadDirectory(actualId, true);

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

      await loadDirectory(actualId, true);
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
      const file = allFiles.find((f) => f.id === fileId);

      try {
        await softDeleteFile(accessToken, fileId);
        await loadDirectory(actualId, true);
        const name = file?.filename || 'Файл';
        let undoing = false;
        showToast(`«${name}» перемещён в корзину`, 'undo', 'Отменить', async () => {
          if (undoing) return;
          undoing = true;
          try {
            await restoreFile(accessToken, fileId);
            if (actualId) await loadDirectory(actualId, true);
          } catch (err) {
            console.error('Failed to restore file:', err);
          }
        });
      } catch (err) {
        console.error('Failed to delete file:', err);
        setError('Не удалось удалить файл');
      }
    },
    [accessToken, actualId, allFiles, loadDirectory, showToast],
  );

  const handleDeleteFolder = useCallback(
    async (folderId: string) => {
      if (!accessToken || !actualId) return;
      const folder = filteredSubdirectories.find((f) => f.id === folderId);

      try {
        await softDeleteDirectory(accessToken, folderId);
        await loadDirectory(actualId, true);
        const name = folder?.name || 'Папка';
        let undoing = false;
        showToast(`«${name}» перемещена в корзину`, 'undo', 'Отменить', async () => {
          if (undoing) return;
          undoing = true;
          try {
            await restoreDirectory(accessToken, folderId);
            if (actualId) await loadDirectory(actualId, true);
          } catch (err) {
            console.error('Failed to restore folder:', err);
          }
        });
      } catch (err) {
        console.error('Failed to delete folder:', err);
        setError('Не удалось удалить папку');
      }
    },
    [accessToken, actualId, filteredSubdirectories, loadDirectory, showToast],
  );

  const handleToggleFavorite = useCallback(
    async (fileId: string) => {
      const file = allFiles.find((f) => f.id === fileId);
      try {
        const wasAdded = await toggleFavorite(fileId);
        const name = file?.filename || 'Файл';
        let undoing = false;
        showToast(
          `«${name}» ${wasAdded ? 'добавлен в избранное' : 'удалён из избранного'}`,
          'favorite',
          'Отменить',
          async () => {
            if (undoing) return;
            undoing = true;
            try {
              await toggleFavorite(fileId);
            } catch (err) {
              console.error('Failed to undo favorite:', err);
            }
          },
        );
      } catch (err) {
        console.error('Failed to toggle favorite:', err);
        setError('Не удалось обновить избранное');
      }
    },
    [allFiles, toggleFavorite, showToast],
  );

  const handleDownload = useCallback(
    async (fileId: string) => {
      if (!accessToken) return;
      const file = allFiles.find((f) => f.id === fileId);
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
    [accessToken, allFiles, showToast],
  );

  const handleConvert = useCallback(
    (fileId: string) => {
      const file = allFiles.find((f) => f.id === fileId);
      if (!file) return;
      setConvertFileData({
        id: file.id,
        filename: file.filename,
        mimeType: file.mime_type,
        extension: file.extension,
      });
    },
    [allFiles],
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
      if (actualId) {
        await loadDirectory(actualId, true);
      }
      return resultFileId;
    },
    [convertFileData, convertAndSave, actualId, loadDirectory],
  );

  const loadMoreDirs = useCallback(() => {
    if (!accessToken || !actualId || !dirsCursor || isLoadingMoreDirs) return;
    setIsLoadingMoreDirs(true);
    getDirectoryContents(accessToken, actualId, {
      dirs_limit: PAGE_LIMIT,
      dirs_cursor: dirsCursor,
    })
      .then((c) => {
        setAllSubdirectories((p) => [...p, ...c.subdirectories]);
        setDirsCursor(c.next_dirs_cursor);
        setHasMoreDirs(!!c.next_dirs_cursor);
      })
      .catch((e) => console.error('loadMoreDirs', e))
      .finally(() => setIsLoadingMoreDirs(false));
  }, [accessToken, actualId, dirsCursor, isLoadingMoreDirs]);

  const loadMoreFiles = useCallback(() => {
    if (!accessToken || !actualId || !filesCursor || isLoadingMoreFiles) return;
    setIsLoadingMoreFiles(true);
    getDirectoryContents(accessToken, actualId, {
      files_limit: PAGE_LIMIT,
      files_cursor: filesCursor,
    })
      .then((c) => {
        setAllFiles((p) => [...p, ...c.files]);
        setFilesCursor(c.next_files_cursor);
        setHasMoreFiles(!!c.next_files_cursor);
      })
      .catch((e) => console.error('loadMoreFiles', e))
      .finally(() => setIsLoadingMoreFiles(false));
  }, [accessToken, actualId, filesCursor, isLoadingMoreFiles]);

  const { sentinelRef: dirsSentinelRef } = useInfiniteScroll(
    loadMoreDirs,
    hasMoreDirs && !isLoadingMoreDirs && !!dirsCursor,
  );
  const { sentinelRef: filesSentinelRef } = useInfiniteScroll(
    loadMoreFiles,
    hasMoreFiles && !isLoadingMoreFiles && !!filesCursor,
  );
  const handleMoveFile = useCallback(
    (fileId: string) => {
      const file = allFiles.find((f) => f.id === fileId);
      if (file) {
        setMoveFileId(fileId);
        setMoveFileName(file.filename);
        setIsMoveModalOpen(true);
      }
    },
    [allFiles],
  );

  const handleMoveComplete = useCallback(
    async (fileId: string, fileName: string, fromDirectoryId: string) => {
      let undoing = false;
      showToast(`Файл «${fileName}» перемещён`, 'move', 'Отменить', async () => {
        if (undoing || isUndoingRef.current) return;
        undoing = true;
        isUndoingRef.current = true;
        try {
          await moveFile(accessToken, fileId, fromDirectoryId);
          if (actualId) await loadDirectory(actualId, true);
          showToast(`Файл «${fileName}» возвращён`, 'success');
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Не удалось отменить перемещение';
          showToast(message, 'error');
        } finally {
          isUndoingRef.current = false;
        }
      });

      if (actualId) {
        await loadDirectory(actualId, true);
      }
    },
    [actualId, accessToken, loadDirectory, showToast],
  );

  const handleFileDragStart = useCallback(
    (e: React.DragEvent, fileId: string, fileName: string) => {
      e.dataTransfer.setData('application/x-sharedspace-file-id', fileId);
      e.dataTransfer.setData('application/x-sharedspace-file-name', fileName);
      e.dataTransfer.effectAllowed = 'move';
    },
    [],
  );

  const handleFolderDrop = useCallback(
    async (e: React.DragEvent, folderId: string) => {
      const fileId = e.dataTransfer.getData('application/x-sharedspace-file-id');
      const fileName = e.dataTransfer.getData('application/x-sharedspace-file-name');
      if (!fileId || !accessToken || !actualId) return;

      try {
        await moveFile(accessToken, fileId, folderId);
        await loadDirectory(actualId, true);
        let undoing = false;
        showToast(`Файл «${fileName}» перемещён`, 'move', 'Отменить', async () => {
          if (undoing || isUndoingRef.current) return;
          undoing = true;
          isUndoingRef.current = true;
          try {
            await moveFile(accessToken, fileId, actualId);
            await loadDirectory(actualId, true);
            showToast(`Файл «${fileName}» возвращён`, 'success');
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Не удалось отменить перемещение';
            showToast(message, 'error');
          } finally {
            isUndoingRef.current = false;
          }
        });
      } catch (err) {
        console.error('Failed to move file via drag & drop:', err);
        const message = err instanceof Error ? err.message : 'Не удалось переместить файл';
        showToast(message, 'error');
      }
    },
    [accessToken, actualId, loadDirectory, showToast],
  );

  // --- Рендер breadcrumbs ---
  const renderBreadcrumbs = () => {
    if (isLoadingShared) {
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
                  disabled={isLoading}
                  className={`text-theme-secondary transition-colors ${isLoading ? 'cursor-not-allowed opacity-50' : 'hover:text-brand cursor-pointer'}`}
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

  const isEmpty = filteredSubdirectories.length === 0 && allFiles.length === 0;

  return (
    <div className="space-y-6 pb-10">
      {/* Назад к списку общих директорий */}
      {isSharedDirectory && (
        <button
          onClick={() => navigate('/directories')}
          className="inline-flex items-center gap-2 text-sm text-theme-secondary hover:text-theme-primary transition-colors"
        >
          <ArrowLeft size={16} />
          Вернуться к общим директориям
        </button>
      )}

      {/* Заголовок */}
      <div>
        <h1 className="text-2xl font-semibold text-theme-primary flex items-center gap-2">
          <Folder size={28} className="text-brand shrink-0" />
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
      <div className="flex items-center justify-end gap-2 flex-wrap -mt-2">
        {perms?.upload && (
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
        )}

        {perms?.create_folder && (
          <button
            onClick={() => setIsCreateFolderModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 border border-theme bg-theme-secondary text-theme-secondary hover:text-theme-primary hover:bg-theme-hover rounded-theme-md transition-colors text-sm font-medium"
          >
            <FolderPlus size={16} />
            Новая папка
          </button>
        )}

        <ViewToggle viewMode={viewMode} onViewModeChange={handleViewModeChange} />
      </div>

      {/* Настройки директории / участники */}
      {isSharedDirectory && (
        <div className="flex justify-end">
          <button
            onClick={() => navigate(`/shared/${actualId}/settings`)}
            className="inline-flex items-center gap-2 px-4 py-2 border border-theme bg-theme-secondary text-theme-secondary hover:text-theme-primary hover:bg-theme-hover rounded-theme-md transition-colors text-sm font-medium"
          >
            <Settings size={16} />
            {perms?.invite ? 'Настройки директории' : 'Участники'}
          </button>
        </div>
      )}

      {/* Содержимое */}
      {isEmpty ? (
        <div className="mt-4">
          {perms?.upload ? (
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
              {perms?.create_folder ? (
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
                        hasShareLinks={folder.has_share_links}
                        onDelete={
                          (folder.permissions?.delete ?? perms?.delete) && !checkIsShared(folder.id)
                            ? handleDeleteFolder
                            : undefined
                        }
                        onShare={(id) => {
                          const f = filteredSubdirectories.find((d) => d.id === id);
                          if (f)
                            setShareModalState({
                              itemId: f.id,
                              itemName: f.name,
                              itemType: 'directory',
                            });
                        }}
                        onDrop={handleFolderDrop}
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
                        hasShareLinks={folder.has_share_links}
                        onDelete={
                          (folder.permissions?.delete ?? perms?.delete) && !checkIsShared(folder.id)
                            ? handleDeleteFolder
                            : undefined
                        }
                        onShare={(id) => {
                          const f = filteredSubdirectories.find((d) => d.id === id);
                          if (f)
                            setShareModalState({
                              itemId: f.id,
                              itemName: f.name,
                              itemType: 'directory',
                            });
                        }}
                        onDrop={handleFolderDrop}
                      />
                    ))}
                  </div>
                )}
                {hasMoreDirs && (
                  <div className="mt-3 flex items-center justify-center gap-3">
                    {isLoadingMoreDirs && (
                      <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                    )}
                    <div ref={dirsSentinelRef} className="h-2" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Файлы */}
          {allFiles.length > 0 && (
            <div>
              <div className="bg-theme-secondary border border-theme rounded-theme-lg p-4 shadow-theme-card">
                <h2 className="text-sm font-medium text-theme-secondary mb-3">Файлы</h2>
                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {formattedFiles.map((file) => (
                      <FileGridItem
                        key={file.id}
                        id={file.id}
                        name={file.name}
                        type={file.type}
                        to={`/files/${file.id}`}
                        isFavorite={file.isFavorite}
                        hasShareLinks={file.has_share_links}
                        onToggleFavorite={handleToggleFavorite}
                        onDelete={perms?.delete ? handleDeleteFile : undefined}
                        onMove={handleMoveFile}
                        onDownload={handleDownload}
                        onConvert={handleConvert}
                        onShare={(id) => {
                          const f = formattedFiles.find((d) => d.id === id);
                          if (f)
                            setShareModalState({
                              itemId: f.id,
                              itemName: f.name,
                              itemType: 'file',
                            });
                        }}
                        onDragStart={handleFileDragStart}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {formattedFiles.map((file) => (
                      <FileItem
                        key={file.id}
                        id={file.id}
                        name={file.name}
                        date={file.date}
                        size={file.size}
                        type={file.type}
                        to={`/files/${file.id}`}
                        isFavorite={file.isFavorite}
                        hasShareLinks={file.has_share_links}
                        onToggleFavorite={handleToggleFavorite}
                        onDelete={perms?.delete ? handleDeleteFile : undefined}
                        onMove={handleMoveFile}
                        onDownload={handleDownload}
                        onConvert={handleConvert}
                        onShare={(id) => {
                          const f = formattedFiles.find((d) => d.id === id);
                          if (f)
                            setShareModalState({
                              itemId: f.id,
                              itemName: f.name,
                              itemType: 'file',
                            });
                        }}
                        onDragStart={handleFileDragStart}
                      />
                    ))}
                  </div>
                )}
                {hasMoreFiles && (
                  <div className="mt-3 flex items-center justify-center gap-3">
                    {isLoadingMoreFiles && (
                      <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                    )}
                    <div ref={filesSentinelRef} className="h-2" />
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

      {shareModalState && accessToken && (
        <ShareLinkModal
          isOpen={true}
          onClose={() => setShareModalState(null)}
          itemId={shareModalState.itemId}
          itemName={shareModalState.itemName}
          itemType={shareModalState.itemType}
          accessToken={accessToken}
          onLinksChanged={(hasLinks) => {
            if (shareModalState.itemType === 'file') {
              setAllFiles((prev) =>
                prev.map((f) =>
                  f.id === shareModalState.itemId ? { ...f, has_share_links: hasLinks } : f,
                ),
              );
            } else {
              setAllSubdirectories((prev) =>
                prev.map((d) =>
                  d.id === shareModalState.itemId ? { ...d, has_share_links: hasLinks } : d,
                ),
              );
            }
          }}
          onLinkDeleted={(info) => {
            const itemId = shareModalState.itemId;
            const itemType = shareModalState.itemType;
            const { accessType, expiresAt } = info;
            let undoing = false;
            showToast('Ссылка общего доступа удалена', 'undo', 'Отменить', async () => {
              if (undoing) return;
              undoing = true;
              try {
                const body = { access_type: accessType, expires_at: expiresAt };
                if (itemType === 'file') {
                  await createShareLink(accessToken, itemId, body);
                } else {
                  await createDirectoryShareLink(accessToken, itemId, body);
                }
                refreshUser();
                if (itemType === 'file') {
                  setAllFiles((prev) =>
                    prev.map((f) => (f.id === itemId ? { ...f, has_share_links: true } : f)),
                  );
                  setDirectoryContents((prev) => {
                    if (!prev) return prev;
                    return {
                      ...prev,
                      files: prev.files.map((f) =>
                        f.id === itemId ? { ...f, has_share_links: true } : f,
                      ),
                    };
                  });
                } else {
                  setAllSubdirectories((prev) =>
                    prev.map((d) => (d.id === itemId ? { ...d, has_share_links: true } : d)),
                  );
                  setDirectoryContents((prev) => {
                    if (!prev) return prev;
                    return {
                      ...prev,
                      subdirectories: prev.subdirectories.map((d) =>
                        d.id === itemId ? { ...d, has_share_links: true } : d,
                      ),
                    };
                  });
                }
                setShareLinkRefreshKey((k) => k + 1);
              } catch (err) {
                console.error('Failed to undo share link delete:', err);
              }
            });
          }}
          refreshKey={shareLinkRefreshKey}
        />
      )}

      <MoveFileModal
        isOpen={isMoveModalOpen}
        onClose={() => setIsMoveModalOpen(false)}
        fileId={moveFileId}
        fileName={moveFileName}
        currentDirectoryId={actualId || ''}
        onMoveComplete={handleMoveComplete}
      />

      {convertFileData && (
        <ConvertModal
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

      {/* Уведомления — удалены, используется глобальный ToastContainer */}
    </div>
  );
};

export default DirectoryPage;
