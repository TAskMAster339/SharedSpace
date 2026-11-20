import React, { createContext, useContext, useLayoutEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { GitFork } from 'lucide-react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { ItemPropertiesProvider } from './ui/ItemProperties';
import { StorageUsageModal } from './ui/StorageUsageModal';
import { Footer } from './Footer';
import { MobileBottomNav } from './MobileBottomNav';
import { ScrollToTopButton } from './ScrollToTopButton';
import { ToastContainer } from './ui/ToastContainer';
import { useToastStore } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';
import { cn } from '../utils/cn';
import { PRIVACY_POLICY_PATH } from '../constants/privacy';

const GITHUB_URL = 'https://github.com/TAskMAster339/SharedSpace';
const CURRENT_YEAR = new Date().getFullYear();

interface LayoutProps {
  children?: React.ReactNode;
  fillViewport?: boolean;
}

const ReaderLayout = createContext<((active: boolean) => void) | null>(null);

export function useReaderLayout(active: boolean) {
  const setReader = useContext(ReaderLayout);
  useLayoutEffect(() => {
    if (!active || !setReader) return;
    setReader(true);
    return () => setReader(false);
  }, [active, setReader]);
}

export const Layout: React.FC<LayoutProps> = ({ children, fillViewport = false }) => {
  const [reader, setReader] = useState(false);
  const workspace = fillViewport || reader;
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const isOnLandingPage = location.pathname === '/';
  const { toasts, removeToast } = useToastStore();

  return (
    <div className={cn('bg-theme-primary flex flex-col', workspace ? 'h-dvh' : 'min-h-screen')}>
      {!reader && <Header />}

      <div className={cn('flex flex-1 relative', workspace && 'min-h-0')}>
        {isAuthenticated && !workspace && (
          <div className="sticky top-16 h-[calc(100vh-4rem)] shrink-0">
            <Sidebar />
          </div>
        )}

        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <div
            className={cn(
              'flex-1 min-w-0 flex flex-col',
              workspace ? 'min-h-0 overflow-hidden' : 'overflow-y-auto overflow-x-clip',
            )}
          >
            <div
              className={cn(
                'self-center w-full flex-1 flex flex-col',
                workspace ? 'min-h-0' : 'max-w-6xl',
                !workspace && !isOnLandingPage && 'p-4 sm:p-6',
                !workspace && isAuthenticated && !isOnLandingPage && 'pb-24 md:pb-6',
              )}
            >
              <ReaderLayout.Provider value={setReader}>
                <ItemPropertiesProvider>{children ? children : <Outlet />}</ItemPropertiesProvider>
              </ReaderLayout.Provider>
            </div>
          </div>
          {!workspace && (
            <>
              <div
                className={`md:hidden shrink-0 border-t border-theme px-4 py-3 text-center${isAuthenticated ? ' pb-20' : ''}`}
              >
                <p className="text-xs text-theme-muted">
                  &copy; {CURRENT_YEAR} SharedSpace. Учебный проект.
                </p>
                <div className="flex items-center justify-center gap-4 mt-2">
                  <Link
                    to={PRIVACY_POLICY_PATH}
                    className="text-xs text-theme-muted hover:text-theme-secondary transition-colors"
                  >
                    Политика конфиденциальности
                  </Link>
                  <a
                    href={GITHUB_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-theme-muted hover:text-theme-secondary transition-colors"
                  >
                    <GitFork size={12} />
                    GitHub
                  </a>
                </div>
              </div>
              <div className="hidden md:block">
                <Footer />
              </div>
            </>
          )}
        </div>
      </div>

      {isAuthenticated && !workspace && <MobileBottomNav />}
      {isAuthenticated && !reader && <StorageUsageModal />}
      {!workspace && <ScrollToTopButton />}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
};
