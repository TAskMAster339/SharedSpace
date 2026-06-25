import React, { useEffect, useState } from 'react';
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
  const [failed, setFailed] = useState(false);

  // Сбрасываем ошибку, если поменялся пользователь.
  useEffect(() => {
    setFailed(false);
  }, [username]);

  const initial = (displayName?.trim() || username?.trim() || '?').charAt(0).toUpperCase();

  if (failed || !username) {
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
  }

  return (
    <img
      src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username)}`}
      alt={username}
      title={title}
      onError={() => setFailed(true)}
      className={cn('rounded-theme-full bg-theme-tertiary shrink-0', className)}
    />
  );
};
