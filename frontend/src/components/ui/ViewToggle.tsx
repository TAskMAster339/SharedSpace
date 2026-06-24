import React from 'react';
import { LayoutGrid, List } from 'lucide-react';
import { cn } from '../../utils/cn';

export type ViewMode = 'grid' | 'list';

interface ViewToggleProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  className?: string;
}

export const ViewToggle: React.FC<ViewToggleProps> = ({
  viewMode,
  onViewModeChange,
  className,
}) => {
  return (
    <div
      className={cn(
        'inline-flex rounded-theme-md overflow-hidden border border-theme divide-x divide-theme',
        className,
      )}
    >
      <button
        onClick={() => onViewModeChange('grid')}
        className={cn(
          'p-2 transition-colors',
          viewMode === 'grid'
            ? 'bg-brand text-theme-on-brand'
            : 'bg-theme-secondary text-theme-muted hover:bg-theme-hover',
        )}
        aria-label="Сетка"
      >
        <LayoutGrid size={18} />
      </button>
      <button
        onClick={() => onViewModeChange('list')}
        className={cn(
          'p-2 transition-colors',
          viewMode === 'list'
            ? 'bg-brand text-theme-on-brand'
            : 'bg-theme-secondary text-theme-muted hover:bg-theme-hover',
        )}
        aria-label="Список"
      >
        <List size={18} />
      </button>
    </div>
  );
};
