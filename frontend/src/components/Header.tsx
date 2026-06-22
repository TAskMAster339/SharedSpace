import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Settings, LogOut, ChevronDown, MoonStar } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { SearchBar } from './ui/SearchBar';

const logo = '/logo.jpg';

interface HeaderProps {
  hasUnreadInvites?: boolean;
}

// Пока мок, прописать логику получения кол-ва непрочитанных приглашений
const unreadCount = 0;

export const Header: React.FC<HeaderProps> = ({ hasUnreadInvites = unreadCount > 0 }) => {
  const { isAuthenticated, firstName, lastName, avatar, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const lastNameInitial = lastName ? lastName.charAt(0).toUpperCase() + '.' : '';

  const handleLogout = () => {
    setDropdownOpen(false);
    logout();
    navigate('/login');
  };

  return (
    <header className="h-16 bg-theme-secondary border-b border-theme flex items-center justify-between px-4 sm:px-6 sticky top-0 z-10 w-full shrink-0">
      {/* Логотип + Название */}
      <Link to="/" className="flex items-center gap-2 cursor-pointer">
        <img src={logo} alt="SharedSpace" className="w-8 h-8 rounded-theme-sm shadow-theme-card" />
        <span className="text-xl font-semibold tracking-tight">
          <span className="text-brand-dark dark:text-brand">Shared</span>
          <span className="text-brand">Space</span>
        </span>
      </Link>

      {isAuthenticated ? (
        <>
          {/* Строка поиска (по центру) */}
          <SearchBar
            placeholder="Поиск файлов, папок, людей..."
            className="flex-1 max-w-2xl mx-4 sm:mx-8 hidden md:block"
          />

          {/* Правая часть: Уведомления и Профиль */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Кнопка переключения темы*/}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-theme-full hover:bg-theme-hover transition-colors"
              aria-label="Переключить тему"
            >
              <MoonStar
                size={20}
                className={theme === 'dark' ? 'text-brand' : 'text-theme-secondary'}
              />
            </button>

            {/* Колокольчик */}
            <Link
              to="/invitations"
              className="relative p-2 rounded-theme-full hover:bg-theme-hover transition-colors"
            >
              <Bell size={20} className="text-theme-secondary" />
              {hasUnreadInvites && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-brand rounded-theme-full border-2 border-theme-secondary" />
              )}
            </Link>

            {/* Профиль с выпадающим меню */}
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 p-1 rounded-theme-full hover:bg-theme-hover transition-colors outline-none"
              >
                <img
                  src={avatar}
                  alt="User"
                  className="w-8 h-8 rounded-theme-full border border-theme"
                />
                <span className="text-sm font-medium text-theme-primary hidden sm:block">
                  {firstName} {lastNameInitial}
                </span>
                <ChevronDown
                  size={16}
                  className={`text-theme-muted transition-transform duration-200 ${
                    dropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 top-12 w-48 bg-theme-secondary rounded-theme-xl shadow-theme-dropdown border border-theme py-1 z-20 overflow-hidden">
                  <Link
                    to="/settings"
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-theme-secondary hover:bg-theme-hover transition-colors"
                    onClick={() => setDropdownOpen(false)}
                  >
                    <Settings size={16} className="text-theme-muted" /> Настройки
                  </Link>
                  <button
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-danger w-full text-left hover:bg-danger-light transition-colors"
                    onClick={handleLogout}
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
          <button
            onClick={toggleTheme}
            className="p-2 rounded-theme-full hover:bg-theme-hover transition-colors"
            aria-label="Переключить тему"
          >
            <MoonStar
              size={20}
              className={theme === 'dark' ? 'text-brand' : 'text-theme-secondary'}
            />
          </button>
          <Link
            to="/login"
            className="text-sm font-medium text-theme-secondary hover:text-theme-primary px-4 py-2 rounded-theme-md transition-colors"
          >
            Войти
          </Link>
          <Link
            to="/register"
            className="text-sm font-medium text-theme-on-brand bg-brand hover:bg-brand-hover px-4 py-2 rounded-theme-md transition-colors"
          >
            Зарегестрироваться
          </Link>
        </div>
      )}
    </header>
  );
};
