import React from 'react';
import { Avatar } from './Avatar';

interface AvatarStackProps {
  usernames: string[];
  max?: number;
}

export const AvatarStack: React.FC<AvatarStackProps> = ({ usernames, max = 4 }) => {
  const visible = usernames.slice(0, max);
  const overflow = usernames.length - visible.length;

  return (
    <div className="flex items-center -space-x-2">
      {visible.map((username) => (
        <Avatar
          key={username}
          username={username}
          title={username}
          fallbackClassName="text-xs"
          className="w-7 h-7 border-2 border-theme-secondary"
        />
      ))}
      {overflow > 0 && (
        <span className="w-7 h-7 rounded-theme-full border-2 border-theme-secondary bg-theme-tertiary text-theme-secondary text-xs font-medium flex items-center justify-center">
          +{overflow}
        </span>
      )}
    </div>
  );
};
