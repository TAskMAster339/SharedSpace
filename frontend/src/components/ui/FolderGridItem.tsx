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
        'group flex flex-col items-center p-4 rounded-theme-md transition-colors cursor-pointer',
        'hover:bg-theme-hover',
        className,
      )}
    >
      <div className="w-20 h-20 flex items-center justify-center text-theme-muted group-hover:text-brand transition-colors">
        <Folder size={56} strokeWidth={1.5} />
      </div>
      <p className="text-sm text-theme-primary font-medium text-center mt-2 truncate w-full max-w-[140px]">
        {name}
      </p>
    </Link>
  );
};