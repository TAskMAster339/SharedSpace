import { apiRequest } from './client';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  first_name?: string;
  second_name?: string;
  storage_quota: number;
  storage_used: number;
  shared_dirs_count: number;
  shared_dirs_quota: number;
  share_links_count: number;
  share_links_quota: number;
  activated: boolean;
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

// --- Email verification & password reset ---

export interface VerifyEmailResult {
  success: boolean;
  user_id?: string;
}

export function verifyEmail(token: string): Promise<VerifyEmailResult> {
  return apiRequest<VerifyEmailResult>('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export function resendVerificationEmail(accessToken: string): Promise<void> {
  return apiRequest<void>('/auth/resend-verification/me', {
    method: 'POST',
    token: accessToken,
  });
}

export function requestPasswordReset(email: string): Promise<void> {
  return apiRequest<void>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(token: string, newPassword: string): Promise<void> {
  return apiRequest<void>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, new_password: newPassword }),
  });
}
