import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Folder } from 'lucide-react';
import { ItemStatusBadges } from './ItemStatusBadges';
import { useGridItemMenu } from './useGridItemMenu';
import { ItemActionsMenu } from './ItemActionsMenu';
import { formatFileSize } from '../../utils/format';
import { cn } from '../../utils/cn';

interface FolderGridItemProps {
  id: string;
  name: string;
  sizeBytes?: number;
  to: string;
  className?: string;
  hasShareLinks?: boolean;
  onClick?: (id: string) => void;
  showProperties?: boolean;
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
  sizeBytes,
  to,
  className,
  hasShareLinks = false,
  onClick,
  onContextMenu,
  showProperties = false,
  onRename,
  onMove,
  onDelete,
  onShare,
  onDrop,
  onDragStart,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounter = useRef(0);
  const menu = useGridItemMenu(onContextMenu && ((event) => onContextMenu(event, id)));

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
        if (menu.consumeLongPress()) {
          e.preventDefault();
          return;
        }
        if (onClick) {
          e.preventDefault();
          onClick(id);
        }
      }}
      ref={menu.anchor}
      {...menu.handlers}
      className={cn(
        'group flex min-w-0 cursor-pointer flex-col items-center rounded-theme pb-2 [-webkit-touch-callout:none]',
        className,
      )}
    >
      <div
        className={cn(
          'item-grid-preview',
          isDragOver && '!border-brand !bg-brand/20 !shadow-lg !ring-2 !ring-brand/40',
        )}
      >
        <Folder size={64} strokeWidth={1.5} />
        <ItemStatusBadges grid shared={hasShareLinks} />
      </div>
      <p className="mt-2 text-xs tabular-nums text-theme-secondary">
        {sizeBytes === undefined ? '—' : formatFileSize(sizeBytes)}
      </p>
      <p className="text-sm text-theme-primary font-medium text-center truncate w-full max-w-[120px]">
        {name}
      </p>

      <ItemActionsMenu
        properties={showProperties ? { kind: 'directory', id } : undefined}
        onRename={onRename ? () => onRename(id) : undefined}
        onMove={onMove ? () => onMove(id) : undefined}
        onShare={onShare ? () => onShare(id) : undefined}
        onDelete={onDelete ? () => onDelete(id) : undefined}
        iconSize={16}
        openMenu={!!menu.position}
        menuPosition={menu.position}
        onCloseMenu={menu.close}
        contextAnchor={menu.anchor}
      />
    </Link>
  );
};
