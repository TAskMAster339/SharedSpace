import { apiRequest } from './client';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  first_name?: string;
  second_name?: string;
  storage_quota: number;
  storage_used: number;
  created_at: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  access_expires_in: number;
  refresh_expires_in: number;
}

export interface RegisterPayload {
  email: string;
  username: string;
  first_name: string;
  second_name: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterResult {
  user: AuthUser;
  root_directory_id: string;
}

export interface LoginResult {
  user: AuthUser;
  tokens: TokenPair;
}

export function register(payload: RegisterPayload): Promise<RegisterResult> {
  return apiRequest<RegisterResult>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function login(payload: LoginPayload): Promise<LoginResult> {
  return apiRequest<LoginResult>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface RefreshResult {
  tokens: TokenPair;
}

export function refresh(refreshToken: string): Promise<RefreshResult> {
  return apiRequest<RefreshResult>('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

export function logout(refreshToken: string): Promise<void> {
  return apiRequest<void>('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}
