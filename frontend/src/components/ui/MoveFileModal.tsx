import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  X, 
  Folder, 
  ChevronRight, 
  Home, 
  Users, 
  FolderPlus,
  Check,
  Loader2
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { Modal } from './Modal';
import { Button } from './Button';
import { useAuthStore } from '../../store/authStore';
import { useDirectoryStore } from '../../store/directoryStore';
import { useSharedDirectories } from '../../hooks/useSharedDirectories';
import { 
  getDirectoryContents, 
  getDirectoryById,
  createDirectory,
  DirectoryContents,
  Directory 
} from '../../api/directories';
import { moveFile } from '../../api/files';
import { useToastStore } from '../../hooks/useToast';

// Вспомогательный компонент для иконки папки
const FolderIcon = ({ isShared, isRoot }: { isShared?: boolean; isRoot?: boolean }) => {
  if (isRoot) {
    return <Home size={18} className="text-brand" />;
  }
  if (isShared) {
    return <Users size={18} className="text-brand" />;
  }
  return <Folder size={18} className="text-theme-muted" />;
};

interface BreadcrumbItem {
  id: string;
  name: string;
  isRoot?: boolean;
  isShared?: boolean;
}

interface MoveFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;
  fileName: string;
  currentDirectoryId: string;
  onMoveComplete?: () => void;
}

export const MoveFileModal: React.FC<MoveFileModalProps> = ({
  isOpen,
  onClose,
  fileId,
  fileName,
  currentDirectoryId,
  onMoveComplete,
}) => {
  const accessToken = useAuthStore((s) => s.accessToken);
  const { personalStorageId } = useDirectoryStore();
  const { sharedDirectories, isShared: checkIsShared } = useSharedDirectories();
  const showToast = useToastStore((s) => s.showToast);

  const [currentDirId, setCurrentDirId] = useState<string | null>(null);
  const [contents, setContents] = useState<DirectoryContents | null>(null);
  const [directoryInfo, setDirectoryInfo] = useState<Directory | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMoving, setIsMoving] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [selectedDirectoryId, setSelectedDirectoryId] = useState<string | null>(null);

  // Загружаем содержимое директории
  const loadDirectory = useCallback(async (dirId: string) => {
    if (!accessToken) return;

    setIsLoading(true);
    try {
      const [info, data] = await Promise.all([
        getDirectoryById(accessToken, dirId),
        getDirectoryContents(accessToken, dirId),
      ]);

      setDirectoryInfo(info);
      setContents(data);

      // Определяем, является ли директория общей
      const isShared = checkIsShared(dirId);
      const isRoot = info.type === 'root';

      // Строим breadcrumbs
      const crumbs: BreadcrumbItem[] = [];
      
      if (isRoot) {
        crumbs.push({
          id: info.id,
          name: 'Личное хранилище',
          isRoot: true,
        });
      } else if (isShared) {
        crumbs.push({
          id: info.id,
          name: info.name,
          isShared: true,
        });
      } else {
        // Строим путь для обычной папки
        let parentId = info.parent_id;
        const path: BreadcrumbItem[] = [
          { id: info.id, name: info.name }
        ];

        while (parentId) {
          const parent = await getDirectoryById(accessToken, parentId);
          const parentIsShared = checkIsShared(parentId);
          
          if (parentIsShared) {
            path.unshift({
              id: parent.id,
              name: parent.name,
              isShared: true,
            });
            break;
          } else if (parent.type === 'root') {
            path.unshift({
              id: parent.id,
              name: 'Личное хранилище',
              isRoot: true,
            });
            break;
          } else {
            path.unshift({
              id: parent.id,
              name: parent.name,
            });
            parentId = parent.parent_id;
          }
        }

        crumbs.push(...path);
      }

      setBreadcrumbs(crumbs);
    } catch (err) {
      console.error('Failed to load directory:', err);
      showToast('Не удалось загрузить содержимое директории', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, checkIsShared, showToast]);

  // Инициализация - открываем личное хранилище или первый доступный
  useEffect(() => {
    if (!isOpen || !accessToken) return;

    const init = async () => {
      // Начинаем с личного хранилища
      let targetId = personalStorageId;
      
      // Если личное хранилище не загружено, пытаемся получить корневую
      if (!targetId || targetId === 'personal') {
        try {
          // Пробуем получить корневую директорию через API
          const rootContents = await getDirectoryContents(accessToken, 'personal');
          targetId = rootContents.id;
        } catch (err) {
          showToast('Не удалось загрузить личное хранилище', 'error');
          onClose();
          return;
        }
      }

      setCurrentDirId(targetId);
      setSelectedDirectoryId(targetId);
      await loadDirectory(targetId);
    };

    init();
  }, [isOpen, accessToken, personalStorageId, loadDirectory, showToast, onClose]);

  // Навигация по breadcrumbs
  const navigateTo = useCallback(async (dirId: string) => {
    setCurrentDirId(dirId);
    setSelectedDirectoryId(dirId);
    await loadDirectory(dirId);
  }, [loadDirectory]);

  // Создание папки
  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim() || !accessToken || !currentDirId) return;

    setIsCreatingFolder(true);
    try {
      await createDirectory(accessToken, {
        name: newFolderName.trim(),
        parent_id: currentDirId,
        shared: false,
      });

      await loadDirectory(currentDirId);
      setNewFolderName('');
      setShowCreateFolder(false);
      showToast(`Папка «${newFolderName.trim()}» создана`, 'success');
    } catch (err) {
      console.error('Failed to create folder:', err);
      showToast('Не удалось создать папку', 'error');
    } finally {
      setIsCreatingFolder(false);
    }
  }, [newFolderName, accessToken, currentDirId, loadDirectory, showToast]);

  // Перемещение файла
  const handleMove = useCallback(async () => {
    if (!accessToken || !selectedDirectoryId || !fileId) return;

    // Проверяем, что файл не перемещается в ту же директорию
    if (selectedDirectoryId === currentDirectoryId) {
      showToast('Файл уже находится в этой директории', 'info');
      onClose();
      return;
    }

    setIsMoving(true);
    try {
      await moveFile(accessToken, fileId, selectedDirectoryId);

      showToast(`Файл «${fileName}» перемещён`, 'success');
      onMoveComplete?.();
      onClose();
    } catch (err) {
      console.error('Failed to move file:', err);
      const errorMsg = err instanceof Error ? err.message : 'Не удалось переместить файл';
      showToast(errorMsg, 'error');
    } finally {
      setIsMoving(false);
    }
  }, [accessToken, selectedDirectoryId, fileId, currentDirectoryId, fileName, showToast, onMoveComplete, onClose]);

  // Фильтруем папки: исключаем текущую и недоступные для записи
  const availableFolders = useMemo(() => {
    if (!contents) return [];

    // Для личного хранилища показываем все папки
    // Для общих - только те, где пользователь имеет права на загрузку
    return contents.subdirectories.filter((folder) => {
      // Не показываем текущую директорию (куда файл уже перемещён)
      if (folder.id === currentDirectoryId) return false;
      
      // Проверяем права: если папка общая и пользователь viewer - не показываем
      const isShared = checkIsShared(folder.id);
      if (isShared) {
        const sharedDir = sharedDirectories.find((d) => d.directory_id === folder.id);
        if (sharedDir?.role === 'viewer') return false;
      }
      
      return true;
    });
  }, [contents, currentDirectoryId, checkIsShared, sharedDirectories]);

  // Доступные корневые директории для навигации
  const rootDirectories = useMemo(() => {
    const dirs: { id: string; name: string; isRoot: boolean; isShared: boolean }[] = [];

    // Личное хранилище
    if (personalStorageId && personalStorageId !== 'personal') {
      dirs.push({
        id: personalStorageId,
        name: 'Личное хранилище',
        isRoot: true,
        isShared: false,
      });
    }

    // Общие директории, где пользователь может загружать файлы
    sharedDirectories.forEach((d) => {
      if (d.role !== 'viewer') {
        dirs.push({
          id: d.directory_id,
          name: d.name,
          isRoot: false,
          isShared: true,
        });
      }
    });

    return dirs;
  }, [personalStorageId, sharedDirectories]);

  if (!isOpen) return null;

  const isRoot = directoryInfo?.type === 'root';
  const isSharedDir = checkIsShared(currentDirId || '');
  const canWrite = isRoot || !isSharedDir;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Переместить файл «${fileName}»`}
      maxWidth="lg"
    >
      <div className="space-y-4">
        {/* Breadcrumbs */}
        <div className="flex items-center justify-between">
          <nav className="flex items-center gap-1 text-sm flex-wrap">
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              const isFirst = index === 0;
              
              return (
                <React.Fragment key={crumb.id}>
                  {!isFirst && <ChevronRight size={14} className="text-theme-muted shrink-0" />}
                  {isLast ? (
                    <span className="text-theme-primary font-medium">
                      <span className="flex items-center gap-1">
                        <FolderIcon isRoot={crumb.isRoot} isShared={crumb.isShared} />
                        {crumb.name}
                      </span>
                    </span>
                  ) : (
                    <button
                      onClick={() => navigateTo(crumb.id)}
                      className="text-theme-secondary hover:text-brand transition-colors hover:underline cursor-pointer"
                    >
                      <span className="flex items-center gap-1">
                        <FolderIcon isRoot={crumb.isRoot} isShared={crumb.isShared} />
                        {crumb.name}
                      </span>
                    </button>
                  )}
                </React.Fragment>
              );
            })}
          </nav>

          {/* Кнопка создания папки */}
          {canWrite && (
            <button
              onClick={() => setShowCreateFolder(!showCreateFolder)}
              className="p-1.5 rounded-theme-sm text-theme-muted hover:text-brand hover:bg-theme-hover transition-colors"
              title="Создать папку"
            >
              <FolderPlus size={18} />
            </button>
          )}
        </div>

        {/* Создание папки */}
        {showCreateFolder && canWrite && (
          <div className="flex items-center gap-2 bg-theme-tertiary rounded-theme-md p-2">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Название папки..."
              className="flex-1 px-3 py-1.5 rounded-theme-sm border border-theme bg-theme-secondary text-sm text-theme-primary placeholder:text-theme-muted outline-none focus:border-brand transition-colors"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder();
                if (e.key === 'Escape') setShowCreateFolder(false);
              }}
            />
            <button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim() || isCreatingFolder}
              className="px-3 py-1.5 bg-brand text-theme-on-brand rounded-theme-sm hover:bg-brand-hover transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreatingFolder ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                'Создать'
              )}
            </button>
            <button
              onClick={() => setShowCreateFolder(false)}
              className="p-1.5 text-theme-muted hover:text-theme-primary transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Список папок */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {/* Если мы на корневом уровне или в личном хранилище - показываем корневые директории */}
            {breadcrumbs.length <= 1 && (
              <div className="space-y-1 mb-2">
                <div className="text-xs font-medium text-theme-muted uppercase tracking-wider px-2 py-1">
                  Директории
                </div>
                {rootDirectories.map((dir) => (
                  <button
                    key={dir.id}
                    onClick={() => navigateTo(dir.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-theme-md transition-colors text-left',
                      selectedDirectoryId === dir.id
                        ? 'bg-brand-light text-brand'
                        : 'hover:bg-theme-hover text-theme-primary'
                    )}
                  >
                    <FolderIcon isRoot={dir.isRoot} isShared={dir.isShared} />
                    <span className="flex-1 text-sm font-medium">{dir.name}</span>
                    {selectedDirectoryId === dir.id && (
                      <Check size={16} className="text-brand" />
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Папки внутри текущей директории */}
            {availableFolders.length > 0 && (
              <div className="space-y-1">
                {breadcrumbs.length <= 1 && (
                  <div className="text-xs font-medium text-theme-muted uppercase tracking-wider px-2 py-1">
                    Папки
                  </div>
                )}
                {availableFolders.map((folder) => {
                  const isShared = checkIsShared(folder.id);
                  const isSelected = selectedDirectoryId === folder.id;
                  
                  return (
                    <button
                      key={folder.id}
                      onClick={() => {
                        setSelectedDirectoryId(folder.id);
                        navigateTo(folder.id);
                      }}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-theme-md transition-colors text-left',
                        isSelected
                          ? 'bg-brand-light text-brand'
                          : 'hover:bg-theme-hover text-theme-primary'
                      )}
                    >
                      <Folder size={18} className={isSelected ? 'text-brand' : 'text-theme-muted'} />
                      <span className="flex-1 text-sm font-medium">{folder.name}</span>
                      {isShared && (
                        <span className="text-xs px-1.5 py-0.5 bg-brand/10 text-brand rounded-full">
                          Общая
                        </span>
                      )}
                      {isSelected && (
                        <Check size={16} className="text-brand" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {availableFolders.length === 0 && breadcrumbs.length > 1 && (
              <div className="text-center py-8 text-theme-muted text-sm">
                В этой папке нет доступных подпапок
              </div>
            )}
          </div>
        )}

        {/* Кнопки действий */}
        <div className="flex gap-3 pt-4 border-t border-theme">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isMoving}
            className="flex-1"
          >
            Отмена
          </Button>
          <Button
            variant="primary"
            onClick={handleMove}
            disabled={!selectedDirectoryId || selectedDirectoryId === currentDirectoryId || isMoving}
            className="flex-1"
          >
            {isMoving ? (
              <>
                <Loader2 size={16} className="animate-spin mr-2" />
                Перемещение...
              </>
            ) : (
              'Переместить сюда'
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
