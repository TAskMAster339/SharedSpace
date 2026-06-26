import React from 'react';
import { ArrowUp } from 'lucide-react';
import { cn } from '../../utils/cn';

interface DropZoneUpProps {
  onDrop: () => void;
  isVisible: boolean;
  className?: string;
}

export const DropZoneUp: React.FC<DropZoneUpProps> = ({
  onDrop,
  isVisible,
  className,
}) => {
  const [isDragOver, setIsDragOver] = React.useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    onDrop();
  };

  if (!isVisible) return null;

  return (
    <div
      className={cn(
        'border-2 border-dashed rounded-theme-lg p-6 text-center transition-all',
        isDragOver
          ? 'border-brand bg-brand-light/20'
          : 'border-theme-dashed bg-theme-tertiary hover:border-brand/50',
        className
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex items-center justify-center gap-3 text-theme-secondary">
        <ArrowUp size={20} className={isDragOver ? 'text-brand' : ''} />
        <span className="text-sm">
          Перетащите файл сюда, чтобы переместить на уровень выше
        </span>
      </div>
    </div>
  );
};
