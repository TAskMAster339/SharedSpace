import { apiRequest } from './client';
import { AuthUser } from './auth';

export function getMe(accessToken: string): Promise<AuthUser> {
  return apiRequest<AuthUser>('/users/me', {
    method: 'GET',
    token: accessToken,
  });
}
