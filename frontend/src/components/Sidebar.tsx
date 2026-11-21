import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { HardDrive, Star, Trash2, Share2 } from 'lucide-react';
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

  return (
    <nav
      id={id}
      aria-label="Боковое меню"
      aria-busy={isLoading}
      onContextMenu={(event) => event.preventDefault()}
      className={cn(
        'flex h-full flex-col overflow-y-auto border-r border-theme bg-theme-secondary py-2',
        collapsed ? 'w-16 px-2' : 'w-64 px-4',
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
            {!collapsed && (
              <div className="mb-2 px-3 text-sm font-medium uppercase tracking-wider text-theme-muted">
                Меню
              </div>
            )}
            {menuItems.map((item) => {
              const isActive = isSidebarItemActive(item.path, currentPath, currentSection);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  title={collapsed ? item.label : undefined}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'group flex min-h-10 items-center rounded-theme text-sm font-medium transition-colors',
                    collapsed ? 'justify-center' : 'gap-3 px-3 py-2.5',
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

          <div
            className={cn(
              'mt-auto border-t border-theme',
              collapsed ? 'mb-2 pt-2' : 'mb-6 space-y-3 pt-6',
            )}
          >
            {!collapsed && (
              <Link
                to="/links"
                className="group bg-theme-tertiary hover:bg-theme-hover rounded-theme px-4 py-2.5 shadow-theme-card border border-theme/50 transition-colors cursor-pointer block"
              >
                <QuotaIndicator
                  fullWidth
                  icon={Share2}
                  label="Ссылки"
                  used={shareLinksUsed}
                  total={shareLinksQuota}
                />
              </Link>
            )}
            <button
              type="button"
              onClick={openStorage}
              aria-label="Использование хранилища"
              title={collapsed ? 'Использование хранилища' : undefined}
              className={cn(
                'group w-full rounded-theme border border-theme/50 bg-theme-tertiary transition-colors hover:bg-theme-hover',
                collapsed
                  ? 'grid min-h-10 place-items-center text-theme-secondary hover:text-brand'
                  : 'p-4 text-left shadow-theme-card',
              )}
            >
              {collapsed ? (
                <HardDrive size={18} aria-hidden="true" />
              ) : (
                <StorageIndicator used={storageUsed} total={storageQuota} />
              )}
            </button>
          </div>
        </>
      )}
    </nav>
  );
};
