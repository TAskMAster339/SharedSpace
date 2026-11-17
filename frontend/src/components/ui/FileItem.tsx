import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FilePreview } from './FilePreview';
import { ItemStatusBadges } from './ItemStatusBadges';
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
      key={id}
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
        'group flex items-center justify-between p-3 rounded-theme transition-colors cursor-pointer',
        'bg-theme-tertiary hover:bg-theme-hover border border-theme',
        className,
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative shrink-0 [--badge-preview-width:3rem]">
          <div className="item-list-thumbnail bg-theme-secondary shadow-theme-card">
            <FilePreview
              fileId={id}
              type={type}
              size={20}
              fill
              className="group-hover:text-brand transition-colors"
            />
          </div>
          <ItemStatusBadges favorite={isFavorite} shared={hasShareLinks} />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-theme-primary font-medium truncate">{name}</p>
          <p className="text-xs text-theme-muted">{date}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-3">
        <span className="text-xs text-theme-muted hidden sm:inline">{size}</span>
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
          openMenu={!!contextMenuOpen}
          menuPosition={contextMenuOpen}
          onCloseMenu={() => setContextMenuOpen(null)}
        />
      </div>
    </Link>
  );
};
