import React from 'react';
import { cn } from '../../utils/cn';

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, className }) => (
  <span
    className={cn(
      'px-2.5 py-1 rounded-theme-full text-xs font-medium bg-theme-tertiary text-theme-secondary',
      className,
    )}
  >
    {children}
  </span>
);
