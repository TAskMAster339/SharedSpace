import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { StorageIndicator } from './ui/StorageIndicator';
import { cn } from '../utils/cn';
import { useSidebarMenu } from '../hooks/useSidebarMenu';

interface MobileNavMenuProps {
  onNavigate: () => void;
}

export const MobileNavMenu: React.FC<MobileNavMenuProps> = ({ onNavigate }) => {
  const location = useLocation();
  const currentPath = location.pathname;
  const { menuItems, storageUsed, storageQuota, isLoading } = useSidebarMenu();

  return (
    <div className="absolute left-3 top-16 w-64 max-w-[80vw] bg-theme-secondary rounded-theme-xl shadow-theme-dropdown border border-theme py-2 z-40 md:hidden">
      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="px-2 flex flex-col space-y-1">
          {menuItems.map((item) => {
            const isActive =
              currentPath === item.path ||
              (item.path.startsWith('/directories/') && currentPath.startsWith('/directories/'));
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onNavigate}
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

          <div className="mt-2 pt-3 px-1 border-t border-theme">
            <div className="bg-theme-tertiary rounded-theme-xl p-4 shadow-theme-card border border-theme/50">
              <StorageIndicator used={storageUsed} total={storageQuota} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
