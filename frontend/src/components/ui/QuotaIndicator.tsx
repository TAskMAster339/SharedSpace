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
      <div className={cn('flex items-center justify-between w-full select-none', className)}>
        <span className="flex items-center gap-1.5 text-sm font-medium text-theme-secondary">
          <Icon size={14} className="text-theme-muted group-hover:text-brand transition-colors" />
          {label}
        </span>
        <span
          className={cn('text-sm font-medium tabular-nums', atLimit ? 'text-danger' : 'text-brand')}
        >
          {used} / {total}
        </span>
      </div>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border border-theme',
        atLimit ? 'bg-danger-light text-danger' : 'bg-theme-tertiary text-theme-secondary',
        className,
      )}
    >
      <Icon size={13} className={atLimit ? 'text-danger' : 'text-theme-muted'} />
      {label}
      <span className="tabular-nums font-semibold">
        {used}/{total}
      </span>
    </span>
  );
};
