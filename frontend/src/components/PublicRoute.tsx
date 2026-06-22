import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface PublicRouteProps {
  children: React.ReactNode;
}

const PublicRoute: React.FC<PublicRouteProps> = ({ children }) => {
  const { isAuthenticated } = useAuth();

  // Если пользователь уже залогинен, отправляем его на Dashboard
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  // Иначе показываем страницу (Login или Register)
  return <>{children}</>;
};

export default PublicRoute;
