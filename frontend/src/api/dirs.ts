import { apiRequest } from './client';

export interface DirectoryResponse {
  id: string;
  name: string;
  owner_id: string;
  parent_id: string | null;
  type: string;
  created_at: string;
  updated_at: string;
}

export interface DirectoryFile {
  id: string;
  filename: string;
  extension: string;
  mime_type: string;
  size: number;
  created_at: string;
  updated_at: string;
}

export interface DirectoryContents {
  id: string;
  name: string;
  subdirectories: DirectoryResponse[];
  files: DirectoryFile[];
}

export interface CreateDirectoryPayload {
  name: string;
  parent_id: string;
  shared: boolean;
}

export function createDirectory(
  accessToken: string,
  payload: CreateDirectoryPayload,
): Promise<DirectoryResponse> {
  return apiRequest<DirectoryResponse>('/directories', {
    method: 'POST',
    token: accessToken,
    body: JSON.stringify(payload),
  });
}

export function getDirectoryContents(
  accessToken: string,
  directoryId: string,
): Promise<DirectoryContents> {
  return apiRequest<DirectoryContents>(`/directories/${directoryId}/contents`, {
    method: 'GET',
    token: accessToken,
  });
}

export function getRootContents(accessToken: string): Promise<DirectoryContents> {
  return apiRequest<DirectoryContents>('/directories/root/contents', {
    method: 'GET',
    token: accessToken,
  });
}
