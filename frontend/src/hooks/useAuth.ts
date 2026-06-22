import { useAuthContext } from '../context/AuthContext';

export const useAuth = () => {
  const { user, isAuthenticated, login, register, logout } = useAuthContext();

  return {
    isAuthenticated,
    firstName: user?.first_name ?? '',
    lastName: user?.second_name ?? '',
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.username ?? 'guest'}`,
    login,
    register,
    logout,
  };
};
