import React from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { FileIcon } from './FileIcon';
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
}

export const FileGridItem: React.FC<FileGridItemProps> = ({
  id,
  name,
  type,
  to,
  className,
  isFavorite = false,
  onToggleFavorite,
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

      {onToggleFavorite && (
        <button
          type="button"
          aria-label={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFavorite(id);
          }}
          className={cn(
            'absolute top-2 right-2 transition-colors',
            isFavorite
              ? 'text-yellow-400 opacity-100'
              : 'text-theme-muted opacity-60 hover:text-yellow-400',
          )}
        >
          <Star size={16} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
      )}
    </Link>
  );
};
