import { create } from 'zustand';
import { useDirectoryStore } from './directoryStore';
import {
  AuthUser,
  login as loginRequest,
  register as registerRequest,
  refresh,
  logout as logoutRequest,
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
  updateProfile: (data: {
    email?: string;
    username?: string;
    firstName?: string;
    lastName?: string;
  }) => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isHydrating: true,

  login: async (email, password) => {
    const result = await loginRequest({ email, password });
    setCookie(REFRESH_COOKIE, result.tokens.refresh_token, result.tokens.refresh_expires_in);
    set({ user: result.user, accessToken: result.tokens.access_token, isAuthenticated: true });
    useDirectoryStore.getState().reset();
    await useDirectoryStore.getState().fetchPersonalStorageId(result.tokens.access_token);
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
    await get().login(data.email, data.password);
  },

  logout: async () => {
    const refreshToken = getCookie(REFRESH_COOKIE);
    if (refreshToken) {
      await logoutRequest(refreshToken).catch(() => undefined);
    }
    removeCookie(REFRESH_COOKIE);
    set({ user: null, accessToken: null, isAuthenticated: false });
    useDirectoryStore.getState().reset();
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
      set({ user, accessToken: result.tokens.access_token, isAuthenticated: true });
      await useDirectoryStore.getState().fetchPersonalStorageId(result.tokens.access_token);
    } catch {
      removeCookie(REFRESH_COOKIE);
      set({ user: null, accessToken: null, isAuthenticated: false });
      useDirectoryStore.getState().reset();
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
      email: data.email,
      username: data.username,
      first_name: data.firstName,
      second_name: data.lastName,
    });
    set({ user });
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
    set({ user: null, accessToken: null, isAuthenticated: false });
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
    useAuthStore.setState({ accessToken: result.tokens.access_token, isAuthenticated: true });
    return result.tokens.access_token;
  },
  onAuthFailure: () => {
    removeCookie(REFRESH_COOKIE);
    useAuthStore.setState({ user: null, accessToken: null, isAuthenticated: false });
  },
});