import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Settings, LogOut, ChevronDown, MoonStar } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { UserSearch } from './UserSearch';

const logo = '/logo-mark.png';

export const Header: React.FC = () => {
  const { isAuthenticated, firstName, lastName, avatar, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const isOnLandingPage = location.pathname === '/';
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const lastNameInitial = lastName ? lastName.charAt(0).toUpperCase() + '.' : '';

  const handleLogout = () => {
    setDropdownOpen(false);
    logout();
    navigate('/');
  };

  const scrollToSection = (id: string) => (e: React.MouseEvent) => {
    const el = document.getElementById(id);
    if (el) {
      e.preventDefault();
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <header className="h-16 bg-theme-secondary border-b border-theme flex items-center justify-between px-4 sm:px-6 sticky top-0 z-50 w-full shrink-0">
      <div className="flex items-center gap-8 min-w-0">
        {isOnLandingPage ? (
          <div className="flex items-center gap-2 shrink-0">
            <img
              src={logo}
              alt="SharedSpace"
              className="w-8 h-8 rounded-theme-sm shadow-theme-card"
            />
            <span className="text-xl font-semibold tracking-tight hidden sm:inline">
              <span className="text-brand-dark dark:text-brand">Shared</span>
              <span className="text-brand">Space</span>
            </span>
          </div>
        ) : (
          <Link
            to={isAuthenticated ? '/dashboard' : '/'}
            className="flex items-center gap-2 cursor-pointer shrink-0"
          >
            <img
              src={logo}
              alt="SharedSpace"
              className="w-8 h-8 rounded-theme-sm shadow-theme-card"
            />
            <span className="text-xl font-semibold tracking-tight hidden sm:inline">
              <span className="text-brand-dark dark:text-brand">Shared</span>
              <span className="text-brand">Space</span>
            </span>
          </Link>
        )}

        {!isAuthenticated && (
          <nav className="hidden md:flex items-center gap-6">
            <Link
              to="/#features"
              onClick={scrollToSection('features')}
              className="text-sm font-medium text-theme-secondary hover:text-theme-primary transition-colors"
            >
              Возможности
            </Link>
            <Link
              to="/#how-it-works"
              onClick={scrollToSection('how-it-works')}
              className="text-sm font-medium text-theme-secondary hover:text-theme-primary transition-colors"
            >
              Как это работает
            </Link>
          </nav>
        )}
      </div>

      {isAuthenticated ? (
        <>
          {/* Строка поиска (по центру) */}
          <UserSearch className="flex-1 max-w-2xl mx-4 sm:mx-8 hidden md:block" />

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
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-theme-full hover:bg-theme-hover transition-colors shrink-0"
            aria-label="Переключить тему"
          >
            <MoonStar
              size={20}
              className={theme === 'dark' ? 'text-brand' : 'text-theme-secondary'}
            />
          </button>
          <Link
            to="/login"
            className="text-sm font-medium text-theme-secondary hover:text-theme-primary px-3 sm:px-4 py-2 rounded-theme-md transition-colors whitespace-nowrap"
          >
            Войти
          </Link>
          <Link
            to="/register"
            className="text-sm font-medium text-theme-on-brand bg-brand hover:bg-brand-hover px-3 sm:px-4 py-2 rounded-theme-md transition-colors whitespace-nowrap"
          >
            Зарегистрироваться
          </Link>
        </div>
      )}
    </header>
  );
};
