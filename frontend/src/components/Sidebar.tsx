import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { StorageIndicator } from './ui/StorageIndicator';
import { cn } from '../utils/cn';
import { useSidebarMenu } from '../hooks/useSidebarMenu';

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const currentPath = location.pathname;
  const { menuItems, storageUsed, storageQuota, isLoading } = useSidebarMenu();

  if (isLoading) {
    return (
      <div className="w-64 h-[calc(100vh-4rem)] flex flex-col bg-theme-secondary border-r border-theme sticky top-0 shrink-0 px-4 py-2 hidden md:flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-64 h-[calc(100vh-4rem)] flex flex-col bg-theme-secondary border-r border-theme sticky top-0 shrink-0 px-4 py-2 hidden md:flex">
      <div className="flex-1 flex flex-col space-y-1 mt-2">
        <div className="px-3 mb-2 text-sm font-medium text-theme-muted uppercase tracking-wider">
          Меню
        </div>
        {menuItems.map((item) => {
          const isActive =
            currentPath === item.path ||
            (item.path.startsWith('/directories/') && currentPath.startsWith('/directories/'));
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-theme-xl text-sm font-medium transition-colors relative',
                isActive
                  ? 'bg-brand-light text-brand dark:bg-brand-light'
                  : 'text-theme-secondary hover:bg-theme-hover',
              )}
            >
              <item.icon
                size={18}
                className={cn('size-[18px]', isActive ? 'text-brand' : 'text-theme-muted')}
              />
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* Индикатор места внизу */}
      <div className="mt-auto mb-6 pt-6 border-t border-theme">
        <div className="bg-theme-tertiary rounded-theme-xl p-4 shadow-theme-card border border-theme/50">
          <StorageIndicator used={storageUsed} total={storageQuota} />
        </div>
      </div>
    </div>
  );
};
