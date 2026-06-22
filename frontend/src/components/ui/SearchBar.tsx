import React from 'react';
import { Search } from 'lucide-react';
import { cn } from '../../utils/cn';

interface SearchBarProps {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  placeholder = 'Поиск...',
  value,
  onChange,
  className,
}) => (
  <div className={cn('relative', className)}>
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" size={16} />
    <input
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      className={cn(
        'w-full pl-10 pr-4 py-2 rounded-theme-full text-sm outline-none transition-all',
        'bg-theme-tertiary border-2 border-theme-hover focus:border-brand',
        'text-theme-primary placeholder:text-theme-muted',
        'hover:border-brand/50',
      )}
    />
  </div>
);
