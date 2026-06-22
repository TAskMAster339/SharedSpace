import React from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import { useAuth } from '../hooks/useAuth';

interface LayoutProps {
  children?: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-[#fcfcfc] flex flex-col font-sans">
      <Header />

      <div className="flex flex-1 overflow-hidden">
        {isAuthenticated && <Sidebar />}

        <main className={`flex-1 overflow-y-auto p-6 ${isAuthenticated ? 'ml-0' : ''}`}>
          <div className="max-w-6xl mx-auto">{children ? children : <Outlet />}</div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
