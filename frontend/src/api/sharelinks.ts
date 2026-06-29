import { apiRequest } from './client';

export type ShareLinkAccess = 'public' | 'authenticated';

export interface ShareLink {
  id: string;
  file_id: string | null;
  directory_id: string | null;
  token: string;
  access_type: ShareLinkAccess;
  expires_at: string | null;
  created_at: string;
  has_password: boolean;
}

export interface ShareLinkResolveResult {
  file_id: string;
  filename: string;
  extension: string;
  mime_type: string;
  size: number;
  owner_username: string;
  created_at: string;
  url: string;
}

export interface CreateShareLinkRequest {
  access_type: ShareLinkAccess;
  expires_at?: string | null;
  password?: string;
}

export interface UpdateShareLinkRequest {
  access_type?: ShareLinkAccess;
  expires_at?: string | null;
  password?: string | null;
}

export function createShareLink(
  accessToken: string,
  fileId: string,
  body: CreateShareLinkRequest,
): Promise<ShareLink> {
  return apiRequest<ShareLink>(`/files/${fileId}/share-links`, {
    method: 'POST',
    token: accessToken,
    body: JSON.stringify(body),
  });
}

export function listShareLinks(accessToken: string, fileId: string): Promise<ShareLink[]> {
  return apiRequest<ShareLink[]>(`/files/${fileId}/share-links`, {
    method: 'GET',
    token: accessToken,
  });
}

export function updateShareLink(
  accessToken: string,
  linkId: string,
  body: UpdateShareLinkRequest,
): Promise<ShareLink> {
  return apiRequest<ShareLink>(`/share-links/${linkId}`, {
    method: 'PATCH',
    token: accessToken,
    body: JSON.stringify(body),
  });
}

export function deleteShareLink(accessToken: string, linkId: string): Promise<void> {
  return apiRequest<void>(`/share-links/${linkId}`, {
    method: 'DELETE',
    token: accessToken,
  });
}

export function resolveShareLink(
  token: string,
  accessToken?: string | null,
  password?: string,
): Promise<ShareLinkResolveResult> {
  return apiRequest<ShareLinkResolveResult>(`/s/${token}`, {
    method: 'GET',
    ...(accessToken ? { token: accessToken } : {}),
    ...(password ? { headers: { 'X-SharedLink-Password': encodeURIComponent(password) } } : {}),
  });
}

// ---- Directory share links ----

export interface DirectoryShareLinkFile {
  id: string;
  filename: string;
  extension: string;
  mime_type: string;
  size: number;
  url: string;
}

export interface DirectoryShareLinkSubdir {
  id: string;
  name: string;
}

export interface DirectoryShareLinkResolveResult {
  id: string;
  name: string;
  token: string;
  subdirectories: DirectoryShareLinkSubdir[];
  files: DirectoryShareLinkFile[];
  owner_username: string;
}

export function createDirectoryShareLink(
  accessToken: string,
  dirId: string,
  body: CreateShareLinkRequest,
): Promise<ShareLink> {
  return apiRequest<ShareLink>(`/directories/${dirId}/share-links`, {
    method: 'POST',
    token: accessToken,
    body: JSON.stringify(body),
  });
}

export function listDirectoryShareLinks(accessToken: string, dirId: string): Promise<ShareLink[]> {
  return apiRequest<ShareLink[]>(`/directories/${dirId}/share-links`, {
    method: 'GET',
    token: accessToken,
  });
}

export function resolveDirectoryShareLink(
  token: string,
  subDirId?: string,
  accessToken?: string | null,
  password?: string,
): Promise<DirectoryShareLinkResolveResult> {
  let path = `/sd/${token}`;
  if (subDirId) {
    path += `?dir=${encodeURIComponent(subDirId)}`;
  }
  return apiRequest<DirectoryShareLinkResolveResult>(path, {
    method: 'GET',
    ...(accessToken ? { token: accessToken } : {}),
    ...(password ? { headers: { 'X-SharedLink-Password': encodeURIComponent(password) } } : {}),
  });
}
