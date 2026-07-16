import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Folder, Share2 } from 'lucide-react';
import { ItemActionsMenu } from './ItemActionsMenu';
import { cn } from '../../utils/cn';

interface FolderItemProps {
  id: string;
  name: string;
  to: string;
  className?: string;
  hasShareLinks?: boolean;
  onClick?: (id: string) => void;
  onContextMenu?: (e: React.MouseEvent, id: string) => void;
  onRename?: (id: string) => void;
  onMove?: (id: string) => void;
  onDelete?: (id: string) => void;
  onShare?: (id: string) => void;
  onDrop?: (e: React.DragEvent, id: string) => void;
  onDragStart?: (e: React.DragEvent, id: string, name: string) => void;
}

export const FolderItem: React.FC<FolderItemProps> = ({
  id,
  name,
  to,
  className,
  hasShareLinks = false,
  onClick,
  onContextMenu,
  onRename,
  onMove,
  onDelete,
  onShare,
  onDrop,
  onDragStart,
}) => {
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
        'group flex items-center justify-between gap-3 p-3 rounded-theme-md transition-colors cursor-pointer',
        'bg-theme-tertiary hover:bg-theme-hover border border-theme',
        isDragOver && '!border-brand !bg-brand/20 !shadow-lg !ring-2 !ring-brand/40',
        className,
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative shrink-0">
          <div className="p-2 bg-theme-secondary rounded-theme-sm shadow-theme-card shrink-0">
            <Folder
              size={20}
              className="text-theme-muted group-hover:text-brand transition-colors"
            />
          </div>
          {hasShareLinks && (
            <span
              className="absolute -top-1.5 -right-1.5 flex items-center justify-center rounded-full bg-theme-tertiary border border-theme p-0.5 shadow-theme-card transition-all duration-500 ease-in-out"
              aria-label="Есть ссылки общего доступа"
              title="Есть ссылки общего доступа"
            >
              <Share2 size={11} className="text-green-500" />
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm text-theme-primary font-medium truncate">{name}</p>
          <p className="text-xs text-theme-muted">Папка</p>
        </div>
      </div>
      <ItemActionsMenu
        onRename={onRename ? () => onRename(id) : undefined}
        onMove={onMove ? () => onMove(id) : undefined}
        onShare={onShare ? () => onShare(id) : undefined}
        onDelete={onDelete ? () => onDelete(id) : undefined}
        className="shrink-0"
        openMenu={!!contextMenuOpen}
        menuPosition={contextMenuOpen}
        onCloseMenu={() => setContextMenuOpen(null)}
      />
    </Link>
  );
};
