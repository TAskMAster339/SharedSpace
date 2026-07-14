import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Settings, LogOut, ChevronDown, MoonStar, Menu, X, Search } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useNavigationStore } from '../store/navigationStore';
import { UserSearch } from './UserSearch';
import { MobileNavMenu } from './MobileNavMenu';
import { Avatar } from './ui/Avatar';
import { NavArrows } from './ui/NavArrows';

const logo = '/logo-mark.png';

export const Header: React.FC = () => {
  const { isAuthenticated, user, firstName, lastName, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const isOnLandingPage = location.pathname === '/';
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const lastNameInitial = lastName ? lastName.charAt(0).toUpperCase() + '.' : '';

  const profileRef = useRef<HTMLDivElement>(null);
  const mobileNavRef = useRef<HTMLDivElement>(null);
  const mobileNavBtnRef = useRef<HTMLButtonElement>(null);
  const mobileSearchRef = useRef<HTMLDivElement>(null);
  const mobileSearchBtnRef = useRef<HTMLButtonElement>(null);
  const skipNextRef = useRef(false);
  const push = useNavigationStore((s) => s.push);

  // Закрытие выпадающих элементов по клику в любом месте вне их самих и их триггеров
  useEffect(() => {
    if (!dropdownOpen && !mobileNavOpen && !mobileSearchOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;

      if (dropdownOpen && !profileRef.current?.contains(target)) {
        setDropdownOpen(false);
      }
      if (
        mobileNavOpen &&
        !mobileNavRef.current?.contains(target) &&
        !mobileNavBtnRef.current?.contains(target)
      ) {
        setMobileNavOpen(false);
      }
      if (
        mobileSearchOpen &&
        !mobileSearchRef.current?.contains(target) &&
        !mobileSearchBtnRef.current?.contains(target)
      ) {
        setMobileSearchOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [dropdownOpen, mobileNavOpen, mobileSearchOpen]);

  // Track navigation history
  useEffect(() => {
    if (skipNextRef.current) {
      skipNextRef.current = false;
      return;
    }
    if (isAuthenticated && location.pathname) {
      push(location.pathname);
    }
  }, [location.pathname, isAuthenticated, push]);

  const handleBack = useCallback(() => {
    const path = useNavigationStore.getState().back();
    if (path) {
      skipNextRef.current = true;
      navigate(path);
    }
  }, [navigate]);

  const handleForward = useCallback(() => {
    const path = useNavigationStore.getState().forward();
    if (path) {
      skipNextRef.current = true;
      navigate(path);
    }
  }, [navigate]);

  const toggleMobileNav = () => {
    setMobileSearchOpen(false);
    setMobileNavOpen((open) => !open);
  };

  const toggleMobileSearch = () => {
    setMobileNavOpen(false);
    setMobileSearchOpen((open) => !open);
  };

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
      <div className="flex items-center gap-2 sm:gap-8 min-w-0">
        {isAuthenticated && (
          <button
            ref={mobileNavBtnRef}
            onClick={toggleMobileNav}
            className="p-2 -ml-2 rounded-theme-full hover:bg-theme-hover transition-colors shrink-0 md:hidden"
            aria-label="Открыть меню"
          >
            {mobileNavOpen ? (
              <X size={20} className="text-theme-secondary" />
            ) : (
              <Menu size={20} className="text-theme-secondary" />
            )}
          </button>
        )}
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
        {isAuthenticated && (
          <NavArrows onBack={handleBack} onForward={handleForward} />
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
          <div className="flex items-center gap-1 sm:gap-4">
            {/* Кнопка поиска на мобильных */}
            <button
              ref={mobileSearchBtnRef}
              onClick={toggleMobileSearch}
              className="group p-2 rounded-theme-full hover:bg-theme-hover transition-colors md:hidden"
              aria-label="Поиск"
            >
              {mobileSearchOpen ? (
                <X size={20} className="text-theme-secondary" />
              ) : (
                <Search
                  size={20}
                  className="text-theme-secondary group-hover:text-brand transition-colors"
                />
              )}
            </button>

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
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 p-1 rounded-theme-full hover:bg-theme-hover transition-colors outline-none"
              >
                <Avatar username={user?.username ?? ''} className="w-8 h-8 border border-theme" />
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
                <div className="absolute right-0 top-12 w-48 bg-theme-secondary rounded-theme-xl shadow-theme-dropdown border border-theme z-20 overflow-hidden">
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

          {mobileNavOpen && (
            <div ref={mobileNavRef} className="contents">
              <MobileNavMenu onNavigate={() => setMobileNavOpen(false)} />
            </div>
          )}

          {mobileSearchOpen && (
            <div
              ref={mobileSearchRef}
              className="absolute left-0 right-0 top-16 mx-3 z-40 md:hidden"
            >
              <UserSearch className="w-full ring-2 ring-brand/50 rounded-theme-full" />
            </div>
          )}
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
