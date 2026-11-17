import React from 'react';
import { Link } from 'react-router-dom';
import { Folder, MoreVertical } from 'lucide-react';
import { Badge } from './Badge';
import { AvatarStack } from './AvatarStack';
import { cn } from '../../utils/cn';
import { formatCount, formatCountWord, formatFileSize } from '../../utils/format';

interface DirectoryCardProps {
  id: string;
  name: string;
  sizeBytes?: number;
  role: string;
  memberCount: number;
  fileCount: number;
  memberUsernames: string[];
  to: string;
  className?: string;
  onContextMenu?: (e: React.MouseEvent) => void;
  onMoreClick?: (e: React.MouseEvent) => void;
}

export const DirectoryCard: React.FC<DirectoryCardProps> = ({
  id,
  name,
  sizeBytes,
  role,
  memberCount,
  fileCount,
  memberUsernames,
  to,
  className,
  onContextMenu,
  onMoreClick,
}) => (
  <div className="relative">
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
        <div className={onMoreClick ? 'mr-8' : undefined}>
          <Badge>{role}</Badge>
        </div>
      </div>

      <h3 className="font-semibold text-theme-primary mb-1 truncate">{name}</h3>
      <p className="text-sm text-theme-muted mb-4">
        {formatCount(memberCount)}{' '}
        {formatCountWord(memberCount, 'участник', 'участника', 'участников')} &bull;{' '}
        <span title="Учтены файлы только в этой папке, без вложенных">
          {formatCount(fileCount)} {formatCountWord(fileCount, 'файл', 'файла', 'файлов')}
        </span>
      </p>

      {sizeBytes !== undefined && (
        <p className="mb-3 text-xs tabular-nums text-theme-secondary">
          {formatFileSize(sizeBytes)}
        </p>
      )}
      <AvatarStack usernames={memberUsernames} />
    </Link>
    {onMoreClick && (
      <button
        type="button"
        aria-label="Открыть меню действий"
        aria-haspopup="menu"
        onClick={onMoreClick}
        className="absolute right-4 top-4 rounded-theme-sm p-2 text-theme-muted transition-colors hover:bg-theme-hover hover:text-theme-primary"
      >
        <MoreVertical size={18} />
      </button>
    )}
  </div>
);
