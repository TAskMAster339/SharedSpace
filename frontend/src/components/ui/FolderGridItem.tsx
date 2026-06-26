import React from 'react';
import { Link } from 'react-router-dom';
import { Folder } from 'lucide-react';
import { ItemActionsMenu } from './ItemActionsMenu';
import { cn } from '../../utils/cn';

interface FolderGridItemProps {
  id: string;
  name: string;
  to: string;
  className?: string;
  onDelete?: (id: string) => void;
  isDragOver?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  draggable?: boolean;
}

export const FolderGridItem: React.FC<FolderGridItemProps> = ({
  id,
  name,
  to,
  className,
  onDelete,
  isDragOver = false,
  onDragOver,
  onDragLeave,
  onDrop,
  draggable = false,
}) => {
  return (
    <Link
      to={to}
      className={cn(
        'group flex flex-col items-center p-3 rounded-theme-md transition-colors cursor-pointer relative',
        'bg-theme-tertiary hover:bg-theme-hover border border-theme',
        isDragOver && 'border-brand bg-brand-light/20 scale-105 shadow-theme-card',
        className,
      )}
      draggable={draggable}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="w-16 h-16 flex items-center justify-center text-theme-muted group-hover:text-brand transition-colors">
        <Folder size={40} strokeWidth={1.5} />
      </div>
      <p className="text-sm text-theme-primary font-medium text-center mt-2 truncate w-full max-w-[120px]">
        {name}
      </p>

      <ItemActionsMenu
        onDelete={onDelete ? () => onDelete(id) : undefined}
        className="absolute top-2 right-2"
        iconSize={16}
      />
    </Link>
  );
};
