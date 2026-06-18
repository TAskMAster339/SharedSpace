import React from 'react';
import { Link, Outlet } from 'react-router-dom';

const Layout: React.FC = () => {
  return (
    <>
      <nav>
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/favorites">Избранное</Link>
        <Link to="/invitations">Приглашения</Link>
        <Link to="/trash">Корзина</Link>
      </nav>
      <div className="page">
        <Outlet />
      </div>
    </>
  );
};

export default Layout;
