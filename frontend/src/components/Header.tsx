import React, { useState, useRef, useEffect, useId } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Settings,
  LogOut,
  ChevronDown,
  MoonStar,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  X,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { UserSearch } from './UserSearch';
import { Avatar } from './ui/Avatar';
import { cn } from '../utils/cn';

const logo = '/logo-mark.png';

interface WorkspaceHeader {
  nearLogo: React.ReactNode;
  themeButton: React.ReactNode;
  actions?: React.ReactNode;
  leave: (action: () => void) => void;
}

interface HeaderProps {
  workspace?: WorkspaceHeader;
  sidebar?: {
    id: string;
    collapsed: boolean;
    onToggle: () => void;
  };
}

function HeaderThemeButton() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="shrink-0 rounded-theme p-2 transition-colors hover:bg-theme-hover"
      aria-label="Переключить тему"
    >
      <MoonStar size={20} className={theme === 'dark' ? 'text-brand' : 'text-theme-secondary'} />
    </button>
  );
}

export const Header: React.FC<HeaderProps> = ({ workspace, sidebar }) => {
  const { isAuthenticated, user, firstName, lastName, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isOnLandingPage = location.pathname === '/';
  const sidebarLabel = sidebar?.collapsed ? 'Развернуть боковое меню' : 'Свернуть боковое меню';
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileSearchId = useId();
  const lastNameInitial = lastName ? lastName.charAt(0).toUpperCase() + '.' : '';

  const profileRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLDivElement>(null);
  const mobileSearchBtnRef = useRef<HTMLButtonElement>(null);

  // Закрытие выпадающих элементов по клику в любом месте вне их самих и их триггеров
  useEffect(() => {
    if (!dropdownOpen && !mobileSearchOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;

      if (dropdownOpen && !profileRef.current?.contains(target)) {
        setDropdownOpen(false);
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
  }, [dropdownOpen, mobileSearchOpen]);

  const toggleMobileSearch = () => {
    setMobileSearchOpen((open) => !open);
  };

  function navigateFromHeader(event: React.MouseEvent<HTMLAnchorElement>, to: string) {
    if (
      !workspace ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    workspace.leave(() => navigate(to));
  }

  const handleLogout = () => {
    setDropdownOpen(false);
    const action = () => {
      logout();
      navigate('/');
    };
    if (workspace) workspace.leave(action);
    else action();
  };

  const scrollToSection = (id: string) => (e: React.MouseEvent) => {
    const el = document.getElementById(id);
    if (el) {
      e.preventDefault();
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <header
      className={cn(
        'sticky top-0 z-50 flex h-16 w-full shrink-0 items-center justify-between border-b border-theme bg-theme-secondary sm:px-6',
        workspace ? 'gap-2 px-2' : 'px-4',
      )}
    >
      <div
        className={cn(
          'flex min-w-0 items-center gap-2',
          workspace || sidebar ? 'lg:gap-4' : 'sm:gap-8',
        )}
      >
        {isOnLandingPage ? (
          <div className="flex items-center gap-2 shrink-0">
            <img src={logo} alt="SharedSpace" className="w-8 h-8 rounded-theme shadow-theme-card" />
            <span className="text-xl font-semibold tracking-tight hidden sm:inline">
              <span className="text-brand-dark dark:text-brand">Shared</span>
              <span className="text-brand">Space</span>
            </span>
          </div>
        ) : (
          <Link
            to={isAuthenticated ? '/dashboard' : '/'}
            onClick={(event) => navigateFromHeader(event, isAuthenticated ? '/dashboard' : '/')}
            aria-label="SharedSpace"
            className="flex shrink-0 cursor-pointer items-center gap-2"
          >
            <img src={logo} alt="" className="size-8 rounded-theme shadow-theme-card" />
            <span
              className={cn(
                'hidden font-semibold tracking-tight',
                workspace ? 'min-[390px]:inline sm:text-xl' : 'text-xl sm:inline',
              )}
            >
              <span className="text-brand-dark dark:text-brand">Shared</span>
              <span className="text-brand">Space</span>
            </span>
          </Link>
        )}

        {sidebar && (
          <button
            type="button"
            aria-label={sidebarLabel}
            title={sidebarLabel}
            aria-controls={sidebar.id}
            aria-expanded={!sidebar.collapsed}
            onClick={sidebar.onToggle}
            className="hidden size-9 shrink-0 place-items-center rounded-theme border border-theme text-theme-secondary transition-colors hover:bg-theme-hover hover:text-brand md:grid"
          >
            {sidebar.collapsed ? (
              <PanelLeftOpen size={18} aria-hidden="true" />
            ) : (
              <PanelLeftClose size={18} aria-hidden="true" />
            )}
          </button>
        )}
        {workspace?.nearLogo}

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
          <UserSearch className="mx-4 hidden min-w-0 max-w-2xl flex-1 md:block lg:mx-8" />

          <div
            className={cn(
              'flex shrink-0 items-center gap-1',
              workspace ? 'sm:gap-2 lg:gap-4' : 'sm:gap-4',
            )}
          >
            <button
              type="button"
              ref={mobileSearchBtnRef}
              aria-expanded={mobileSearchOpen}
              aria-controls={mobileSearchOpen ? mobileSearchId : undefined}
              onClick={toggleMobileSearch}
              className="group p-2 rounded-theme hover:bg-theme-hover transition-colors md:hidden"
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

            {workspace?.themeButton ?? <HeaderThemeButton />}
            {workspace?.actions}

            <div className="relative" ref={profileRef}>
              <button
                type="button"
                aria-label="Меню аккаунта"
                aria-expanded={dropdownOpen}
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 rounded-theme p-1 transition-colors hover:bg-theme-hover"
              >
                <Avatar username={user?.username ?? ''} className="w-8 h-8 border border-theme" />
                <span
                  className={cn(
                    'hidden text-sm font-medium text-theme-primary',
                    workspace ? 'lg:block' : 'sm:block',
                  )}
                >
                  {firstName} {lastNameInitial}
                </span>
                <ChevronDown
                  size={16}
                  className={cn(
                    'text-theme-muted transition-transform duration-200',
                    workspace && 'hidden sm:block',
                    dropdownOpen && 'rotate-180',
                  )}
                />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 top-12 w-48 bg-theme-secondary rounded-theme shadow-theme-dropdown border border-theme z-20 overflow-hidden">
                  <Link
                    to="/settings"
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-theme-secondary hover:bg-theme-hover transition-colors"
                    onClick={(event) => {
                      setDropdownOpen(false);
                      navigateFromHeader(event, '/settings');
                    }}
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

          {mobileSearchOpen && (
            <div
              id={mobileSearchId}
              ref={mobileSearchRef}
              className="absolute left-0 right-0 top-20 mx-3 z-40 md:hidden"
            >
              <UserSearch className="w-full ring-2 ring-brand/50 rounded-theme" />
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <HeaderThemeButton />
          <Link
            to="/login"
            className="text-sm font-medium text-theme-secondary hover:text-theme-primary px-3 sm:px-4 py-2 rounded-theme transition-colors whitespace-nowrap"
          >
            Войти
          </Link>
          <Link
            to="/register"
            className="text-sm font-medium text-theme-on-brand bg-brand hover:bg-brand-hover px-3 sm:px-4 py-2 rounded-theme transition-colors whitespace-nowrap"
          >
            Зарегистрироваться
          </Link>
        </div>
      )}
    </header>
  );
};
