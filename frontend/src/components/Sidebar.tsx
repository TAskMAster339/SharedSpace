import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Star, Trash2, Share2 } from 'lucide-react';
import { StorageIndicator } from './ui/StorageIndicator';
import { QuotaIndicator } from './ui/QuotaIndicator';
import { cn } from '../utils/cn';
import { useSidebarMenu, isSidebarItemActive } from '../hooks/useSidebarMenu';
import { useDirectoryStore } from '../store/directoryStore';

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const currentPath = location.pathname;
  const currentSection = useDirectoryStore((s) => s.currentSection);
  const { menuItems, storageUsed, storageQuota, shareLinksUsed, shareLinksQuota, isLoading } =
    useSidebarMenu();

  if (isLoading) {
    return (
      <div className="w-64 h-[calc(100vh-4rem)] flex flex-col bg-theme-secondary border-r border-theme sticky top-0 shrink-0 px-4 py-2 hidden md:flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className="w-64 h-[calc(100vh-4rem)] flex flex-col bg-theme-secondary border-r border-theme sticky top-0 shrink-0 px-4 py-2 hidden md:flex"
    >
      <div className="flex-1 flex flex-col space-y-1 mt-2">
        <div className="px-3 mb-2 text-sm font-medium text-theme-muted uppercase tracking-wider">
          Меню
        </div>
        {menuItems.map((item) => {
          const isActive = isSidebarItemActive(item.path, currentPath, currentSection);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'group flex items-center gap-3 px-3 py-2.5 rounded-theme-xl text-sm font-medium transition-colors relative',
                isActive
                  ? 'bg-brand-light text-brand dark:bg-brand-light'
                  : 'text-theme-secondary hover:bg-theme-hover',
              )}
            >
              <item.icon
                size={18}
                className={cn(
                  'size-[18px] transition-colors',
                  isActive && item.icon === Star
                    ? 'text-yellow-400'
                    : isActive && item.icon === Trash2
                      ? 'text-red-500'
                      : isActive && item.icon === Share2
                        ? 'text-green-500'
                        : isActive
                          ? 'text-brand'
                          : item.icon === Star
                            ? 'text-theme-muted group-hover:text-yellow-400'
                            : item.icon === Trash2
                              ? 'text-theme-muted group-hover:text-red-500'
                              : item.icon === Share2
                                ? 'text-theme-muted group-hover:text-green-500'
                                : 'text-theme-muted group-hover:text-brand',
                )}
              />
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* Индикаторы лимитов внизу */}
      <div className="mt-auto mb-6 pt-6 border-t border-theme space-y-3">
        <div className="group bg-theme-tertiary hover:bg-theme-hover rounded-theme-xl px-4 py-2.5 shadow-theme-card border border-theme/50 transition-colors cursor-default">
          <QuotaIndicator
            fullWidth
            icon={Share2}
            label="Ссылки"
            used={shareLinksUsed}
            total={shareLinksQuota}
          />
        </div>
        <div className="group bg-theme-tertiary hover:bg-theme-hover rounded-theme-xl p-4 shadow-theme-card border border-theme/50 transition-colors cursor-default">
          <StorageIndicator used={storageUsed} total={storageQuota} />
        </div>
      </div>
    </div>
  );
};
