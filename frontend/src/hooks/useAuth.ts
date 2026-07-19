import { useAuthStore } from '../store/authStore';

export const useAuth = () => {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isActivated = useAuthStore((state) => state.isActivated);
  const login = useAuthStore((state) => state.login);
  const register = useAuthStore((state) => state.register);
  const logout = useAuthStore((state) => state.logout);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const changePassword = useAuthStore((state) => state.changePassword);
  const deleteAccount = useAuthStore((state) => state.deleteAccount);
  const resendVerification = useAuthStore((state) => state.resendVerification);
  const verifyEmailAndRefresh = useAuthStore((state) => state.verifyEmailAndRefresh);

  return {
    user,
    isAuthenticated,
    isActivated,
    firstName: user?.first_name ?? '',
    lastName: user?.second_name ?? '',
    email: user?.email ?? '',
    login,
    register,
    logout,
    updateProfile,
    changePassword,
    deleteAccount,
    resendVerification,
    verifyEmailAndRefresh,
  };
};
