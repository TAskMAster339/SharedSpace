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
    await get().login(data.email, data.password);
  },

  logout: async () => {
    const refreshToken = getCookie(REFRESH_COOKIE);
    removeCookie(REFRESH_COOKIE);
    set({ user: null, accessToken: null, isAuthenticated: false, isActivated: false });
    useDirectoryStore.getState().reset();
    useFavoritesStore.getState().reset();
    if (refreshToken) {
      await logoutRequest(refreshToken).catch(() => undefined);
    }
  },

  refreshUser: async () => {
    const { accessToken, user: currentUser } = get();
    if (!accessToken) return;
    try {
      const user = await getMe(accessToken);
      if (get().user?.id === currentUser?.id) {
        set({ user, isActivated: deriveActivated(user) });
      }
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
      } catch {}
    }
    return result.user_id || '';
  },
}));

let sessionVersion = 0;
useAuthStore.subscribe((state, previous) => {
  if (state.user?.id !== previous.user?.id) sessionVersion += 1;
});

setAuthHandlers({
  getSessionVersion: () => sessionVersion,
  getRefreshToken: () => getCookie(REFRESH_COOKIE),
  getAccessToken: () => useAuthStore.getState().accessToken,
  refresh: async () => {
    const refreshToken = getCookie(REFRESH_COOKIE);
    if (!refreshToken) {
      throw new Error('No refresh token');
    }
    const version = sessionVersion;
    const result = await refresh(refreshToken);
    if (version !== sessionVersion || getCookie(REFRESH_COOKIE) !== refreshToken) {
      throw new DOMException('Сеанс завершён', 'AbortError');
    }
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
