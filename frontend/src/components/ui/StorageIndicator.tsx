import React from 'react';
import { HardDrive } from 'lucide-react';
import { cn } from '../../utils/cn';

interface StorageIndicatorProps {
  used: number;
  total: number;
  className?: string;
}

function formatBytes(gb: number): string {
  const bytes = gb * 1024 * 1024 * 1024;
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  const decimals = unitIndex === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${units[unitIndex]}`;
}

function formatGbValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export const StorageIndicator: React.FC<StorageIndicatorProps> = ({ used, total, className }) => {
  const percentage = total > 0 ? Math.min((used / total) * 100, 100) : 0;

  return (
    <div className={cn('w-full select-none', className)}>
      <div className="flex items-center justify-between gap-2 text-theme-secondary mb-3">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <HardDrive
            size={14}
            className="shrink-0 text-theme-muted group-hover:text-brand transition-colors"
          />{' '}
          Хранилище
        </span>
        <span
          className="shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums"
          title={`${formatBytes(used)} из ${formatBytes(total)}`}
        >
          {used.toFixed(1)} ГБ / {formatGbValue(total)} ГБ
        </span>
      </div>
      <div className="w-full h-1.5 bg-theme-border rounded-full overflow-hidden">
        <div
          className="h-full bg-brand rounded-full transition-all duration-300"
          style={{ width: `${percentage}%`, minWidth: '12px' }}
        />
      </div>
    </div>
  );
};
