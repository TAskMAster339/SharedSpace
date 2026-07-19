import { create } from 'zustand';
import { useDirectoryStore } from './directoryStore';
import { useFavoritesStore } from './favoritesStore';
import type { AuthUser } from '../api/auth';
import {
  login as loginRequest,
  register as registerRequest,
  refresh,
  logout as logoutRequest,
  resendVerificationEmail as resendVerificationEmailRequest,
  verifyEmail as verifyEmailRequest,
} from '../api/auth';
import {
  getMe,
  updateProfile as updateProfileRequest,
  changePassword as changePasswordRequest,
  deleteAccount as deleteAccountRequest,
} from '../api/users';
import { setAuthHandlers } from '../api/client';
import { getCookie, setCookie, removeCookie } from '../utils/cookies';

const REFRESH_COOKIE = 'refresh_token';

export interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isHydrating: boolean;
  /** Derived from user.activated — true if the user has confirmed their email. */
  isActivated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    username: string;
    firstName: string;
    lastName: string;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateProfile: (data: {
    username?: string;
    firstName?: string;
    lastName?: string;
  }) => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
  resendVerification: () => Promise<void>;
  /**
   * Verifies an email using a single-use token. If the caller is currently
   * authenticated (i.e. they opened the link in the same browser session),
   * we refresh the token pair so the next API call carries activated=true.
   * Returns the verified user ID.
   */
  verifyEmailAndRefresh: (token: string) => Promise<string>;
}

function deriveActivated(user: AuthUser | null): boolean {
  return !!user?.activated;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isHydrating: true,
  isActivated: false,

  login: async (email, password) => {
    const result = await loginRequest({ email, password });
    setCookie(REFRESH_COOKIE, result.tokens.refresh_token, result.tokens.refresh_expires_in);
    set({
      user: result.user,
      accessToken: result.tokens.access_token,
      isAuthenticated: true,
      isActivated: deriveActivated(result.user),
    });
    useDirectoryStore.getState().reset();
    useFavoritesStore.getState().reset();
    await useDirectoryStore.getState().fetchPersonalStorageId(result.tokens.access_token);

    // Автоматически отправляем письмо подтверждения для неактивированных
    // пользователей — модал будет показывать актуальный статус.
    if (!result.user.activated) {
      resendVerificationEmailRequest(result.tokens.access_token).catch(() => {});
    }
  },

  register: async (data) => {
    await registerRequest({
      email: data.email,
      username: data.username,
      first_name: data.firstName,
      second_name: data.lastName,
      password: data.password,
    });
    // Регистрация не возвращает токены, поэтому логинимся сразу после неё.
    // Логин разрешён для неподтверждённых пользователей — модал подтверждения
    // почты появится глобально после редиректа на /dashboard.
    await get().login(data.email, data.password);
  },

  logout: async () => {
    const refreshToken = getCookie(REFRESH_COOKIE);
    if (refreshToken) {
      await logoutRequest(refreshToken).catch(() => undefined);
    }
    removeCookie(REFRESH_COOKIE);
    set({ user: null, accessToken: null, isAuthenticated: false, isActivated: false });
    useDirectoryStore.getState().reset();
    useFavoritesStore.getState().reset();
  },

  refreshUser: async () => {
    const { accessToken } = get();
    if (!accessToken) return;
    try {
      const user = await getMe(accessToken);
      set({ user, isActivated: deriveActivated(user) });
    } catch {
      return;
    }
  },

  hydrate: async () => {
    const refreshToken = getCookie(REFRESH_COOKIE);
    if (!refreshToken) {
      set({ isHydrating: false });
      return;
    }
    try {
      const result = await refresh(refreshToken);
      setCookie(REFRESH_COOKIE, result.tokens.refresh_token, result.tokens.refresh_expires_in);
      const user = await getMe(result.tokens.access_token);
      set({
        user,
        accessToken: result.tokens.access_token,
        isAuthenticated: true,
        isActivated: deriveActivated(user),
      });
      await useDirectoryStore.getState().fetchPersonalStorageId(result.tokens.access_token);
    } catch {
      removeCookie(REFRESH_COOKIE);
      set({ user: null, accessToken: null, isAuthenticated: false, isActivated: false });
      useDirectoryStore.getState().reset();
      useFavoritesStore.getState().reset();
    } finally {
      set({ isHydrating: false });
    }
  },

  updateProfile: async (data) => {
    const { accessToken } = get();
    if (!accessToken) {
      throw new Error('Not authenticated');
    }
    const user = await updateProfileRequest(accessToken, {
      username: data.username,
      first_name: data.firstName,
      second_name: data.lastName,
    });
    set({ user, isActivated: deriveActivated(user) });
  },

  changePassword: async (oldPassword, newPassword) => {
    const { accessToken } = get();
    const refreshToken = getCookie(REFRESH_COOKIE);
    if (!accessToken || !refreshToken) {
      throw new Error('Not authenticated');
    }
    await changePasswordRequest(accessToken, {
      old_password: oldPassword,
      new_password: newPassword,
      current_refresh_token: refreshToken,
    });
  },

  deleteAccount: async () => {
    const refreshToken = getCookie(REFRESH_COOKIE);
    if (!refreshToken) {
      throw new Error('No refresh token');
    }

    const { accessToken } = get();
    if (!accessToken) {
      throw new Error('Not authenticated');
    }

    await deleteAccountRequest(accessToken, { current_refresh_token: refreshToken });
    removeCookie(REFRESH_COOKIE);
    set({ user: null, accessToken: null, isAuthenticated: false, isActivated: false });
  },

  resendVerification: async () => {
    const { accessToken } = get();
    if (!accessToken) {
      throw new Error('Not authenticated');
    }
    await resendVerificationEmailRequest(accessToken);
  },

  verifyEmailAndRefresh: async (token) => {
    const result = await verifyEmailRequest(token);
    // If the user is currently logged in on this device, rotate the token
    // pair so the next request carries activated=true. Otherwise the caller
    // will be redirected to /login.
    const { accessToken } = get();
    if (accessToken && result.user_id) {
      try {
        const refreshResult = await refresh(getCookie(REFRESH_COOKIE) || '');
        setCookie(
          REFRESH_COOKIE,
          refreshResult.tokens.refresh_token,
          refreshResult.tokens.refresh_expires_in,
        );
        const user = await getMe(refreshResult.tokens.access_token);
        set({
          user,
          accessToken: refreshResult.tokens.access_token,
          isAuthenticated: true,
          isActivated: deriveActivated(user),
        });
      } catch {
        // Token rotation failed — not fatal, the user can log in fresh.
      }
    }
    return result.user_id || '';
  },
}));

setAuthHandlers({
  refresh: async () => {
    const refreshToken = getCookie(REFRESH_COOKIE);
    if (!refreshToken) {
      throw new Error('No refresh token');
    }
    const result = await refresh(refreshToken);
    setCookie(REFRESH_COOKIE, result.tokens.refresh_token, result.tokens.refresh_expires_in);
    useAuthStore.setState({
      accessToken: result.tokens.access_token,
      isAuthenticated: true,
    });
    return result.tokens.access_token;
  },
  onAuthFailure: () => {
    removeCookie(REFRESH_COOKIE);
    useAuthStore.setState({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isActivated: false,
    });
  },
});
