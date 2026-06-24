import React, { useCallback, useState } from 'react';
import { Upload, File, X } from 'lucide-react';
import { cn } from '../../utils/cn';

interface DropZoneProps {
  onFilesDrop: (files: FileList) => void;
  isUploading?: boolean;
  uploadProgress?: number;
  uploadError?: string | null;
  className?: string;
  multiple?: boolean;
  accept?: string;
}

export const DropZone: React.FC<DropZoneProps> = ({
  onFilesDrop,
  isUploading = false,
  uploadProgress = 0,
  uploadError = null,
  className,
  multiple = true,
  accept,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        onFilesDrop(files);
      }
    },
    [onFilesDrop],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        onFilesDrop(files);
      }
      e.target.value = '';
    },
    [onFilesDrop],
  );

  const handleClick = useCallback(() => {
    if (!isUploading) {
      fileInputRef.current?.click();
    }
  }, [isUploading]);

  return (
    <div
      className={cn(
        'relative border-2 border-dashed rounded-theme-lg p-8 transition-all text-center',
        isDragging
          ? 'border-brand bg-brand-light/20'
          : uploadError
          ? 'border-danger bg-danger-light/10'
          : 'border-theme-dashed bg-theme-tertiary hover:border-brand/50',
        isUploading && 'pointer-events-none opacity-70',
        className,
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple={multiple}
        accept={accept}
        onChange={handleFileSelect}
        disabled={isUploading}
      />

      {isUploading ? (
        <div className="py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-theme-full bg-brand-light flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-sm font-medium text-theme-primary">Загрузка...</p>
          <div className="mt-3 w-full max-w-xs mx-auto h-2 bg-theme-border rounded-full overflow-hidden">
            <div
              className="h-full bg-brand rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-xs text-theme-muted mt-1.5">{uploadProgress}%</p>
        </div>
      ) : uploadError ? (
        <div className="py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-theme-full bg-danger-light/20 flex items-center justify-center">
            <X size={28} className="text-danger" />
          </div>
          <p className="text-sm font-medium text-danger">{uploadError}</p>
          <button
            type="button"
            className="mt-4 text-sm text-brand hover:text-brand-hover font-medium"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
          >
            Попробовать снова
          </button>
        </div>
      ) : (
        <>
          <div className="w-16 h-16 mx-auto mb-4 rounded-theme-full bg-brand-light flex items-center justify-center">
            <Upload size={28} className="text-brand" />
          </div>
          <p className="text-sm text-theme-secondary">
            Перетащите файл сюда
            <br />
            или
          </p>
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-brand text-theme-on-brand rounded-theme-md hover:bg-brand-hover transition-colors text-sm font-medium"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
          >
            <File size={16} />
            Выбрать файл
          </button>
          {multiple && (
            <p className="text-xs text-theme-muted mt-3">Можно выбрать несколько файлов</p>
          )}
        </>
      )}
    </div>
  );
};