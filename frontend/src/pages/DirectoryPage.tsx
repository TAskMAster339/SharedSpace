import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Upload, FolderPlus, Settings, ChevronRight, Home, Users, ArrowLeft } from 'lucide-react';
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
import { MoveFileModal } from '../components/ui/MoveFileModal';
import {
  getDirectoryContents,
  getDirectoryById,
  createDirectory,
  getDirectoryById as getDirectory,
  softDeleteDirectory,
  restoreDirectory,
  DirectoryContents,
  Directory,
  DirectoryPaginationParams,
  File as DirectoryFile,
} from '../api/directories';
import { uploadFilesWithProgress, softDeleteFile, restoreFile, moveFile } from '../api/files';
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
  const { personalStorageId, setCurrentSection } = useDirectoryStore();
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
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [moveFileId, setMoveFileId] = useState<string>('');
  const [moveFileName, setMoveFileName] = useState<string>('');
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
  const [moveToast, setMoveToast] = useState<{
    fileId: string;
    fileName: string;
    fromDirectoryId: string;
    directoryId: string;
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
  const dirsSentinelRef = useRef<HTMLDivElement>(null);
  const filesSentinelRef = useRef<HTMLDivElement>(null);

  // Breadcrumbs
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [isLoadingBreadcrumbs, setIsLoadingBreadcrumbs] = useState(false);
  const location = useLocation();

  // Используем refs для предотвращения повторных вызовов
  const redirectDone = useRef(false);
  const isLoadingBreadcrumbsRef = useRef(false);
  const isUndoingRef = useRef(false);
  const [actualId, setActualId] = useState<string | null>(null);

  // --- Функция загрузки breadcrumbs ---
  // Принимает опциональный currentDir — если передан, пропускает первый запрос getDirectory
  const loadBreadcrumbs = useCallback(
    async (directoryId: string, isSharedDir: boolean, currentDir?: Directory) => {
      if (!accessToken) return;

      if (isLoadingBreadcrumbsRef.current) {
        return;
      }

      isLoadingBreadcrumbsRef.current = true;
      setIsLoadingBreadcrumbs(true);
      setBreadcrumbs([]);

      try {
        const crumbs: BreadcrumbItem[] = [];

        // Получаем текущую директорию
        const current = currentDir || (await getDirectory(accessToken, directoryId));

        // Если это корневая директория личного хранилища
        if (current.type === 'root') {
          crumbs.push({
            id: current.id,
            name: 'Личное хранилище',
            isRoot: true,
          });
          setBreadcrumbs(crumbs);
          setIsLoadingBreadcrumbs(false);
          isLoadingBreadcrumbsRef.current = false;
          return;
        }

        // Проверяем, является ли текущая директория общей
        const currentIsShared = checkIsShared(directoryId);

        if (currentIsShared) {
          // Для общей директории — только она сама, НЕ поднимаемся выше
          crumbs.push({
            id: current.id,
            name: current.name,
            isRoot: false,
            isShared: true,
          });
          setBreadcrumbs(crumbs);
          setIsLoadingBreadcrumbs(false);
          isLoadingBreadcrumbsRef.current = false;
          return;
        }

        // Для обычной папки: строим путь
        crumbs.push({
          id: current.id,
          name: current.name,
        });

        let parentId = current.parent_id;

        // Поднимаемся вверх по родителям
        while (parentId) {
          // Используем try-catch с полным подавлением ошибок
          try {
            const parent = await getDirectory(accessToken, parentId);

            // Проверяем, является ли родитель общей директорией
            const parentIsShared = checkIsShared(parent.id);

            if (parentIsShared) {
              // Если родитель — общая директория, добавляем её и останавливаемся
              crumbs.unshift({
                id: parent.id,
                name: parent.name,
                isRoot: false,
                isShared: true,
              });
              break;
            } else if (parent.type === 'root') {
              // Если родитель — корневая директория личного хранилища
              crumbs.unshift({
                id: parent.id,
                name: 'Личное хранилище',
                isRoot: true,
              });
              break;
            } else {
              // Обычная папка
              crumbs.unshift({
                id: parent.id,
                name: parent.name,
              });
              parentId = parent.parent_id;
            }
          } catch (err) {
            // Полностью игнорируем любые ошибки при получении родителей
            // Это нормально для общих директорий и папок, где нет доступа к родителю
            break;
          }
        }

        setBreadcrumbs(crumbs);
      } catch (err) {
        // Игнорируем ошибки при получении текущей директории
        // Fallback: показываем только текущую папку
        const fallbackName = currentDir?.name || directoryInfo?.name || 'Текущая папка';
        setBreadcrumbs([
          {
            id: directoryId,
            name: fallbackName,
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

        // Определяем, является ли директория общей
        let shared = checkIsShared(dirId);

        // Если директория принадлежит текущему пользователю, проверяем её тип
        // и наличие permissions (признак того, что это общая директория)
        if (info.owner_id === user?.id && info.type !== 'root') {
          // Если у директории есть permissions и она не root, значит она общая
          // (даже если checkIsShared ещё не вернул true из-за задержки)
          if (info.permissions !== undefined) {
            shared = true;
          }
        }

        setIsShared(shared);

        // Загружаем breadcrumbs
        try {
          await loadBreadcrumbs(dirId, shared, info);
        } catch (err) {
          // Игнорируем ошибки breadcrumbs - они не должны блокировать отображение страницы
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
    [accessToken, navigate, loadBreadcrumbs, checkIsShared, setTargetDirectoryId, user?.id],
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
      setMoveToast(null);
      setActualId(id);
      loadDirectory(id);
    }
  }, [id, actualId, accessToken, loadDirectory, isLoadingShared]);

  // Эффект 3: Перепроверяем статус общей директории
  useEffect(() => {
    if (!isLoadingShared && actualId && accessToken && directoryInfo) {
      const shared = checkIsShared(actualId);
      // Если директория принадлежит текущему пользователю и имеет permissions,
      // но checkIsShared вернул false (ещё не загрузилось), проверяем по permissions
      let effectiveShared = shared;
      if (
        directoryInfo.owner_id === user?.id &&
        directoryInfo.type !== 'root' &&
        directoryInfo.permissions !== undefined
      ) {
        effectiveShared = true;
      }

      if (effectiveShared !== isShared) {
        setIsShared(effectiveShared);
        // Перезагружаем breadcrumbs с новым статусом
        if (directoryInfo) {
          loadBreadcrumbs(actualId, effectiveShared, directoryInfo);
        }
      }
    }
  }, [
    isLoadingShared,
    actualId,
    accessToken,
    checkIsShared,
    isShared,
    directoryInfo,
    user?.id,
    loadBreadcrumbs,
  ]);

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

      // Если ID из state отличается от текущего в URL, загружаем его
      if (state.directoryId !== id) {
        loadDirectory(state.directoryId);
      } else {
        // Если тот же ID, просто перезагружаем
        loadDirectory(id);
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
    return isShared && !isPersonal;
  }, [isShared, isPersonal]);

  // Сообщаем боковому меню, в каком разделе мы находимся (личное/общее),
  // чтобы оно подсвечивало правильный пункт. Сбрасываем при уходе со страницы.
  useEffect(() => {
    if (!directoryInfo) return;
    setCurrentSection(isShared ? 'shared' : 'personal');
  }, [directoryInfo, isShared, setCurrentSection]);

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
        setDeletedToast({ id: fileId, name: file?.filename || 'Файл', kind: 'file' });
      } catch (err) {
        console.error('Failed to delete file:', err);
        setError('Не удалось удалить файл');
      }
    },
    [accessToken, actualId, allFiles, loadDirectory],
  );

  const handleDeleteFolder = useCallback(
    async (folderId: string) => {
      if (!accessToken || !actualId) return;
      const folder = filteredSubdirectories.find((f) => f.id === folderId);

      try {
        await softDeleteDirectory(accessToken, folderId);
        await loadDirectory(actualId, true);
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
      if (actualId) await loadDirectory(actualId, true);
    } catch (err) {
      console.error('Failed to restore item:', err);
    }
  }, [deletedToast, accessToken, actualId, loadDirectory]);

  const handleToggleFavorite = useCallback(
    async (fileId: string) => {
      const file = allFiles.find((f) => f.id === fileId);
      try {
        const wasAdded = await toggleFavorite(fileId);
        setFavoriteToast({ id: fileId, name: file?.filename || 'Файл', wasAdded });
      } catch (err) {
        console.error('Failed to toggle favorite:', err);
        setError('Не удалось обновить избранное');
      }
    },
    [allFiles, toggleFavorite],
  );

  // --- Автозагрузка при скролле ---
  // Следим за скроллом и подгружаем, когда сентинель появляется в окне
  const checkAndLoad = useCallback(() => {
    if (!accessToken || !actualId) return;

    // Папки
    if (hasMoreDirs && !isLoadingMoreDirs && dirsCursor) {
      const el = dirsSentinelRef.current;
      if (el && el.getBoundingClientRect().top < window.innerHeight + 300) {
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
      }
    }

    // Файлы
    if (hasMoreFiles && !isLoadingMoreFiles && filesCursor) {
      const el = filesSentinelRef.current;
      if (el && el.getBoundingClientRect().top < window.innerHeight + 300) {
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
      }
    }
  }, [
    accessToken,
    actualId,
    hasMoreDirs,
    isLoadingMoreDirs,
    dirsCursor,
    hasMoreFiles,
    isLoadingMoreFiles,
    filesCursor,
  ]);

  // Проверяем при скролле, ресайзе и после каждого рендера
  useEffect(() => {
    checkAndLoad();
    window.addEventListener('scroll', checkAndLoad, { passive: true });
    window.addEventListener('resize', checkAndLoad, { passive: true });
    return () => {
      window.removeEventListener('scroll', checkAndLoad);
      window.removeEventListener('resize', checkAndLoad);
    };
  }, [checkAndLoad]);

  const handleUndoFavorite = useCallback(async () => {
    if (!favoriteToast) return;
    try {
      await toggleFavorite(favoriteToast.id);
    } catch (err) {
      console.error('Failed to undo favorite:', err);
    }
    setFavoriteToast(null);
  }, [favoriteToast, toggleFavorite]);

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
      setMoveToast({ fileId, fileName, fromDirectoryId, directoryId: actualId || '' });

      if (actualId) {
        await loadDirectory(actualId, true);
      }
    },
    [actualId, loadDirectory],
  );

  const handleUndoMove = useCallback(async () => {
    if (!moveToast || !accessToken || isUndoingRef.current) return;
    isUndoingRef.current = true;

    try {
      await moveFile(accessToken, moveToast.fileId, moveToast.fromDirectoryId);
      if (moveToast.directoryId) await loadDirectory(moveToast.directoryId, true);
      showToast(`Файл «${moveToast.fileName}» возвращён`, 'success');
      setMoveToast(null);
    } catch (err) {
      console.error('Failed to undo move:', err);
      const message = err instanceof Error ? err.message : 'Не удалось отменить перемещение';
      showToast(message, 'error');
    } finally {
      isUndoingRef.current = false;
    }
  }, [moveToast, accessToken, loadDirectory, showToast]);

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
        setMoveToast({ fileId, fileName, fromDirectoryId: actualId, directoryId: actualId });
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
                  className="text-theme-secondary hover:text-brand transition-colors cursor-pointer"
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
                        onDelete={
                          (folder.permissions?.delete ?? perms?.delete) && !checkIsShared(folder.id)
                            ? handleDeleteFolder
                            : undefined
                        }
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
                        onDelete={
                          (folder.permissions?.delete ?? perms?.delete) && !checkIsShared(folder.id)
                            ? handleDeleteFolder
                            : undefined
                        }
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
                        onToggleFavorite={handleToggleFavorite}
                        onDelete={perms?.delete ? handleDeleteFile : undefined}
                        onMove={handleMoveFile}
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
                        onToggleFavorite={handleToggleFavorite}
                        onDelete={perms?.delete ? handleDeleteFile : undefined}
                        onMove={handleMoveFile}
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

      <MoveFileModal
        isOpen={isMoveModalOpen}
        onClose={() => setIsMoveModalOpen(false)}
        fileId={moveFileId}
        fileName={moveFileName}
        currentDirectoryId={actualId || ''}
        onMoveComplete={handleMoveComplete}
      />

      {/* Уведомления */}
      {(deletedToast || favoriteToast || moveToast) && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
          {moveToast && (
            <Toast
              variant="move"
              message={`Файл «${moveToast.fileName}» перемещён`}
              actionLabel="Отменить"
              onAction={handleUndoMove}
              onClose={() => setMoveToast(null)}
            />
          )}
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
