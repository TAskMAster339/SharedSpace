import React from 'react';
import { Link } from 'react-router-dom';
import { Folder, Trash2 } from 'lucide-react';
import { cn } from '../../utils/cn';

interface FolderItemProps {
  id: string;
  name: string;
  to: string;
  className?: string;
  onDelete?: (id: string) => void;
}

export const FolderItem: React.FC<FolderItemProps> = ({ id, name, to, className, onDelete }) => (
  <Link
    to={to}
    className={cn(
      'group flex items-center justify-between gap-3 p-3 rounded-theme-md transition-colors cursor-pointer',
      'bg-theme-tertiary hover:bg-theme-hover border border-theme',
      className,
    )}
  >
    <div className="flex items-center gap-3 min-w-0">
      <div className="p-2 bg-theme-secondary rounded-theme-sm shadow-theme-card shrink-0">
        <Folder size={20} className="text-theme-muted" />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-theme-primary font-medium truncate">{name}</p>
        <p className="text-xs text-theme-muted">Папка</p>
      </div>
    </div>
    {onDelete && (
      <button
        type="button"
        aria-label="Переместить в корзину"
        title="Переместить в корзину"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDelete(id);
        }}
        className="opacity-0 group-hover:opacity-100 text-theme-muted hover:text-danger transition-colors shrink-0"
      >
        <Trash2 size={18} />
      </button>
    )}
  </Link>
);
