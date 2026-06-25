import React from 'react';
import { cn } from '../../utils/cn';

interface AvatarProps {
  username: string;
  displayName?: string;
  title?: string;
  className?: string;
  fallbackClassName?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  username,
  displayName,
  title,
  className,
  fallbackClassName = 'text-sm',
}) => {
  const initial = (displayName?.trim() || username?.trim() || '?').charAt(0).toUpperCase();

  return (
    <div
      title={title}
      className={cn(
        'rounded-theme-full bg-brand-light text-brand flex items-center justify-center font-semibold shrink-0',
        fallbackClassName,
        className,
      )}
    >
      {initial}
    </div>
  );
};
