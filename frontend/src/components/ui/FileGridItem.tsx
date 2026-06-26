import React from 'react';
import { Link } from 'react-router-dom';
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
  onToggleFavorite?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export const FileGridItem: React.FC<FileGridItemProps> = ({
  id,
  name,
  type,
  to,
  className,
  isFavorite = false,
  onToggleFavorite,
  onDelete,
}) => {
  return (
    <Link
      to={to}
      className={cn(
        'group flex flex-col items-center p-3 rounded-theme-md transition-colors cursor-pointer relative',
        'bg-theme-tertiary hover:bg-theme-hover border border-theme',
        className,
      )}
    >
      <div className="w-16 h-16 flex items-center justify-center text-theme-muted group-hover:text-brand transition-colors">
        <FileIcon type={type} size={40} />
      </div>
      <p className="text-sm text-theme-primary font-medium text-center mt-2 truncate w-full max-w-[120px]">
        {name}
      </p>

      <div className="absolute top-2 right-2 flex items-center gap-1.5">
        <ItemActionsMenu
          isFavorite={isFavorite}
          onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(id) : undefined}
          onDelete={onDelete ? () => onDelete(id) : undefined}
          iconSize={16}
        />
      </div>
    </Link>
  );
};
