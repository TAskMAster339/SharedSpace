import { useAuthStore } from '../store/authStore';

export const useAuth = () => {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const login = useAuthStore((state) => state.login);
  const register = useAuthStore((state) => state.register);
  const logout = useAuthStore((state) => state.logout);

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
