import React from 'react';
import { Link } from 'react-router-dom';
import { Folder } from 'lucide-react';
import { cn } from '../../utils/cn';

interface FolderGridItemProps {
  id: string;
  name: string;
  to: string;
  className?: string;
}

export const FolderGridItem: React.FC<FolderGridItemProps> = ({
  id,
  name,
  to,
  className,
}) => {
  return (
    <Link
      to={to}
      className={cn(
        'group flex flex-col items-center p-3 rounded-theme-md transition-colors cursor-pointer',
        'bg-theme-tertiary hover:bg-theme-hover border border-theme',
        className,
      )}
    >
      <div className="w-16 h-16 flex items-center justify-center text-theme-muted group-hover:text-brand transition-colors">
        <Folder size={40} strokeWidth={1.5} />
      </div>
      <p className="text-sm text-theme-primary font-medium text-center mt-2 truncate w-full max-w-[120px]">
        {name}
      </p>
    </Link>
  );
};