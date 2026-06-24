import React from 'react';
import { Link } from 'react-router-dom';
import { Folder } from 'lucide-react';
import { Badge } from './Badge';
import { AvatarStack } from './AvatarStack';
import { cn } from '../../utils/cn';

interface DirectoryCardProps {
  id: string;
  name: string;
  role: string;
  memberCount: number;
  fileCount: number;
  memberUsernames: string[];
  to: string;
  className?: string;
}

export const DirectoryCard: React.FC<DirectoryCardProps> = ({
  id,
  name,
  role,
  memberCount,
  fileCount,
  memberUsernames,
  to,
  className,
}) => (
  <Link
    key={id}
    to={to}
    className={cn(
      'block p-5 rounded-theme-lg bg-theme-secondary border border-theme shadow-theme-card',
      'hover:bg-theme-hover transition-colors',
      className,
    )}
  >
    <div className="flex items-start justify-between mb-4">
      <div className="w-12 h-12 rounded-theme-md bg-brand-light flex items-center justify-center text-brand">
        <Folder size={22} />
      </div>
      <Badge>{role}</Badge>
    </div>

    <h3 className="font-semibold text-theme-primary mb-1 truncate">{name}</h3>
    <p className="text-sm text-theme-muted mb-4">
      {memberCount} участников &bull; {fileCount} файлов
    </p>

    <AvatarStack usernames={memberUsernames} />
  </Link>
);
