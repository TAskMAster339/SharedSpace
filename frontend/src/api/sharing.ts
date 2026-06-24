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

export function getMyInvitations(accessToken: string): Promise<Invitation[]> {
  return apiRequest<Invitation[]>('/invitations', {
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
