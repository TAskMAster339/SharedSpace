import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Folder,
  Star,
  LayoutDashboard,
  Trash2,
  MoreHorizontal,
  Link2,
  X,
  Users,
  Mail,
  Share2,
} from 'lucide-react';
import { StorageIndicator } from './ui/StorageIndicator';
import { QuotaIndicator } from './ui/QuotaIndicator';
import { cn } from '../utils/cn';
import { useSidebarMenu, isSidebarItemActive } from '../hooks/useSidebarMenu';
import { useDirectoryStore } from '../store/directoryStore';

const MAIN_TABS = [
  { label: 'Хранилище', icon: Folder, key: 'storage' },
  { label: 'Избранное', icon: Star, key: 'favorites' },
  { label: 'Дашборд', icon: LayoutDashboard, key: 'dashboard' },
  { label: 'Корзина', icon: Trash2, key: 'trash' },
] as const;

const TAB_ACTIVE_COLORS: Record<string, string> = {
  favorites: 'text-yellow-400',
  trash: 'text-red-500',
};

export const MobileBottomNav: React.FC = () => {
  const location = useLocation();
  const currentPath = location.pathname;
  const currentSection = useDirectoryStore((s) => s.currentSection);
  const { menuItems, storageUsed, storageQuota, shareLinksUsed, shareLinksQuota, isLoading } =
    useSidebarMenu();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);

  const findPath = (key: string): string => {
    const map: Record<string, string> = {
      storage: `/directories/${
        menuItems
          .find((m) => m.label === 'Личное хранилище')
          ?.path.split('/')
          .pop() || 'personal'
      }`,
      favorites: '/favorites',
      dashboard: '/dashboard',
      trash: '/trash',
    };
    return map[key];
  };

  const isTabActive = (key: string): boolean => {
    const path = findPath(key);
    return isSidebarItemActive(path, currentPath, currentSection);
  };

  const moreItems = menuItems.filter((m) =>
    ['Общие директории', 'Приглашения', 'Мои ссылки'].includes(m.label),
  );

  const closeMore = useCallback(() => setMoreOpen(false), []);

  useEffect(() => {
    if (!moreOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!moreRef.current?.contains(target) && !moreBtnRef.current?.contains(target)) {
        closeMore();
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [moreOpen, closeMore]);

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-theme-secondary border-t border-theme md:hidden">
        <div className="flex items-center px-1 py-1">
          {MAIN_TABS.map((tab) => {
            const active = isTabActive(tab.key);
            return (
              <Link
                key={tab.key}
                to={findPath(tab.key)}
                className={cn(
                  'flex-1 flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-theme-xl transition-colors min-w-0',
                  active
                    ? `bg-theme-hover ${TAB_ACTIVE_COLORS[tab.key] || 'text-brand'}`
                    : 'text-theme-muted hover:text-theme-secondary hover:bg-theme-hover',
                )}
              >
                <tab.icon size={22} />
                <span className="text-[10px] font-medium leading-tight truncate w-full text-center">
                  {tab.label}
                </span>
              </Link>
            );
          })}
          <button
            ref={moreBtnRef}
            onClick={() => setMoreOpen((o) => !o)}
            className={cn(
              'flex-1 flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-theme-xl transition-colors',
              moreOpen
                ? 'text-brand bg-theme-hover'
                : 'text-theme-muted hover:text-theme-secondary hover:bg-theme-hover',
            )}
          >
            {moreOpen ? <X size={22} /> : <MoreHorizontal size={22} />}
            <span className="text-[10px] font-medium leading-tight">Ещё</span>
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={closeMore}>
          <div className="absolute inset-0 bg-black/50" />
        </div>
      )}

      {moreOpen && (
        <div
          ref={moreRef}
          className="fixed bottom-16 left-2 right-2 z-50 max-h-[60vh] overflow-y-auto bg-theme-secondary rounded-theme-xl shadow-theme-dropdown border border-theme py-3 md:hidden"
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="px-2 flex flex-col space-y-1">
              <div className="border-b border-theme pb-1">
                {moreItems.map((item) => {
                  const isActive = isSidebarItemActive(item.path, currentPath, currentSection);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={closeMore}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-theme-xl text-sm font-medium transition-colors',
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

              <div className="pt-2 px-3 space-y-3">
                <Link
                  to="/links"
                  onClick={closeMore}
                  className="group bg-theme-tertiary hover:bg-theme-hover rounded-theme-xl px-4 py-2.5 shadow-theme-card border border-theme/50 transition-colors cursor-pointer block"
                >
                  <QuotaIndicator
                    fullWidth
                    icon={Link2}
                    label="Ссылки"
                    used={shareLinksUsed}
                    total={shareLinksQuota}
                  />
                </Link>
                <div className="group bg-theme-tertiary hover:bg-theme-hover rounded-theme-xl p-4 shadow-theme-card border border-theme/50 transition-colors cursor-default">
                  <StorageIndicator used={storageUsed} total={storageQuota} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};
