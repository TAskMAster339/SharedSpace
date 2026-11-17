import React from 'react';
import { Link } from 'react-router-dom';
import { FilePreview } from './FilePreview';
import { ItemStatusBadges } from './ItemStatusBadges';
import { useGridItemMenu } from './useGridItemMenu';
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
  const menu = useGridItemMenu(onContextMenu && ((event) => onContextMenu(event, id)));

  return (
    <Link
      to={to}
      draggable={!!onDragStart}
      onDragStart={(e) => onDragStart?.(e, id, name)}
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
        'group flex flex-col items-center p-3 rounded-theme transition-colors cursor-pointer relative min-w-0 [-webkit-touch-callout:none]',
        'bg-theme-tertiary hover:bg-theme-hover border border-theme',
        className,
      )}
    >
      <div className="relative w-full aspect-square max-w-[160px] flex items-center justify-center text-theme-muted group-hover:text-brand transition-colors">
        <FilePreview
          fileId={id}
          type={type}
          size={64}
          fill
          className="group-hover:text-brand transition-colors"
        />
      </div>
      <ItemStatusBadges grid favorite={isFavorite} shared={hasShareLinks} />
      <p className="mt-2 text-xs tabular-nums text-theme-secondary">{size}</p>
      <p className="text-sm text-theme-primary font-medium text-center truncate w-full max-w-[120px]">
        {name}
      </p>

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
        openMenu={!!menu.position}
        menuPosition={menu.position}
        onCloseMenu={menu.close}
        contextAnchor={menu.anchor}
      />
    </Link>
  );
};
