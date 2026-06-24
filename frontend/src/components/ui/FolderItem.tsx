import React from 'react';
import { Link } from 'react-router-dom';
import { Folder } from 'lucide-react';
import { cn } from '../../utils/cn';

interface FolderItemProps {
  id: string;
  name: string;
  to: string;
  className?: string;
}

export const FolderItem: React.FC<FolderItemProps> = ({
  id,
  name,
  to,
  className,
}) => (
  <Link
    to={to}
    className={cn(
      'flex items-center gap-3 p-3 rounded-theme-md transition-colors cursor-pointer',
      'bg-theme-tertiary hover:bg-theme-hover border border-theme',
      className,
    )}
  >
    <div className="p-2 bg-theme-secondary rounded-theme-sm shadow-theme-card shrink-0">
      <Folder size={20} className="text-theme-muted" />
    </div>
    <div>
      <p className="text-sm text-theme-primary font-medium">{name}</p>
      <p className="text-xs text-theme-muted">Папка</p>
    </div>
  </Link>
);