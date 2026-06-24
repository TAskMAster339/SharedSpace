import { apiRequest } from './client';

export type SharingRole = 'viewer' | 'editor' | 'admin';

export interface SharedDirectory {
  id: string;
  directory_id: string;
  name: string;
  owner_id: string;
  owner_name: string;
  role: SharingRole;
  created_at: string;
}

export interface Member {
  id: string;
  user_id: string;
  username: string;
  role: SharingRole;
  joined_at: string;
}

export function getSharedWithMe(accessToken: string): Promise<SharedDirectory[]> {
  return apiRequest<SharedDirectory[]>('/shared/with-me', {
    method: 'GET',
    token: accessToken,
  });
}

export function getMembers(accessToken: string, sharedDirectoryId: string): Promise<Member[]> {
  return apiRequest<Member[]>(`/shared-directories/${sharedDirectoryId}/members`, {
    method: 'GET',
    token: accessToken,
  });
}
