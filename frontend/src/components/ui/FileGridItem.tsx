import React from 'react';
import { Link } from 'react-router-dom';
import { FilePreview } from './FilePreview';
import { GridItemCaption } from './GridItemCaption';
import { ItemStatusBadges } from './ItemStatusBadges';
import { useGridItemMenu } from './useGridItemMenu';
import { ItemActionsMenu } from './ItemActionsMenu';
import { cn } from '../../utils/cn';
import { FileIconType } from '../../utils/fileType';
import { canEditOfficeFile } from '../../utils/officeFormats';

interface FileGridItemProps {
  id: string;
  name: string;
  size: string;
  type: FileIconType | string;
  to: string;
  className?: string;
  coverUrl?: string;
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
  coverUrl,
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
    <div className={cn('flex min-w-0 flex-col items-center pb-2', className)}>
      <Link
        to={to}
        aria-label={name}
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
        className="file-item-link item-grid-preview cursor-pointer p-3 [-webkit-touch-callout:none]"
      >
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            loading="lazy"
            className="h-full w-full rounded-theme object-cover"
          />
        ) : (
          <FilePreview
            fileId={id}
            type={type}
            size={64}
            fill
            className="file-item-icon transition-colors"
          />
        )}
        <ItemStatusBadges grid favorite={isFavorite} shared={hasShareLinks} />
      </Link>
      <GridItemCaption name={name} size={size} />

      <ItemActionsMenu
        documentId={showProperties && canEditOfficeFile(name) ? id : undefined}
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
    </div>
  );
};
