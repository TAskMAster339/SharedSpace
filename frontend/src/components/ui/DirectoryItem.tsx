import React from 'react';
import { Link } from 'react-router-dom';
import { Folder } from 'lucide-react';
import { cn } from '../../utils/cn';

interface DirectoryItemProps {
  id: string;
  name: string;
  members: number;
  to: string;
  className?: string;
}

export const DirectoryItem: React.FC<DirectoryItemProps> = ({
  id,
  name,
  members,
  to,
  className,
}) => (
  <Link
    key={id}
    to={to}
    className={cn(
      'flex items-center gap-3 p-3 rounded-theme-md transition-colors cursor-pointer',
      'bg-theme-tertiary hover:bg-theme-hover',
      className,
    )}
  >
    <div className="p-2 rounded-theme-sm bg-brand-light flex items-center justify-center text-brand shrink-0">
      <Folder size={18} />
    </div>
    <div>
      <p className="text-sm text-theme-primary font-medium">{name}</p>
      <p className="text-xs text-theme-muted">{members} участников</p>
    </div>
  </Link>
);
