import React from 'react';
import { Link } from 'react-router-dom';
import { FileIcon } from './FileIcon';
import { cn } from '../../utils/cn';

interface FileGridItemProps {
  id: string;
  name: string;
  type: 'img' | 'pdf' | 'video' | 'text' | 'audio' | 'xlsx' | string;
  to: string;
  className?: string;
}

export const FileGridItem: React.FC<FileGridItemProps> = ({ id, name, type, to, className }) => {
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
        <FileIcon type={type} size={40} />
      </div>
      <p className="text-sm text-theme-primary font-medium text-center mt-2 truncate w-full max-w-[120px]">
        {name}
      </p>
    </Link>
  );
};
