import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Folder, Music } from 'lucide-react';
import { ItemStatusBadges } from './ItemStatusBadges';
import { ItemActionsMenu } from './ItemActionsMenu';
import { formatFileSize } from '../../utils/format';
import { cn } from '../../utils/cn';

interface FolderItemProps {
  id: string;
  name: string;
  sizeBytes?: number;
  to: string;
  className?: string;
  coverUrl?: string;
  isPlaylist?: boolean;
  hasShareLinks?: boolean;
  onClick?: (id: string) => void;
  showProperties?: boolean;
  onContextMenu?: (e: React.MouseEvent, id: string) => void;
  onRename?: (id: string) => void;
  onMove?: (id: string) => void;
  onDelete?: (id: string) => void;
  onShare?: (id: string) => void;
  onCover?: (id: string) => void;
  onDrop?: (e: React.DragEvent, id: string) => void;
  onDragStart?: (e: React.DragEvent, id: string, name: string) => void;
}

export const FolderItem: React.FC<FolderItemProps> = ({
  id,
  name,
  sizeBytes,
  to,
  className,
  coverUrl,
  isPlaylist = false,
  hasShareLinks = false,
  onClick,
  onContextMenu,
  showProperties = false,
  onRename,
  onMove,
  onDelete,
  onShare,
  onCover,
  onDrop,
  onDragStart,
}) => {
  const FolderIcon = isPlaylist ? Music : Folder;
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounter = useRef(0);
  const [contextMenuOpen, setContextMenuOpen] = useState<{ x: number; y: number } | null>(null);

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
      draggable={!!onDragStart}
      onDragStart={(e) => onDragStart?.(e, id, name)}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={(e) => {
        if (onClick) {
          e.preventDefault();
          onClick(id);
        }
      }}
      onContextMenu={(e) => {
        if (onContextMenu) {
          onContextMenu(e, id);
        } else {
          e.preventDefault();
          e.stopPropagation();
          setContextMenuOpen({ x: e.clientX, y: e.clientY });
        }
      }}
      className={cn(
        'group flex items-center justify-between gap-3 p-3 rounded-theme transition-colors cursor-pointer',
        'bg-theme-tertiary hover:bg-theme-hover border border-theme',
        isDragOver && '!border-brand !bg-brand/20 !shadow-lg !ring-2 !ring-brand/40',
        className,
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative shrink-0 [--badge-preview-width:3rem]">
          <div className="item-list-thumbnail bg-theme-secondary shadow-theme-card">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt=""
                loading="lazy"
                className="h-full w-full rounded-theme object-cover"
              />
            ) : (
              <FolderIcon
                size={20}
                className="text-theme-muted group-hover:text-brand transition-colors"
              />
            )}
          </div>
          <ItemStatusBadges shared={hasShareLinks} />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-theme-primary font-medium truncate">{name}</p>
          <p className="text-xs text-theme-muted">{isPlaylist ? 'Плейлист' : 'Папка'}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {sizeBytes !== undefined && (
          <span className="text-xs text-theme-muted tabular-nums whitespace-nowrap">
            {formatFileSize(sizeBytes)}
          </span>
        )}
        <ItemActionsMenu
          properties={showProperties ? { kind: 'directory', id } : undefined}
          onRename={onRename ? () => onRename(id) : undefined}
          onMove={onMove ? () => onMove(id) : undefined}
          onShare={onShare ? () => onShare(id) : undefined}
          onCover={onCover ? () => onCover(id) : undefined}
          onDelete={onDelete ? () => onDelete(id) : undefined}
          className="shrink-0"
          openMenu={!!contextMenuOpen}
          menuPosition={contextMenuOpen}
          onCloseMenu={() => setContextMenuOpen(null)}
        />
      </div>
    </Link>
  );
};
