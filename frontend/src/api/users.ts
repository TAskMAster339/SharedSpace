import { apiRequest } from './client';
import { AuthUser } from './auth';

export function getMe(accessToken: string): Promise<AuthUser> {
  return apiRequest<AuthUser>('/users/me', {
    method: 'GET',
    token: accessToken,
  });
}

export interface UpdateProfilePayload {
  email?: string;
  username?: string;
  first_name?: string;
  second_name?: string;
}

export function updateProfile(
  accessToken: string,
  payload: UpdateProfilePayload,
): Promise<AuthUser> {
  return apiRequest<AuthUser>('/users/me', {
    method: 'PATCH',
    token: accessToken,
    body: JSON.stringify(payload),
  });
}

export interface ChangePasswordPayload {
  old_password: string;
  new_password: string;
  current_refresh_token: string;
}

export function changePassword(
  accessToken: string,
  payload: ChangePasswordPayload,
): Promise<void> {
  return apiRequest<void>('/users/me/password', {
    method: 'PATCH',
    token: accessToken,
    body: JSON.stringify(payload),
  });
}
