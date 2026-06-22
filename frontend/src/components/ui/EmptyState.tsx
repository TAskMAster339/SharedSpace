// components/ui/EmptyState.tsx
import React from 'react';
import { cn } from '../../utils/cn';

interface EmptyStateProps {
  icon?: React.ReactElement<{ size?: number; className?: string }>;
  title?: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  size?: 'sm' | 'md';
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className,
  size = 'md',
}) => {
  const sizes = {
    sm: 'py-8 text-sm',
    md: 'py-12 text-sm',
  };

  const iconSizes = {
    sm: 24,
    md: 32,
  };

  // Создаем иконку с правильным размером
  const renderIcon = () => {
    if (!icon) return null;

    return React.cloneElement(icon, {
      size: iconSizes[size],
      className: cn('mx-auto mb-2 text-theme-muted', icon.props.className),
    });
  };

  return (
    <div
      className={cn(
        'text-center text-theme-muted border-2 border-theme-dashed rounded-theme-lg bg-theme-secondary',
        sizes[size],
        className,
      )}
    >
      {renderIcon()}
      {title && <p className="font-medium text-theme-primary mb-1">{title}</p>}
      <p>
        {description}
        {action && (
          <button
            onClick={action.onClick}
            className="text-brand hover:text-brand-hover font-medium ml-1"
          >
            {action.label}
          </button>
        )}
      </p>
    </div>
  );
};
