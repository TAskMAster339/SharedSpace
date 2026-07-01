import { apiRequest } from './client';

export type SharingRole = 'viewer' | 'editor' | 'admin';

export interface SharedDirectoryWithStats {
  id: string;
  directory_id: string;
  name: string;
  owner_id: string;
  role: string;
  member_count: number;
  file_count: number;
  member_usernames: string[];
}

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

export const getSharedWithMeStats = async (
  accessToken: string,
): Promise<SharedDirectoryWithStats[]> => {
  return apiRequest<SharedDirectoryWithStats[]>('/shared/with-me/stats', {
    method: 'GET',
    token: accessToken,
  });
};

export function getSharedWithMe(accessToken: string, limit?: number): Promise<SharedDirectory[]> {
  const query = limit ? `?limit=${limit}` : '';
  return apiRequest<SharedDirectory[]>(`/shared/with-me${query}`, {
    method: 'GET',
    token: accessToken,
  });
}

export interface InvitableDirectory {
  id: string;
  directory_id: string;
  name: string;
  owner_id: string;
  owner_name: string;
  parent_id: string | null;
  type: string;
  role: SharingRole;
  created_at: string;
  updated_at: string;
}

export function getUserSharedDirectories(
  accessToken: string,
  limit?: number,
): Promise<InvitableDirectory[]> {
  const query = limit ? `?limit=${limit}` : '';
  return apiRequest<InvitableDirectory[]>(`/shared/directories${query}`, {
    method: 'GET',
    token: accessToken,
  });
}

export function getMembers(
  accessToken: string,
  sharedDirectoryId: string,
  limit?: number,
): Promise<Member[]> {
  const query = limit ? `?limit=${limit}` : '';
  return apiRequest<Member[]>(`/shared-directories/${sharedDirectoryId}/members${query}`, {
    method: 'GET',
    token: accessToken,
  });
}

export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'revoked';

export interface Invitation {
  id: string;
  shared_directory_id: string;
  directory_name: string;
  invited_by_user_id: string;
  invited_by_username: string;
  role: SharingRole;
  status: InvitationStatus;
  created_at: string;
}

export interface InvitationsListResponse {
  items: Invitation[];
  next_cursor?: string;
}

export function getMyInvitations(
  accessToken: string,
  pagination?: { limit?: number; cursor?: string },
): Promise<InvitationsListResponse> {
  const params = new URLSearchParams();
  if (pagination?.limit !== undefined) params.set('limit', String(pagination.limit));
  if (pagination?.cursor) params.set('cursor', pagination.cursor);
  const query = params.toString() ? `?${params.toString()}` : '';
  return apiRequest<InvitationsListResponse>(`/invitations${query}`, {
    method: 'GET',
    token: accessToken,
  });
}

export function acceptInvitation(accessToken: string, invitationId: string): Promise<void> {
  return apiRequest<void>(`/invitations/${invitationId}/accept`, {
    method: 'POST',
    token: accessToken,
  });
}

export function declineInvitation(accessToken: string, invitationId: string): Promise<void> {
  return apiRequest<void>(`/invitations/${invitationId}/decline`, {
    method: 'POST',
    token: accessToken,
  });
}

export function inviteToDirectory(
  accessToken: string,
  sharedDirectoryId: string,
  username: string,
): Promise<Invitation> {
  return apiRequest<Invitation>(`/shared-directories/${sharedDirectoryId}/invitations`, {
    method: 'POST',
    token: accessToken,
    body: JSON.stringify({ username }),
  });
}

export function changeMemberRole(
  accessToken: string,
  sharedDirectoryId: string,
  userId: string,
  role: SharingRole,
): Promise<void> {
  return apiRequest<void>(`/shared-directories/${sharedDirectoryId}/members/${userId}`, {
    method: 'PATCH',
    token: accessToken,
    body: JSON.stringify({ role }),
  });
}

export function removeMember(
  accessToken: string,
  sharedDirectoryId: string,
  userId: string,
): Promise<void> {
  return apiRequest<void>(`/shared-directories/${sharedDirectoryId}/members/${userId}`, {
    method: 'DELETE',
    token: accessToken,
  });
}
