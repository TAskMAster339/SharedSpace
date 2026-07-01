import { apiRequest } from './client';

export interface Permissions {
  view: boolean;
  download: boolean;
  upload: boolean;
  create_folder: boolean;
  delete: boolean;
  invite: boolean;
  change_role: boolean;
  remove_member: boolean;
  delete_directory: boolean;
}

export interface Directory {
  id: string;
  name: string;
  owner_id: string;
  parent_id: string | null;
  type: 'root' | 'regular';
  created_at: string;
  updated_at: string;
  has_share_links?: boolean;
  permissions?: Permissions;
  shared_directory_id?: string | null;
}

export interface BreadcrumbItem {
  id: string;
  name: string;
  type: 'root' | 'regular';
  is_shared: boolean;
}

export interface DirectoryPathResponse {
  path: BreadcrumbItem[];
}

export interface File {
  id: string;
  filename: string;
  extension: string;
  mime_type: string;
  size: number;
  has_share_links?: boolean;
  created_at: string;
  updated_at: string;
}

export interface DirectoryContents {
  id: string;
  name: string;
  subdirectories: Directory[];
  files: File[];
  next_files_cursor?: string;
  next_dirs_cursor?: string;
}

export interface CreateDirectoryRequest {
  name: string;
  parent_id: string;
  shared?: boolean;
}

export interface DirectoryPaginationParams {
  files_limit?: number;
  files_cursor?: string;
  dirs_limit?: number;
  dirs_cursor?: string;
}

function buildPaginationQuery(params?: DirectoryPaginationParams): string {
  if (!params) return '';
  const parts: string[] = [];
  if (params.files_limit !== undefined) parts.push(`files_limit=${params.files_limit}`);
  if (params.files_cursor) parts.push(`files_cursor=${encodeURIComponent(params.files_cursor)}`);
  if (params.dirs_limit !== undefined) parts.push(`dirs_limit=${params.dirs_limit}`);
  if (params.dirs_cursor) parts.push(`dirs_cursor=${encodeURIComponent(params.dirs_cursor)}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export function getRootDirectoryContents(
  token: string,
  pagination?: DirectoryPaginationParams,
): Promise<DirectoryContents> {
  const query = buildPaginationQuery(pagination);
  return apiRequest<DirectoryContents>(`/directories/root/contents${query}`, {
    method: 'GET',
    token,
  });
}

export function getDirectoryContents(
  token: string,
  directoryId: string,
  pagination?: DirectoryPaginationParams,
): Promise<DirectoryContents> {
  const query = buildPaginationQuery(pagination);
  return apiRequest<DirectoryContents>(`/directories/${directoryId}/contents${query}`, {
    method: 'GET',
    token,
  });
}

export function getDirectoryPath(
  token: string,
  directoryId: string,
): Promise<DirectoryPathResponse> {
  return apiRequest<DirectoryPathResponse>(`/directories/${directoryId}/path`, {
    method: 'GET',
    token,
  });
}

export function getDirectoryById(token: string, directoryId: string): Promise<Directory> {
  return apiRequest<Directory>(`/directories/${directoryId}`, {
    method: 'GET',
    token,
  });
}

export function createDirectory(token: string, data: CreateDirectoryRequest): Promise<Directory> {
  return apiRequest<Directory>('/directories', {
    method: 'POST',
    token,
    body: JSON.stringify(data),
  });
}

export function updateDirectory(
  token: string,
  directoryId: string,
  data: { name?: string; parent_id?: string },
): Promise<Directory> {
  return apiRequest<Directory>(`/directories/${directoryId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(data),
  });
}

export function softDeleteDirectory(token: string, directoryId: string): Promise<void> {
  return apiRequest<void>(`/directories/${directoryId}`, {
    method: 'DELETE',
    token,
  });
}

export function restoreDirectory(token: string, directoryId: string): Promise<void> {
  return apiRequest<void>(`/directories/${directoryId}/restore`, {
    method: 'POST',
    token,
  });
}

export function permanentDeleteDirectory(token: string, directoryId: string): Promise<void> {
  return apiRequest<void>(`/directories/${directoryId}/permanent`, {
    method: 'DELETE',
    token,
  });
}
