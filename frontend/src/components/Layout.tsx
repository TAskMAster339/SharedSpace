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
    <div className="layout">
      <Header />

      <div className="layout-body">
        {isAuthenticated && <Sidebar />}

        <main className={`layout-main ${isAuthenticated ? 'layout-main-full' : ''}`}>
          <div className="layout-content">{children ? children : <Outlet />}</div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
