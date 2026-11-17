import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, Share2 } from 'lucide-react';
import { FilePreview } from './FilePreview';
import { ItemActionsMenu } from './ItemActionsMenu';
import { cn } from '../../utils/cn';
import { FileIconType } from '../../utils/fileType';

interface FileGridItemProps {
  id: string;
  name: string;
  size: string;
  type: FileIconType | string;
  to: string;
  className?: string;
  isFavorite?: boolean;
  hasShareLinks?: boolean;
  onClick?: (id: string) => void;
  showProperties?: boolean;
  onContextMenu?: (e: React.MouseEvent, id: string) => void;
  onToggleFavorite?: (id: string) => void;
  onRename?: (id: string) => void;
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
  size,
  type,
  to,
  className,
  isFavorite = false,
  hasShareLinks = false,
  onClick,
  onContextMenu,
  showProperties = false,
  onToggleFavorite,
  onRename,
  onDelete,
  onMove,
  onShare,
  onDownload,
  onConvert,
  onDragStart,
}) => {
  const [contextMenuOpen, setContextMenuOpen] = useState<{ x: number; y: number } | null>(null);

  return (
    <Link
      to={to}
      draggable={!!onDragStart}
      onDragStart={(e) => onDragStart?.(e, id, name)}
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
        className,
      )}
    >
      <div className="relative w-full aspect-square max-w-[160px] flex items-center justify-center text-theme-muted group-hover:text-brand transition-colors">
        <FilePreview
          fileId={id}
          type={type}
          size={40}
          fill
          className="group-hover:text-brand transition-colors"
        />
      </div>
      <div className="absolute left-2 top-2 flex items-center gap-1 pointer-events-none">
        {isFavorite && (
          <span
            className="grid size-6 place-items-center rounded-theme-sm border border-theme bg-theme-secondary shadow-theme-card"
            role="img"
            aria-label="В избранном"
            title="В избранном"
          >
            <Star
              aria-hidden="true"
              size={14}
              className="text-amber-700 dark:text-amber-300"
              fill="currentColor"
            />
          </span>
        )}
        {hasShareLinks && (
          <span
            className="grid size-6 place-items-center rounded-theme-sm border border-theme bg-theme-secondary shadow-theme-card"
            role="img"
            aria-label="Есть ссылки общего доступа"
            title="Есть ссылки общего доступа"
          >
            <Share2
              aria-hidden="true"
              size={14}
              className="text-emerald-700 dark:text-emerald-300"
            />
          </span>
        )}
      </div>
      <p className="mt-2 text-xs tabular-nums text-theme-secondary">{size}</p>
      <p className="text-sm text-theme-primary font-medium text-center truncate w-full max-w-[120px]">
        {name}
      </p>

      <div className="absolute top-2 right-2 flex items-center gap-1.5">
        <ItemActionsMenu
          properties={showProperties ? { kind: 'file', id } : undefined}
          isFavorite={isFavorite}
          onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(id) : undefined}
          onRename={onRename ? () => onRename(id) : undefined}
          onDelete={onDelete ? () => onDelete(id) : undefined}
          onMove={onMove ? () => onMove(id) : undefined}
          onShare={onShare ? () => onShare(id) : undefined}
          onDownload={onDownload ? () => onDownload(id) : undefined}
          onConvert={onConvert ? () => onConvert(id) : undefined}
          iconSize={16}
          triggerClassName="m-0 grid size-8 place-items-center border border-theme bg-theme-secondary p-0 text-theme-secondary shadow-theme-card hover:bg-theme-secondary hover:text-brand"
          openMenu={!!contextMenuOpen}
          menuPosition={contextMenuOpen}
          onCloseMenu={() => setContextMenuOpen(null)}
        />
      </div>
    </Link>
  );
};
