import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { Footer } from './Footer';
import { ScrollToTopButton } from './ScrollToTopButton';
import { useAuth } from '../hooks/useAuth';
import { cn } from '../utils/cn';

interface LayoutProps {
  children?: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [mainEl, setMainEl] = useState<HTMLElement | null>(null);

  return (
    <div className="h-screen bg-theme-primary flex flex-col">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        {isAuthenticated && <Sidebar />}
        <main
          ref={setMainEl}
          className={cn(
            'flex-1 overflow-y-auto overflow-x-clip flex flex-col',
            isAuthenticated ? 'ml-0' : '',
          )}
        >
          <div className="max-w-6xl mx-auto p-4 sm:p-6 flex-1 w-full">
            {children ? children : <Outlet />}
          </div>
          <Footer />
        </main>
      </div>
      <ScrollToTopButton scrollContainer={mainEl} />
    </div>
  );
};
