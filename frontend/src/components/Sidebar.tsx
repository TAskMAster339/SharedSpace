import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Folder, Users, Star, Mail, Trash2, HardDrive } from 'lucide-react';

// Компонент для отображения заполненности
const StorageIndicator = ({ used, total }: { used: number; total: number }) => {
  const percentage = Math.min((used / total) * 100, 100);
  return (
    <div className="storage-indicator">
      <div className="storage-indicator-header">
        <span className="storage-indicator-label">
          <HardDrive size={14} className="text-gray-500" /> Хранилище
        </span>
        <span className="storage-indicator-value">
          {used.toFixed(1)} / {total} ГБ
        </span>
      </div>
      <div className="storage-indicator-bar">
        <div className="storage-indicator-fill" style={{ width: `${percentage}%` }} />
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
    { label: 'Дашборд', icon: LayoutDashboard, path: '/dashboard' },
    { label: 'Личное хранилище', icon: Folder, path: `/directories/${personalStorageId}` },
    { label: 'Общие директории', icon: Users, path: '/directories' },
    { label: 'Избранное', icon: Star, path: '/favorites' },
    { label: 'Приглашения', icon: Mail, path: '/invitations', badge: hasUnreadInvites }, // Синяя точка
    { label: 'Корзина', icon: Trash2, path: '/trash' },
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-menu">
        <div className="sidebar-menu-label">Меню</div>
        {menuItems.map((item) => {
          const isActive = currentPath === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`sidebar-link ${isActive ? 'sidebar-link-active' : 'sidebar-link-inactive'}`}
            >
              <item.icon
                size={18}
                className={`sidebar-link-icon ${isActive ? 'sidebar-link-icon-active' : 'sidebar-link-icon-inactive'}`}
              />
              {item.label}
              {item.badge && <span className="sidebar-link-badge" />}
            </Link>
          );
        })}
      </div>

      {/* Индикатор места внизу */}
      <div className="sidebar-storage">
        <div className="sidebar-storage-card">
          <StorageIndicator used={spaceUsed} total={spaceTotal} />
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
