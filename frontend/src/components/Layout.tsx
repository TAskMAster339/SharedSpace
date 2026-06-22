import React from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { useAuth } from '../hooks/useAuth';
import { cn } from '../utils/cn';

interface LayoutProps {
  children?: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-theme-primary flex flex-col">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        {isAuthenticated && <Sidebar />}
        <main className={cn('flex-1 overflow-y-auto p-4 sm:p-6', isAuthenticated ? 'ml-0' : '')}>
          <div className="max-w-6xl mx-auto">{children ? children : <Outlet />}</div>
        </main>
      </div>
    </div>
  );
};
