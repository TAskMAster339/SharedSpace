import { apiRequest } from './client';
import { AuthUser } from './auth';

export function getMe(accessToken: string): Promise<AuthUser> {
  return apiRequest<AuthUser>('/users/me', {
    method: 'GET',
    token: accessToken,
  });
}

export interface UpdateProfilePayload {
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

export function changePassword(accessToken: string, payload: ChangePasswordPayload): Promise<void> {
  return apiRequest<void>('/users/me/password', {
    method: 'PATCH',
    token: accessToken,
    body: JSON.stringify(payload),
  });
}

export function deleteAccount(
  accessToken: string,
  payload: { current_refresh_token: string },
): Promise<void> {
  return apiRequest<void>('/users/me', {
    method: 'DELETE',
    token: accessToken,
    body: JSON.stringify(payload),
  });
}

export interface SearchedUser {
  id: string;
  username: string;
  email: string;
  first_name?: string;
  second_name?: string;
  created_at: string;
}

interface SearchUsersResponse {
  users: SearchedUser[];
}

export function searchUsers(
  accessToken: string,
  query: string,
  limit = 5,
): Promise<SearchUsersResponse> {
  const params = new URLSearchParams({ query, limit: String(limit) });
  return apiRequest<SearchUsersResponse>(`/users/search?${params.toString()}`, {
    method: 'GET',
    token: accessToken,
  });
}

export function getUserById(accessToken: string, userId: string): Promise<AuthUser> {
  return apiRequest<AuthUser>(`/users/${userId}`, {
    method: 'GET',
    token: accessToken,
  });
}
