import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigationStore } from '../../store/navigationStore';
import { cn } from '../../utils/cn';

interface NavArrowsProps {
  onBack: () => void;
  onForward: () => void;
}

export const NavArrows: React.FC<NavArrowsProps> = ({ onBack, onForward }) => {
  const canGoBack = useNavigationStore((s) => s.canGoBack());
  const canGoForward = useNavigationStore((s) => s.canGoForward());

  return (
    <div className="inline-flex rounded-theme-md overflow-hidden border border-theme divide-x divide-theme">
      <button
        onClick={onBack}
        disabled={!canGoBack}
        className={cn(
          'p-1.5 transition-colors',
          canGoBack
            ? 'text-theme-secondary hover:text-brand hover:bg-theme-hover cursor-pointer'
            : 'text-theme-muted opacity-30 cursor-default',
        )}
        aria-label="Назад"
      >
        <ChevronLeft size={20} />
      </button>
      <button
        onClick={onForward}
        disabled={!canGoForward}
        className={cn(
          'p-1.5 transition-colors',
          canGoForward
            ? 'text-theme-secondary hover:text-brand hover:bg-theme-hover cursor-pointer'
            : 'text-theme-muted opacity-30 cursor-default',
        )}
        aria-label="Вперёд"
      >
        <ChevronRight size={20} />
      </button>
    </div>
  );
};
