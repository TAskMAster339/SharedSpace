import React from 'react';
import { Link } from 'react-router-dom';
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
}

export const FileItem: React.FC<FileItemProps> = ({
  id,
  name,
  date,
  size,
  type,
  to,
  className,
}) => (
  <Link
    key={id}
    to={to}
    className={cn(
      'flex items-center justify-between p-3 rounded-theme-md transition-colors cursor-pointer',
      'bg-theme-tertiary hover:bg-theme-hover',
      className
    )}
  >
    <div className="flex items-center gap-3">
      <div className="p-2 bg-theme-secondary rounded-theme-sm shadow-theme-card shrink-0">
        <FileIcon type={type} />
      </div>
      <div>
        <p className="text-sm text-theme-primary font-medium">{name}</p>
        <p className="text-xs text-theme-muted">{date}</p>
      </div>
    </div>
    <span className="text-xs text-theme-muted">{size}</span>
  </Link>
);