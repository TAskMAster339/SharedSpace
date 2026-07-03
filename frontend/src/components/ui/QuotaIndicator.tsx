import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '../../utils/cn';

interface QuotaIndicatorProps {
  icon: LucideIcon;
  label: string;
  used: number;
  total: number;
  fullWidth?: boolean;
  className?: string;
}

export const QuotaIndicator: React.FC<QuotaIndicatorProps> = ({
  icon: Icon,
  label,
  used,
  total,
  fullWidth = false,
  className,
}) => {
  const atLimit = total > 0 && used >= total;

  if (fullWidth) {
    return (
      <div
        className={cn(
          'flex items-center justify-between w-full select-none text-theme-secondary',
          className,
        )}
      >
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Icon size={14} className="text-theme-muted group-hover:text-brand transition-colors" />
          {label}
        </span>
        <span className="text-sm font-semibold tabular-nums">
          <span
            className={cn('transition-colors', atLimit ? 'text-danger' : 'group-hover:text-brand')}
          >
            {used}
          </span>{' '}
          из {total}
        </span>
      </div>
    );
  }

  return (
    <span
      className={cn(
        'group inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border border-theme select-none',
        atLimit ? 'bg-danger-light text-danger' : 'bg-theme-tertiary text-theme-secondary',
        className,
      )}
    >
      <Icon
        size={13}
        className={cn(
          'transition-colors',
          atLimit ? 'text-danger' : 'text-theme-muted group-hover:text-brand',
        )}
      />
      {label}
      <span className="tabular-nums font-semibold">
        {used} из {total}
      </span>
    </span>
  );
};
