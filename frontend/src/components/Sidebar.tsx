import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Folder, Users, Star, Mail, Trash2, HardDrive } from 'lucide-react';

// Компонент для отображения заполненности
const StorageIndicator = ({ used, total }: { used: number; total: number }) => {
  const percentage = Math.min((used / total) * 100, 100);
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <HardDrive size={14} className="text-gray-500" /> Storage
        </span>
        <span className="text-sm">
          {used.toFixed(1)} / {total} GB
        </span>
      </div>
      <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

interface SidebarProps {
  hasUnreadInvites?: boolean;
}

// Пока моки, прописать логику получения кол-ва непрочитанных приглашений и заполненности
const unreadCount = 0;
const spaceUsed = 12.5;
const spaceTotal = 50;
const personalStorageId = 'personal';

const Sidebar: React.FC<SidebarProps> = ({ hasUnreadInvites = unreadCount > 0 }) => {
  const location = useLocation();
  const currentPath = location.pathname;

  const menuItems = [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { label: 'Personal Space', icon: Folder, path: `/directories/${personalStorageId}` },
    { label: 'Shared Directories', icon: Users, path: '/directories' },
    { label: 'Favorites', icon: Star, path: '/favorites' },
    { label: 'Invitations', icon: Mail, path: '/invitations', badge: hasUnreadInvites }, // Синяя точка
    { label: 'Trash', icon: Trash2, path: '/trash' },
  ];

  return (
    <div className="w-64 h-[calc(100vh-4rem)] flex flex-col bg-white border-r border-gray-100 sticky top-0 shrink-0 px-4 py-2">
      <div className="flex-1 flex flex-col space-y-1 mt-2">
        <div className="px-3 mb-2 text-sm font-medium text-gray-400 uppercase tracking-wider">
          Menu
        </div>
        {menuItems.map((item) => {
          const isActive = currentPath === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors relative ${
                isActive ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <item.icon size={18} className={isActive ? 'text-blue-500' : 'text-gray-400'} />
              {item.label}
              {item.badge && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-blue-500 rounded-full" />
              )}
            </Link>
          );
        })}
      </div>

      {/* Индикатор места внизу */}
      <div className="mt-auto mb-6 pt-6 border-t border-gray-200">
        <div className="bg-gray-50/80 rounded-2xl p-4 shadow-sm border border-gray-100/50">
          <StorageIndicator used={spaceUsed} total={spaceTotal} />
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
