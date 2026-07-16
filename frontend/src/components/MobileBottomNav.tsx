import React, { useState, useCallback, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Folder, Star, LayoutDashboard, Trash2, MoreHorizontal, Link2, X } from 'lucide-react';
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
  links: 'text-green-500',
};

const TAB_INDEX: Record<string, number> = { storage: 0, favorites: 1, dashboard: 2, trash: 3 };

export const MobileBottomNav: React.FC = () => {
  const location = useLocation();
  const currentPath = location.pathname;
  const currentSection = useDirectoryStore((s) => s.currentSection);
  const { menuItems, storageUsed, storageQuota, shareLinksUsed, shareLinksQuota, isLoading } =
    useSidebarMenu();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const indicatorReady = useRef(false);

  const moreItems = menuItems.filter((m) =>
    ['Общие директории', 'Приглашения', 'Мои ссылки'].includes(m.label),
  );

  const isOnMorePage = moreItems.some((item) =>
    isSidebarItemActive(item.path, currentPath, currentSection),
  );

  const activeMoreItem = moreItems.find((item) =>
    isSidebarItemActive(item.path, currentPath, currentSection),
  );

  const isMoreActive = moreOpen || isOnMorePage;

  const findPath = useCallback(
    (key: string): string => {
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
    },
    [menuItems],
  );

  const activeTabIdx = useMemo(() => {
    if (isMoreActive) return 4;
    for (const tab of MAIN_TABS) {
      const path = findPath(tab.key);
      if (isSidebarItemActive(path, currentPath, currentSection)) {
        return TAB_INDEX[tab.key];
      }
    }
    return -1;
  }, [isMoreActive, currentPath, currentSection, findPath]);

  const isTabActive = (key: string): boolean => {
    if (isMoreActive) return false;
    const path = findPath(key);
    return isSidebarItemActive(path, currentPath, currentSection);
  };

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

  useLayoutEffect(() => {
    if (activeTabIdx === -1 || !indicatorRef.current || !navRef.current) return;
    const tabEl = navRef.current.querySelector(
      `[data-tab-idx="${activeTabIdx}"]`,
    ) as HTMLElement | null;
    if (!tabEl) return;
    const left = tabEl.offsetLeft;
    const width = tabEl.offsetWidth;
    if (!indicatorReady.current) {
      indicatorRef.current.style.transition = 'none';
      indicatorRef.current.style.left = `${left}px`;
      indicatorRef.current.style.width = `${width}px`;
      indicatorRef.current.style.opacity = '1';
      indicatorReady.current = true;
      requestAnimationFrame(() => {
        if (indicatorRef.current) {
          indicatorRef.current.style.transition = '';
        }
      });
    } else {
      indicatorRef.current.style.left = `${left}px`;
      indicatorRef.current.style.width = `${width}px`;
    }
  }, [activeTabIdx]);

  const moreBtnActiveColor = useMemo(() => {
    if (!activeMoreItem) return 'text-brand';
    if (activeMoreItem.label === 'Мои ссылки') return 'text-green-500';
    return 'text-brand';
  }, [activeMoreItem]);

  const MoreIcon = moreOpen ? X : activeMoreItem?.icon || MoreHorizontal;

  return (
    <>
      <nav
        ref={navRef}
        className="fixed bottom-4 left-4 right-4 z-40 bg-theme-secondary rounded-theme-xl shadow-theme-dropdown border border-theme md:hidden"
      >
        <div className="relative flex items-center px-1 py-1">
          <div
            ref={indicatorRef}
            className="absolute inset-y-1 rounded-theme-xl bg-theme-hover transition-all duration-300 ease-out pointer-events-none z-0 opacity-0"
          />

          {MAIN_TABS.map((tab, i) => {
            const active = isTabActive(tab.key);
            return (
              <Link
                key={tab.key}
                to={findPath(tab.key)}
                data-tab-idx={i}
                className={cn(
                  'relative z-10 flex-1 flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-theme-xl transition-all duration-200 min-w-0',
                  active
                    ? TAB_ACTIVE_COLORS[tab.key] || 'text-brand'
                    : 'text-theme-muted hover:text-theme-secondary',
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
            data-tab-idx={4}
            onClick={() => setMoreOpen((o) => !o)}
            className={cn(
              'relative z-10 flex-1 flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-theme-xl transition-all duration-200',
              isMoreActive ? moreBtnActiveColor : 'text-theme-muted hover:text-theme-secondary',
            )}
          >
            <MoreIcon size={22} />
            <span className="text-[10px] font-medium leading-tight">Ещё</span>
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-[51] md:hidden" onClick={closeMore}>
          <div className="absolute inset-0 bg-black/50" />
        </div>
      )}

      {moreOpen && (
        <div
          ref={moreRef}
          className="fixed bottom-20 left-2 right-2 z-[52] max-h-[60vh] overflow-y-auto bg-theme-secondary rounded-theme-xl shadow-theme-dropdown border border-theme py-3 md:hidden"
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
