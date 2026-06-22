import React from 'react';
import { cn } from '../../utils/cn';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'dark' | 'empty';
}

export const Card: React.FC<CardProps> = ({
  children,
  className,
  variant = 'default',
}) => {
  const variants = {
    default: 'bg-theme-secondary border border-theme shadow-theme-card',
    dark: 'bg-theme-tertiary border border-theme shadow-theme-card',
    empty: 'bg-theme-secondary border-2 border-theme-dashed',
  };

  return (
    <div className={cn('rounded-theme-lg p-5', variants[variant], className)}>
      {children}
    </div>
  );
};

export const CardHeader: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <div className={cn('flex justify-between items-center mb-4', className)}>
    {children}
  </div>
);

export const CardTitle: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <h3 className={cn('font-medium text-theme-primary', className)}>{children}</h3>
);