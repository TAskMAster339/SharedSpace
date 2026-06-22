import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Folder, Users, Star, Mail, Trash2 } from 'lucide-react';
import { StorageIndicator } from './ui/StorageIndicator';
import { cn } from '../utils/cn';

interface SidebarProps {
  hasUnreadInvites?: boolean;
}

// Пока моки, прописать логику получения кол-ва непрочитанных приглашений и заполненности
const unreadCount = 0;
const spaceUsed = 12.5;
const spaceTotal = 50;
const personalStorageId = 'personal';

export const Sidebar: React.FC<SidebarProps> = ({ hasUnreadInvites = unreadCount > 0 }) => {
  const location = useLocation();
  const currentPath = location.pathname;

  const menuItems = [
    { label: 'Дашборд', icon: LayoutDashboard, path: '/dashboard' },
    { label: 'Личное хранилище', icon: Folder, path: `/directories/${personalStorageId}` },
    { label: 'Общие директории', icon: Users, path: '/directories' },
    { label: 'Избранное', icon: Star, path: '/favorites' },
    { label: 'Приглашения', icon: Mail, path: '/invitations', badge: hasUnreadInvites }, // Синяя точка
    { label: 'Корзина', icon: Trash2, path: '/trash' },
  ];

  return (
    <div className="w-64 h-[calc(100vh-4rem)] flex flex-col bg-theme-secondary border-r border-theme sticky top-0 shrink-0 px-4 py-2 hidden md:flex">
      <div className="flex-1 flex flex-col space-y-1 mt-2">
        <div className="px-3 mb-2 text-sm font-medium text-theme-muted uppercase tracking-wider">
          Меню
        </div>
        {menuItems.map((item) => {
          const isActive = currentPath === item.path;
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
              {item.badge && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-brand rounded-theme-full" />
              )}
            </Link>
          );
        })}
      </div>

      {/* Индикатор места внизу */}
      <div className="mt-auto mb-6 pt-6 border-t border-theme">
        <div className="bg-theme-tertiary rounded-theme-xl p-4 shadow-theme-card border border-theme/50">
          <StorageIndicator used={spaceUsed} total={spaceTotal} />
        </div>
      </div>
    </div>
  );
};
