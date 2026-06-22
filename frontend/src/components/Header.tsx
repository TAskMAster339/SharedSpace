import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Search, Settings, LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

const logo = '/logo.jpg';

interface HeaderProps {
  hasUnreadInvites?: boolean;
}

// Пока мок, прописать логику получения кол-ва непрочитанных приглашений
const unreadCount = 0;

const Header: React.FC<HeaderProps> = ({ hasUnreadInvites = unreadCount > 0 }) => {
  const { isAuthenticated, firstName, lastName, avatar } = useAuth();
  const lastNameInitial = lastName ? lastName.charAt(0).toUpperCase() + '.' : '';
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-6 sticky top-0 z-10 w-full shrink-0">
      {/* Логотип + Название */}
      <Link to="/" className="flex items-center gap-2 cursor-pointer group">
        <img src={logo} alt="SharedSpace" className="w-8 h-8 rounded-md shadow-sm" />
        <span className="text-xl font-semibold tracking-tight">
          <span className="text-[#1e3a8a]">Shared</span>
          <span className="text-[#60a5fa]">Space</span>
        </span>
      </Link>

      {isAuthenticated ? (
        <>
          {/* Строка поиска (по центру) */}
          <div className="flex-1 max-w-2xl mx-8 hidden md:block">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={16}
              />
              <input
                type="text"
                placeholder="Поиск файлов, папок, людей..."
                className="w-full pl-10 pr-4 py-2 bg-gray-50/80 border border-transparent focus:border-blue-300 rounded-lg text-sm outline-none transition-all"
              />
            </div>
          </div>

          {/* Правая часть: Уведомления и Профиль */}
          <div className="flex items-center gap-4">
            {/* Колокольчик */}
            <Link
              to="/invitations"
              className="relative p-2 rounded-full hover:bg-gray-100 transition-colors"
            >
              <Bell size={20} className="text-gray-600" />
              {hasUnreadInvites && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 border-white" />
              )}
            </Link>

            {/* Профиль с выпадающим меню */}
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 p-1 rounded-full hover:bg-gray-50 transition-colors outline-none"
              >
                <img
                  src={avatar}
                  alt="User"
                  className="w-8 h-8 rounded-full border border-gray-200"
                />
                <span className="text-sm font-medium text-gray-700 hidden sm:block">
                  {firstName} {lastNameInitial}
                </span>
                <ChevronDown
                  size={16}
                  className={`text-gray-500 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 top-12 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-20 animate-in fade-in slide-in-from-top-2">
                  <Link
                    to="/settings"
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => setDropdownOpen(false)}
                  >
                    <Settings size={16} className="text-gray-400" /> Настройки
                  </Link>
                  <button
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 w-full text-left hover:bg-red-50"
                    onClick={() => {
                      setDropdownOpen(false);
                      // Логика выхода...
                    }}
                  >
                    <LogOut size={16} /> Выход
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        // Неавторизованный вид
        <div className="flex items-center gap-4">
          <Link to="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900">
            Sign In
          </Link>
          <Link
            to="/register"
            className="text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded-lg transition-colors"
          >
            Sign Up
          </Link>
        </div>
      )}
    </header>
  );
};

export default Header;
