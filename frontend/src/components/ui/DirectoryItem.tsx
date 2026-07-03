import React from 'react';
import { Link } from 'react-router-dom';
import { Folder, MoreVertical } from 'lucide-react';
import { cn } from '../../utils/cn';

interface DirectoryItemProps {
  id: string;
  name: string;
  members?: number;
  to: string;
  className?: string;
  onContextMenu?: (e: React.MouseEvent) => void;
  onMoreClick?: (e: React.MouseEvent) => void;
}

export const DirectoryItem: React.FC<DirectoryItemProps> = ({
  id,
  name,
  members,
  to,
  className,
  onContextMenu,
  onMoreClick,
}) => (
  <div className="group">
    <Link
      key={id}
      to={to}
      onContextMenu={onContextMenu}
      className={cn(
        'flex items-center gap-3 p-3 rounded-theme-md transition-colors cursor-pointer',
        'bg-theme-tertiary hover:bg-theme-hover border border-theme',
        className,
      )}
    >
      <div className="p-2 bg-theme-secondary rounded-theme-sm shadow-theme-card shrink-0">
        <Folder size={20} className="text-theme-muted group-hover:text-brand transition-colors" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-theme-primary font-medium truncate">{name}</p>
        {members !== undefined && <p className="text-xs text-theme-muted">{members} участников</p>}
      </div>
      {onMoreClick && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onMoreClick(e);
          }}
          className="p-2 -m-1 rounded-theme-sm text-theme-muted hover:text-theme-primary hover:bg-theme-hover transition-colors shrink-0"
        >
          <MoreVertical size={16} />
        </button>
      )}
    </Link>
  </div>
);
