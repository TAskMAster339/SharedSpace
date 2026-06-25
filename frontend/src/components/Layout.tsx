import React, { useRef, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { Footer } from './Footer';
import { ScrollToTopButton } from './ScrollToTopButton';
import { ToastContainer } from './ui/ToastContainer';
import { useToastStore } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';
import { cn } from '../utils/cn';

interface LayoutProps {
  children?: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const isOnLandingPage = location.pathname === '/';
  const mainRef = useRef<HTMLDivElement>(null);
  const { toasts, removeToast } = useToastStore();

  // Логируем для отладки
  useEffect(() => {
    console.log('📦 Layout toasts count:', toasts.length);
  }, [toasts]);

  return (
    <div className="min-h-screen bg-theme-primary flex flex-col">
      <Header />
      
      <div className="flex flex-1 relative">
        {isAuthenticated && (
          <div className="sticky top-16 h-[calc(100vh-4rem)] shrink-0">
            <Sidebar />
          </div>
        )}
        
        <div className="flex-1 flex flex-col min-h-0">
          <div
            ref={mainRef}
            className="flex-1 overflow-y-auto overflow-x-clip"
          >
            <div className={cn(
              "max-w-6xl mx-auto",
              isOnLandingPage ? "p-0" : "p-4 sm:p-6",
              !isOnLandingPage && "min-h-full"
            )}>
              {children ? children : <Outlet />}
            </div>
          </div>
          <Footer />
        </div>
      </div>
      
      <ScrollToTopButton scrollContainer={mainRef.current} />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
};
