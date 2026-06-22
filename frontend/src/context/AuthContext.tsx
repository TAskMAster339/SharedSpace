import React, { createContext, useContext, useState } from 'react';
import { AuthUser, TokenPair, login as loginRequest, register as registerRequest } from '../api/auth';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    username: string;
    firstName: string;
    lastName: string;
    password: string;
  }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function storeTokens(tokens: TokenPair) {
  localStorage.setItem('access_token', tokens.access_token);
  localStorage.setItem('refresh_token', tokens.refresh_token);
}

function storeUser(user: AuthUser) {
  localStorage.setItem('user', JSON.stringify(user));
}

function readStoredUser(): AuthUser | null {
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser());

  const login = async (email: string, password: string) => {
    const result = await loginRequest({ email, password });
    storeTokens(result.tokens);
    storeUser(result.user);
    setUser(result.user);
  };

  const register = async (data: {
    email: string;
    username: string;
    firstName: string;
    lastName: string;
    password: string;
  }) => {
    await registerRequest({
      email: data.email,
      username: data.username,
      first_name: data.firstName,
      second_name: data.lastName,
      password: data.password,
    });
    // Регистрация не возвращает токены, поэтому логинимся сразу после неё.
    await login(data.email, data.password);
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return ctx;
};
