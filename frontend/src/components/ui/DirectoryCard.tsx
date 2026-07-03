import React from 'react';
import { Link } from 'react-router-dom';
import { Folder } from 'lucide-react';
import { Badge } from './Badge';
import { AvatarStack } from './AvatarStack';
import { cn } from '../../utils/cn';
import { formatCount, formatCountWord } from '../../utils/format';

interface DirectoryCardProps {
  id: string;
  name: string;
  role: string;
  memberCount: number;
  fileCount: number;
  memberUsernames: string[];
  to: string;
  className?: string;
  onContextMenu?: (e: React.MouseEvent) => void;
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
  onContextMenu,
}) => (
  <Link
    key={id}
    to={to}
    onContextMenu={onContextMenu}
    className={cn(
      'block p-5 rounded-theme-lg bg-theme-secondary border border-theme shadow-theme-card group',
      'hover:bg-brand-light transition-colors',
      className,
    )}
  >
    <div className="flex items-start justify-between mb-4">
      <div className="w-12 h-12 rounded-theme-md bg-brand-light group-hover:bg-theme-secondary flex items-center justify-center text-brand transition-colors">
        <Folder size={22} />
      </div>
      <Badge>{role}</Badge>
    </div>

    <h3 className="font-semibold text-theme-primary mb-1 truncate">{name}</h3>
    <p className="text-sm text-theme-muted mb-4">
      {formatCount(memberCount)}{' '}
      {formatCountWord(memberCount, 'участник', 'участника', 'участников')} &bull;{' '}
      <span title="Учтены файлы только в этой папке, без вложенных">
        {formatCount(fileCount)} {formatCountWord(fileCount, 'файл', 'файла', 'файлов')}
      </span>
    </p>

    <AvatarStack usernames={memberUsernames} />
  </Link>
);
