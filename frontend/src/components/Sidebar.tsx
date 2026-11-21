import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Star, Trash2, Share2 } from 'lucide-react';
import { useStorageUsageStore } from '../store/storageUsageStore';
import { StorageIndicator } from './ui/StorageIndicator';
import { QuotaIndicator } from './ui/QuotaIndicator';
import { cn } from '../utils/cn';
import { useSidebarMenu, isSidebarItemActive } from '../hooks/useSidebarMenu';
import { useDirectoryStore } from '../store/directoryStore';

interface SidebarProps {
  id: string;
  collapsed: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ id, collapsed }) => {
  const location = useLocation();
  const openStorage = useStorageUsageStore((s) => s.open);
  const currentPath = location.pathname;
  const currentSection = useDirectoryStore((s) => s.currentSection);
  const { menuItems, storageUsed, storageQuota, shareLinksUsed, shareLinksQuota, isLoading } =
    useSidebarMenu();

  const detailsClassName = cn(
    'motion-safe:transition-opacity motion-safe:duration-200 motion-safe:ease-out',
    collapsed ? 'opacity-0' : 'opacity-100',
  );

  return (
    <nav
      id={id}
      aria-label="Боковое меню"
      aria-busy={isLoading}
      onContextMenu={(event) => event.preventDefault()}
      className={cn(
        'flex h-full flex-col overflow-x-hidden overflow-y-auto border-r border-theme bg-theme-secondary p-2 motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      {isLoading ? (
        <div className="grid flex-1 place-items-center">
          <div
            role="status"
            aria-label="Загружаем меню"
            className="size-6 animate-spin rounded-full border-2 border-brand border-t-transparent"
          />
        </div>
      ) : (
        <>
          <div className="mt-2 flex flex-1 flex-col space-y-1">
            {menuItems.map((item) => {
              const isActive = isSidebarItemActive(item.path, currentPath, currentSection);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  title={collapsed ? item.label : undefined}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'group flex min-h-10 items-center gap-3 overflow-hidden whitespace-nowrap rounded-theme px-[14px] py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-brand-light text-brand dark:bg-brand-light'
                      : 'text-theme-secondary hover:bg-theme-hover',
                  )}
                >
                  <item.icon
                    size={18}
                    aria-hidden="true"
                    className={cn(
                      'size-[18px] shrink-0 transition-colors',
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
                  <span className={collapsed ? 'sr-only' : undefined}>{item.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="mt-auto space-y-3 border-t border-theme pt-4 pb-2">
            <Link
              to="/links"
              aria-label="Ссылки"
              title={collapsed ? 'Ссылки' : undefined}
              className="group flex h-11 items-center overflow-hidden rounded-theme border border-theme/50 bg-theme-tertiary px-4 transition-colors hover:bg-theme-hover"
            >
              <QuotaIndicator
                fullWidth
                icon={Share2}
                label="Ссылки"
                used={shareLinksUsed}
                total={shareLinksQuota}
                className="min-w-[12.75rem]"
                detailsClassName={detailsClassName}
              />
            </Link>
            <button
              type="button"
              onClick={openStorage}
              aria-label="Использование хранилища"
              title={collapsed ? 'Использование хранилища' : undefined}
              className="group relative flex h-11 w-full items-center overflow-hidden rounded-theme border border-theme/50 bg-theme-tertiary px-4 text-left transition-colors hover:bg-theme-hover"
            >
              <StorageIndicator
                used={storageUsed}
                total={storageQuota}
                className="min-w-[12.75rem]"
                detailsClassName={detailsClassName}
                barClassName="absolute bottom-0 inset-x-0 h-0.5 rounded-none"
              />
            </button>
          </div>
        </>
      )}
    </nav>
  );
};
