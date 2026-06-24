import { apiRequest } from './client';

export type SharingRole = 'viewer' | 'editor' | 'admin';

export interface SharedDirectoryWithStats {
  id: string;
  directory_id: string;
  name: string;
  owner_id: string;
  owner_name: string;
  role: SharingRole;
  member_count: number;
  file_count: number;
  created_at: string;
}

export interface Member {
  id: string;
  user_id: string;
  username: string;
  role: SharingRole;
  joined_at: string;
}

export function getSharedWithMeStats(accessToken: string): Promise<SharedDirectoryWithStats[]> {
  return apiRequest<SharedDirectoryWithStats[]>('/shared/with-me/stats', {
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
