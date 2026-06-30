import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, Share2 } from 'lucide-react';
import { FileIcon } from './FileIcon';
import { ItemActionsMenu } from './ItemActionsMenu';
import { cn } from '../../utils/cn';
import { FileIconType } from '../../utils/fileType';

interface FileItemProps {
  id: string;
  name: string;
  date: string;
  size: string;
  type: FileIconType | string;
  to: string;
  className?: string;
  isFavorite?: boolean;
  hasShareLinks?: boolean;
  onToggleFavorite?: (id: string) => void;
  onDelete?: (id: string) => void;
  onMove?: (id: string) => void;
  onShare?: (id: string) => void;
  onDragStart?: (e: React.DragEvent, id: string, name: string) => void;
}

export const FileItem: React.FC<FileItemProps> = ({
  id,
  name,
  date,
  size,
  type,
  to,
  className,
  isFavorite = false,
  hasShareLinks = false,
  onToggleFavorite,
  onDelete,
  onMove,
  onShare,
  onDragStart,
}) => {
  const [contextMenuOpen, setContextMenuOpen] = useState(false);

  return (
    <Link
      key={id}
      to={to}
      draggable={!!onDragStart}
      onDragStart={(e) => onDragStart?.(e, id, name)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenuOpen(true);
      }}
      className={cn(
        'group flex items-center justify-between p-3 rounded-theme-md transition-colors cursor-pointer',
        'bg-theme-tertiary hover:bg-theme-hover border border-theme',
        className,
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative shrink-0">
          <div className="p-2 bg-theme-secondary rounded-theme-sm shadow-theme-card">
            <FileIcon type={type} size={20} className="group-hover:text-brand transition-colors" />
          </div>
          <span
            className={`absolute -top-1.5 flex items-center justify-center rounded-full bg-theme-tertiary border border-theme p-0.5 shadow-theme-card transition-all duration-500 ease-in-out ${
              hasShareLinks ? 'opacity-100' : 'opacity-0 pointer-events-none'
            } ${
              isFavorite && hasShareLinks ? '-left-1.5' : 'left-[25px]'
            }`}
            aria-label="Есть ссылки общего доступа"
            title="Есть ссылки общего доступа"
          >
            <Share2 size={11} className="text-green-500" />
          </span>
          <span
            className={`absolute -top-1.5 -right-1.5 flex items-center justify-center rounded-full bg-theme-tertiary border border-theme p-0.5 shadow-theme-card transition-all duration-500 ease-in-out ${
              isFavorite ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            aria-label="В избранном"
            title="В избранном"
          >
            <Star size={11} className="text-yellow-400" fill="currentColor" />
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-sm text-theme-primary font-medium truncate">{name}</p>
          <p className="text-xs text-theme-muted">{date}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-3">
        <span className="text-xs text-theme-muted hidden sm:inline">{size}</span>
        <ItemActionsMenu
          isFavorite={isFavorite}
          onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(id) : undefined}
          onDelete={onDelete ? () => onDelete(id) : undefined}
          onMove={onMove ? () => onMove(id) : undefined}
          onShare={onShare ? () => onShare(id) : undefined}
          openMenu={contextMenuOpen}
          onCloseMenu={() => setContextMenuOpen(false)}
        />
      </div>
    </Link>
  );
};
