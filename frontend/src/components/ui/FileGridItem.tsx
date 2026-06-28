import React from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { FileIcon } from './FileIcon';
import { ItemActionsMenu } from './ItemActionsMenu';
import { cn } from '../../utils/cn';
import { FileIconType } from '../../utils/fileType';

interface FileGridItemProps {
  id: string;
  name: string;
  type: FileIconType | string;
  to: string;
  className?: string;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
  onDelete?: (id: string) => void;
  onMove?: (id: string) => void;
  onDragStart?: (e: React.DragEvent, id: string, name: string) => void;
}

export const FileGridItem: React.FC<FileGridItemProps> = ({
  id,
  name,
  type,
  to,
  className,
  isFavorite = false,
  onToggleFavorite,
  onDelete,
  onMove,
  onDragStart,
}) => {
  return (
    <Link
      to={to}
      draggable={!!onDragStart}
      onDragStart={(e) => onDragStart?.(e, id, name)}
      className={cn(
        'group flex flex-col items-center p-3 rounded-theme-md transition-colors cursor-pointer relative min-w-0',
        'bg-theme-tertiary hover:bg-theme-hover border border-theme',
        className,
      )}
    >
      <div className="relative w-16 h-16 flex items-center justify-center text-theme-muted group-hover:text-brand transition-colors">
        <FileIcon type={type} size={40} className="group-hover:text-brand transition-colors" />
        {isFavorite && (
          <span
            className="absolute top-0 right-0 flex items-center justify-center rounded-full bg-theme-tertiary border border-theme p-0.5 shadow-theme-card"
            aria-label="В избранном"
            title="В избранном"
          >
            <Star size={12} className="text-yellow-400" fill="currentColor" />
          </span>
        )}
      </div>
      <p className="text-sm text-theme-primary font-medium text-center mt-2 truncate w-full max-w-[120px]">
        {name}
      </p>

      <div className="absolute top-2 right-2 flex items-center gap-1.5">
        <ItemActionsMenu
          isFavorite={isFavorite}
          onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(id) : undefined}
          onDelete={onDelete ? () => onDelete(id) : undefined}
          onMove={onMove ? () => onMove(id) : undefined}
          iconSize={16}
        />
      </div>
    </Link>
  );
};
