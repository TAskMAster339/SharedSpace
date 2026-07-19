import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useDirectoryStore } from '../store/directoryStore';
import { useDragDropStore } from '../store/dragDropStore';
import { useFavorites } from '../hooks/useFavorites';
import { uploadFilesWithProgress } from '../api/files';
import { addFavorite } from '../api/favorites';
import { buildUploadSuccessMessage, buildUploadErrorMessage } from '../utils/uploadMessage';
import { cn } from '../utils/cn';

interface GlobalDropZoneProps {
  children: React.ReactNode;
  onUploadStart?: () => void;
  onUploadEnd?: () => void;
  onFileUploaded?: (file: File, success: boolean, error?: string) => void;
}

export const GlobalDropZone: React.FC<GlobalDropZoneProps> = ({
  children,
  onUploadStart,
  onUploadEnd,
  onFileUploaded,
}) => {
  const location = useLocation();
  const accessToken = useAuthStore((state) => state.accessToken);
  const { personalStorageId } = useDirectoryStore();
  const { targetDirectoryId, triggerUploadComplete } = useDragDropStore();
  const { toggleFavorite } = useFavorites();

  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentDirectoryId, setCurrentDirectoryId] = useState<string | null>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Определяем целевую директорию
  const getTargetDirectory = useCallback(() => {
    // Если задана директория через store (из DirectoryPage) - используем её
    if (targetDirectoryId) {
      return targetDirectoryId;
    }

    const path = location.pathname;

    // Если на странице директории - используем ID из URL
    if (path.startsWith('/directories/')) {
      const id = path.split('/directories/')[1];
      if (id && id !== 'personal') {
        return id;
      }
    }

    // Для всех остальных - личное хранилище
    return personalStorageId;
  }, [location.pathname, personalStorageId, targetDirectoryId]);

  // Обновляем текущую директорию
  useEffect(() => {
    const dirId = getTargetDirectory();
    setCurrentDirectoryId(dirId);
  }, [getTargetDirectory]);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer?.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0 || !accessToken) return;

      const targetDirId = currentDirectoryId || personalStorageId;
      if (!targetDirId || targetDirId === 'personal') {
        onFileUploaded?.(files[0], false, 'Личное хранилище не найдено');
        return;
      }

      setIsUploading(true);
      setUploadProgress(0);
      onUploadStart?.();

      try {
        const result = await uploadFilesWithProgress(
          accessToken,
          targetDirId,
          files,
          (progress) => {
            setUploadProgress(progress);
          },
        );

        const isOnFavorites = location.pathname === '/favorites';
        if (isOnFavorites && result.files.length > 0) {
          for (const file of result.files) {
            try {
              await addFavorite(accessToken, file.id);
              toggleFavorite(file.id);
            } catch (err) {
              console.warn('Failed to add to favorites:', err);
            }
          }
        }

        onFileUploaded?.(files[0], true, buildUploadSuccessMessage(files, isOnFavorites));

        // Триггерим обновление страницы
        triggerUploadComplete();
      } catch (err) {
        const reason = err instanceof Error ? err.message : undefined;
        onFileUploaded?.(files[0], false, buildUploadErrorMessage(files, reason));
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
        onUploadEnd?.();
      }
    },
    [
      accessToken,
      currentDirectoryId,
      personalStorageId,
      location.pathname,
      toggleFavorite,
      onFileUploaded,
      onUploadStart,
      onUploadEnd,
      triggerUploadComplete,
    ],
  );

  useEffect(() => {
    const handleDragLeaveDocument = (e: DragEvent) => {
      if (e.relatedTarget === null) {
        setIsDragging(false);
      }
    };

    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('drop', handleDrop);
    document.addEventListener('dragleave', handleDragLeaveDocument);

    return () => {
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('drop', handleDrop);
      document.removeEventListener('dragleave', handleDragLeaveDocument);
    };
  }, [handleDragEnter, handleDragOver, handleDragLeave, handleDrop]);

  return (
    <div ref={dropZoneRef} className="relative w-full h-full flex flex-col">
      {children}

      {/* Оверлей загрузки (показывается пока файлы загружаются) */}
      {isUploading && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-theme-primary/80 backdrop-blur-[2px] transition-opacity duration-200 opacity-100">
          <div className="w-[420px] max-w-[90vw] p-12 rounded-theme-xl text-center border-2 border-dashed border-brand bg-theme-secondary shadow-theme-dropdown transition-all duration-200 scale-100">
            <div className="w-16 h-16 mx-auto mb-4 rounded-theme-full bg-brand-light flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-sm font-medium text-theme-primary">Загрузка...</p>
            <div className="mt-3 w-full h-2 bg-theme-border rounded-full overflow-hidden">
              <div
                className="h-full bg-brand rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-xs text-theme-muted mt-1.5">{uploadProgress}%</p>
            <p className="text-xs text-theme-muted mt-2">
              {currentDirectoryId ? 'Загрузка в текущую папку' : 'Загрузка...'}
            </p>
          </div>
        </div>
      )}

      {/* Оверлей drag (только до начала загрузки) */}
      {isDragging && !isUploading && (
        <div
          className={cn(
            'fixed inset-0 z-[100] flex items-center justify-center',
            'bg-theme-primary/80 backdrop-blur-[2px]',
            'transition-opacity duration-200',
            isDragging ? 'opacity-100' : 'opacity-0 pointer-events-none',
          )}
        >
          <div
            className={cn(
              'w-[420px] max-w-[90vw] p-12 rounded-theme-xl text-center',
              'border-2 border-dashed border-brand',
              'bg-theme-secondary',
              'shadow-theme-dropdown',
              'transition-all duration-200',
              isDragging ? 'scale-100' : 'scale-95',
            )}
          >
            <div className="w-20 h-20 mx-auto mb-4 rounded-theme-full bg-brand-light flex items-center justify-center">
              <Upload size={36} className="text-brand" />
            </div>
            <p className="text-lg font-semibold text-theme-primary">Отпустите файл для загрузки</p>
            <p className="text-sm text-theme-muted mt-1">
              Отпустите файл в любом месте этой области
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
