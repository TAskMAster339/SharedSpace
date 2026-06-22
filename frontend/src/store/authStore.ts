import { create } from 'zustand';
import {
  AuthUser,
  login as loginRequest,
  register as registerRequest,
  refresh,
  logout as logoutRequest,
} from '../api/auth';
import { getMe } from '../api/users';
import { getCookie, setCookie, removeCookie } from '../utils/cookies';

const REFRESH_COOKIE = 'refresh_token';

interface AuthState {
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
    } catch {
      removeCookie(REFRESH_COOKIE);
      set({ user: null, accessToken: null, isAuthenticated: false });
    } finally {
      set({ isHydrating: false });
    }
  },
}));
