import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useDirectoryStore } from '../store/directoryStore';
import { useDragDropStore } from '../store/dragDropStore';
import { useUploadStore } from '../store/uploadStore';
import { cn } from '../utils/cn';

interface GlobalDropZoneProps {
  children: React.ReactNode;
}

export const GlobalDropZone: React.FC<GlobalDropZoneProps> = ({ children }) => {
  const location = useLocation();
  const accessToken = useAuthStore((state) => state.accessToken);
  const { personalStorageId } = useDirectoryStore();
  const { targetDirectoryId } = useDragDropStore();
  const addTasks = useUploadStore((s) => s.addTasks);

  const [isDragging, setIsDragging] = useState(false);
  const [currentDirectoryId, setCurrentDirectoryId] = useState<string | null>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const getTargetDirectory = useCallback(() => {
    if (targetDirectoryId) return targetDirectoryId;
    const path = location.pathname;
    if (path.startsWith('/directories/')) {
      const id = path.split('/directories/')[1];
      if (id && id !== 'personal') return id;
    }
    return personalStorageId;
  }, [location.pathname, personalStorageId, targetDirectoryId]);

  useEffect(() => {
    setCurrentDirectoryId(getTargetDirectory());
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
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0 || !accessToken) return;

      const targetDirId = currentDirectoryId || personalStorageId;
      if (!targetDirId || targetDirId === 'personal') return;

      const isOnFavorites = location.pathname === '/favorites';
      addTasks(Array.from(files), targetDirId, { toFavorites: isOnFavorites });
    },
    [accessToken, currentDirectoryId, personalStorageId, location.pathname, addTasks],
  );

  useEffect(() => {
    const handleDragLeaveDocument = (e: DragEvent) => {
      if (e.relatedTarget === null) setIsDragging(false);
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

      {isDragging && (
        <div
          className={cn(
            'fixed inset-0 z-[100] flex items-center justify-center',
            'bg-theme-primary/80 backdrop-blur-[2px]',
            'transition-opacity duration-200 opacity-100',
          )}
        >
          <div
            className={cn(
              'w-[420px] max-w-[90vw] p-12 rounded-theme text-center',
              'border-2 border-dashed border-brand',
              'bg-theme-secondary shadow-theme-dropdown',
            )}
          >
            <div className="w-20 h-20 mx-auto mb-4 rounded-theme bg-brand-light flex items-center justify-center">
              <Upload size={36} className="text-brand" />
            </div>
            <p className="text-lg font-semibold text-theme-primary">Отпустите файлы для загрузки</p>
            <p className="text-sm text-theme-muted mt-1">Загрузка начнётся сразу после этого</p>
          </div>
        </div>
      )}
    </div>
  );
};
