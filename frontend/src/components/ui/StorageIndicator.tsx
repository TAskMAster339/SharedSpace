import React from 'react';
import { HardDrive } from 'lucide-react';
import { cn } from '../../utils/cn';

interface StorageIndicatorProps {
  used: number;
  total: number;
  className?: string;
}

export const StorageIndicator: React.FC<StorageIndicatorProps> = ({
  used,
  total,
  className,
}) => {
  const percentage = Math.min((used / total) * 100, 100);

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-center justify-between text-xs text-theme-secondary mb-3">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <HardDrive size={14} className="text-theme-muted" /> Хранилище
        </span>
        <span className="text-sm">
          {used.toFixed(1)} / {total} ГБ
        </span>
      </div>
      <div className="w-full h-1.5 bg-theme-border rounded-full overflow-hidden">
        <div
          className="h-full bg-brand rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};