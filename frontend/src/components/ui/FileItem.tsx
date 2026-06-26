import React from 'react';
import { Link } from 'react-router-dom';
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
  onToggleFavorite?: (id: string) => void;
  onDelete?: (id: string) => void;
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
  onToggleFavorite,
  onDelete,
}) => (
  <Link
    key={id}
    to={to}
    className={cn(
      'group flex items-center justify-between p-3 rounded-theme-md transition-colors cursor-pointer',
      'bg-theme-tertiary hover:bg-theme-hover border border-theme',
      className,
    )}
  >
    <div className="flex items-center gap-3 min-w-0">
      <div className="p-2 bg-theme-secondary rounded-theme-sm shadow-theme-card shrink-0">
        <FileIcon type={type} size={20} />
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
      />
    </div>
  </Link>
);
