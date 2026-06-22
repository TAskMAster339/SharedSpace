import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Search, Settings, LogOut, ChevronDown, MoonStar } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';

const logo = '/logo.jpg';

interface HeaderProps {
  hasUnreadInvites?: boolean;
}

// Пока мок, прописать логику получения кол-ва непрочитанных приглашений
const unreadCount = 0;

const Header: React.FC<HeaderProps> = ({ hasUnreadInvites = unreadCount > 0 }) => {
  const { isAuthenticated, firstName, lastName, avatar } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const lastNameInitial = lastName ? lastName.charAt(0).toUpperCase() + '.' : '';
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <header className="header">
      {/* Логотип + Название */}
      <Link to="/" className="header-logo group"> {/* <-- group добавлен сюда */}
        <img src={logo} alt="SharedSpace" className="header-logo-img" />
        <span className="header-logo-text">
          <span className="header-logo-brand">Shared</span>
          <span className="header-logo-accent">Space</span>
        </span>
      </Link>

      {isAuthenticated ? (
        <>
          {/* Строка поиска (по центру) */}
          <div className="header-search">
            <div className="header-search-wrapper">
              <Search className="header-search-icon" size={16} />
              <input
                type="text"
                placeholder="Поиск файлов, папок, людей..."
                className="header-search-input"
              />
            </div>
          </div>

          {/* Правая часть: Уведомления и Профиль */}
          <div className="header-actions">
            {/* Кнопка переключения темы */}
            <button
              onClick={toggleTheme}
              className="header-theme-toggle"
              aria-label="Переключить тему"
            >
              <MoonStar 
                size={20} 
                className={`header-theme-icon ${theme === 'dark' ? 'header-theme-icon-dark' : 'header-theme-icon-light'}`}
              />
            </button>

            {/* Колокольчик */}
            <Link to="/invitations" className="header-notification">
              <Bell size={20} className="text-gray-600" />
              {hasUnreadInvites && <span className="header-notification-dot" />}
            </Link>

            {/* Профиль с выпадающим меню */}
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="header-profile-btn"
              >
                <img src={avatar} alt="User" className="header-profile-avatar" />
                <span className="header-profile-name">
                  {firstName} {lastNameInitial}
                </span>
                <ChevronDown
                  size={16}
                  className={`header-profile-chevron ${dropdownOpen ? 'header-profile-chevron-open' : ''}`}
                />
              </button>

              {dropdownOpen && (
                <div className="header-dropdown">
                  <Link
                    to="/settings"
                    className="header-dropdown-item"
                    onClick={() => setDropdownOpen(false)}
                  >
                    <Settings size={16} className="text-gray-400" /> Настройки
                  </Link>
                  <button
                    className="header-dropdown-danger"
                    onClick={() => setDropdownOpen(false)}
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
        <div className="header-auth">
          <button
            onClick={toggleTheme}
            className="header-theme-toggle"
            aria-label="Переключить тему"
          >
            <MoonStar 
              size={20} 
              className={`header-theme-icon ${theme === 'dark' ? 'header-theme-icon-dark' : 'header-theme-icon-light'}`}
            />
          </button>
          <Link to="/login" className="header-auth-link">
            Sign In
          </Link>
          <Link to="/register" className="header-auth-btn">
            Sign Up
          </Link>
        </div>
      )}
    </header>
  );
};

export default Header;
