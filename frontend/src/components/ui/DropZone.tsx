import React, { useCallback, useState } from 'react';
import { Upload, File } from 'lucide-react';
import { cn } from '../../utils/cn';

interface DropZoneProps {
  onFilesDrop: (files: FileList) => void;
  className?: string;
  multiple?: boolean;
  accept?: string;
}

export const DropZone: React.FC<DropZoneProps> = ({
  onFilesDrop,
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
      if (files.length > 0) onFilesDrop(files);
    },
    [onFilesDrop],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) onFilesDrop(files);
      e.target.value = '';
    },
    [onFilesDrop],
  );

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div
      className={cn(
        'relative border-2 border-dashed rounded-theme p-8 transition-all text-center cursor-pointer',
        isDragging
          ? 'border-brand bg-brand-light/20'
          : 'border-theme-dashed bg-theme-tertiary hover:border-brand/50',
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
      />

      <div className="w-16 h-16 mx-auto mb-4 rounded-theme bg-brand-light flex items-center justify-center">
        <Upload size={28} className="text-brand" />
      </div>
      <p className="text-sm text-theme-secondary">
        Перетащите файл сюда
        <br />
        или
      </p>
      <button
        type="button"
        className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-brand text-theme-on-brand rounded-theme hover:bg-brand-hover transition-colors text-sm font-medium"
        onClick={(e) => {
          e.stopPropagation();
          fileInputRef.current?.click();
        }}
      >
        <File size={16} />
        Выбрать файл
      </button>
      {multiple && <p className="text-xs text-theme-muted mt-3">Можно выбрать несколько файлов</p>}
    </div>
  );
};
