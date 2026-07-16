import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Folder, Share2 } from 'lucide-react';
import { ItemActionsMenu } from './ItemActionsMenu';
import { cn } from '../../utils/cn';

interface FolderGridItemProps {
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

export const FolderGridItem: React.FC<FolderGridItemProps> = ({
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
        'group flex flex-col items-center p-3 rounded-theme-md transition-colors cursor-pointer relative min-w-0',
        'bg-theme-tertiary hover:bg-theme-hover border border-theme',
        isDragOver && '!border-brand !bg-brand/20 !shadow-lg !ring-2 !ring-brand/40',
        className,
      )}
    >
      <div className="relative w-16 h-16 flex items-center justify-center text-theme-muted group-hover:text-brand transition-colors">
        <Folder size={40} strokeWidth={1.5} />
        {hasShareLinks && (
          <span
            className="absolute top-0 right-0 flex items-center justify-center rounded-full bg-theme-tertiary border border-theme p-0.5 shadow-theme-card transition-all duration-500 ease-in-out"
            aria-label="Есть ссылки общего доступа"
            title="Есть ссылки общего доступа"
          >
            <Share2 size={12} className="text-green-500" />
          </span>
        )}
      </div>
      <p className="text-sm text-theme-primary font-medium text-center mt-2 truncate w-full max-w-[120px]">
        {name}
      </p>

      <ItemActionsMenu
        onRename={onRename ? () => onRename(id) : undefined}
        onMove={onMove ? () => onMove(id) : undefined}
        onShare={onShare ? () => onShare(id) : undefined}
        onDelete={onDelete ? () => onDelete(id) : undefined}
        className="absolute top-2 right-2"
        iconSize={16}
        openMenu={!!contextMenuOpen}
        menuPosition={contextMenuOpen}
        onCloseMenu={() => setContextMenuOpen(null)}
      />
    </Link>
  );
};
