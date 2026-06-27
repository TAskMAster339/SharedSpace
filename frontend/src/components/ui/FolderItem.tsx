import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Folder } from 'lucide-react';
import { ItemActionsMenu } from './ItemActionsMenu';
import { cn } from '../../utils/cn';

interface FolderItemProps {
  id: string;
  name: string;
  to: string;
  className?: string;
  onDelete?: (id: string) => void;
  onDrop?: (e: React.DragEvent, id: string) => void;
}

export const FolderItem: React.FC<FolderItemProps> = ({
  id,
  name,
  to,
  className,
  onDelete,
  onDrop,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounter = useRef(0);

  const handleDragOver = (e: React.DragEvent) => {
    if (!onDrop) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e: React.DragEvent) => {
    if (!onDrop) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (dragCounter.current === 1) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!onDrop) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!onDrop) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragOver(false);
    onDrop(e, id);
  };

  return (
    <Link
      to={to}
      draggable={false}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'group flex items-center justify-between gap-3 p-3 rounded-theme-md transition-colors cursor-pointer',
        'bg-theme-tertiary hover:bg-theme-hover border border-theme',
        isDragOver && '!border-brand !bg-brand/20 !shadow-lg !ring-2 !ring-brand/40',
        className,
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-2 bg-theme-secondary rounded-theme-sm shadow-theme-card shrink-0">
          <Folder size={20} className="text-theme-muted" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-theme-primary font-medium truncate">{name}</p>
          <p className="text-xs text-theme-muted">Папка</p>
        </div>
      </div>
      <ItemActionsMenu onDelete={onDelete ? () => onDelete(id) : undefined} className="shrink-0" />
    </Link>
  );
};
