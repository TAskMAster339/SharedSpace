import React from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { FileIcon } from './FileIcon';
import { cn } from '../../utils/cn';

interface FileItemProps {
  id: string;
  name: string;
  date: string;
  size: string;
  type: 'img' | 'pdf' | 'video' | 'text' | 'audio' | 'xlsx' | string;
  to: string;
  className?: string;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
}

export const FileItem: React.FC<FileItemProps> = ({
  id,
  name,
  date,
  size,
  type,
  to,
  className,
  isFavorite,
  onToggleFavorite,
}) => (
  <Link
    key={id}
    to={to}
    className={cn(
      'flex items-center justify-between p-3 rounded-theme-md transition-colors cursor-pointer',
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
      {onToggleFavorite && (
        <button
          type="button"
          aria-label={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFavorite(id);
          }}
          className="text-theme-muted hover:text-yellow-400 transition-colors"
        >
          <Star
            size={18}
            className={cn(isFavorite && 'text-yellow-400')}
            fill={isFavorite ? 'currentColor' : 'none'}
          />
        </button>
      )}
    </div>
  </Link>
);
