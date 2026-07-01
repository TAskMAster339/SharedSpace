import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, Share2 } from 'lucide-react';
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
  hasShareLinks?: boolean;
  onToggleFavorite?: (id: string) => void;
  onDelete?: (id: string) => void;
  onMove?: (id: string) => void;
  onShare?: (id: string) => void;
  onDownload?: (id: string) => void;
  onConvert?: (id: string) => void;
  onDragStart?: (e: React.DragEvent, id: string, name: string) => void;
}

export const FileGridItem: React.FC<FileGridItemProps> = ({
  id,
  name,
  type,
  to,
  className,
  isFavorite = false,
  hasShareLinks = false,
  onToggleFavorite,
  onDelete,
  onMove,
  onShare,
  onDownload,
  onConvert,
  onDragStart,
}) => {
  const [contextMenuOpen, setContextMenuOpen] = useState(false);

  return (
    <Link
      to={to}
      draggable={!!onDragStart}
      onDragStart={(e) => onDragStart?.(e, id, name)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenuOpen(true);
      }}
      className={cn(
        'group flex flex-col items-center p-3 rounded-theme-md transition-colors cursor-pointer relative min-w-0',
        'bg-theme-tertiary hover:bg-theme-hover border border-theme',
        className,
      )}
    >
      <div className="relative w-16 h-16 flex items-center justify-center text-theme-muted group-hover:text-brand transition-colors">
        <FileIcon type={type} size={40} className="group-hover:text-brand transition-colors" />
        <span
          className={`absolute top-0 flex items-center justify-center rounded-full bg-theme-tertiary border border-theme p-0.5 shadow-theme-card transition-all duration-500 ease-in-out ${
            hasShareLinks ? 'opacity-100' : 'opacity-0 pointer-events-none'
          } ${isFavorite && hasShareLinks ? 'left-0' : 'left-[44px]'}`}
          aria-label="Есть ссылки общего доступа"
          title="Есть ссылки общего доступа"
        >
          <Share2 size={12} className="text-green-500" />
        </span>
        <span
          className={`absolute top-0 right-0 flex items-center justify-center rounded-full bg-theme-tertiary border border-theme p-0.5 shadow-theme-card transition-all duration-500 ease-in-out ${
            isFavorite ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          aria-label="В избранном"
          title="В избранном"
        >
          <Star size={12} className="text-yellow-400" fill="currentColor" />
        </span>
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
          onShare={onShare ? () => onShare(id) : undefined}
          onDownload={onDownload ? () => onDownload(id) : undefined}
          onConvert={onConvert ? () => onConvert(id) : undefined}
          iconSize={16}
          openMenu={contextMenuOpen}
          onCloseMenu={() => setContextMenuOpen(false)}
        />
      </div>
    </Link>
  );
};
