import React from 'react';
import { Link } from 'react-router-dom';
import { Folder, MoreVertical } from 'lucide-react';
import { formatFileSize } from '../../utils/format';
import { cn } from '../../utils/cn';

interface DirectoryItemProps {
  id: string;
  name: string;
  sizeBytes?: number;
  members?: number;
  to: string;
  className?: string;
  onContextMenu?: (e: React.MouseEvent) => void;
  onMoreClick?: (e: React.MouseEvent) => void;
}

export const DirectoryItem: React.FC<DirectoryItemProps> = ({
  id,
  name,
  sizeBytes,
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
        'flex items-center gap-3 p-3 rounded-theme transition-colors cursor-pointer',
        'bg-theme-tertiary hover:bg-theme-hover border border-theme',
        className,
      )}
    >
      <div className="item-list-thumbnail bg-theme-secondary shadow-theme-card">
        <Folder size={20} className="text-theme-muted group-hover:text-brand transition-colors" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-theme-primary font-medium truncate">{name}</p>
        {members !== undefined && <p className="text-xs text-theme-muted">{members} участников</p>}
      </div>
      {sizeBytes !== undefined && (
        <span className="shrink-0 tabular-nums text-xs text-theme-secondary">
          {formatFileSize(sizeBytes)}
        </span>
      )}
      {onMoreClick && (
        <button
          type="button"
          aria-label="Открыть меню действий"
          aria-haspopup="menu"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onMoreClick(e);
          }}
          className="p-2 -m-1 rounded-theme text-theme-muted hover:text-theme-primary hover:bg-theme-hover transition-colors shrink-0"
        >
          <MoreVertical size={16} />
        </button>
      )}
    </Link>
  </div>
);
