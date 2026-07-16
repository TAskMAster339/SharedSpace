import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { GitFork } from 'lucide-react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { Footer } from './Footer';
import { MobileBottomNav } from './MobileBottomNav';
import { ScrollToTopButton } from './ScrollToTopButton';
import { ToastContainer } from './ui/ToastContainer';
import { useToastStore } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';
import { cn } from '../utils/cn';

const GITHUB_URL = 'https://github.com/TAskMAster339/SharedSpace';
const PRIVACY_POLICY_URL = 'https://ifbest.org/politika-konfidentsialnosti';

interface LayoutProps {
  children?: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const isOnLandingPage = location.pathname === '/';
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="min-h-screen bg-theme-primary flex flex-col">
      <Header />

      <div className="flex flex-1 relative">
        {isAuthenticated && (
          <div className="sticky top-16 h-[calc(100vh-4rem)] shrink-0">
            <Sidebar />
          </div>
        )}

        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <div className="flex-1 min-w-0 overflow-y-auto overflow-x-clip">
            <div
              className={cn(
                'max-w-6xl mx-auto',
                isOnLandingPage ? 'p-0' : 'p-4 sm:p-6 pb-20 md:pb-6',
              )}
            >
              {children ? children : <Outlet />}
              <div className="md:hidden mt-8 pt-4 border-t border-theme text-center">
                <p className="text-xs text-theme-muted">
                  &copy; {new Date().getFullYear()} SharedSpace. Учебный проект.
                </p>
                <div className="flex items-center justify-center gap-4 mt-2">
                  <a
                    href={PRIVACY_POLICY_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-theme-muted hover:text-theme-secondary transition-colors"
                  >
                    Политика конфиденциальности
                  </a>
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
            </div>
          </div>
          <div className="hidden md:block">
            <Footer />
          </div>
        </div>
      </div>

      {isAuthenticated && <MobileBottomNav />}
      <ScrollToTopButton />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
};
