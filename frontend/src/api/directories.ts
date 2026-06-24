import { apiRequest } from './client';

export interface Directory {
  id: string;
  name: string;
  owner_id: string;
  parent_id: string | null;
  type: 'root' | 'regular';
  created_at: string;
  updated_at: string;
}

export interface File {
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
  subdirectories: Directory[];
  files: File[];
}

export interface CreateDirectoryRequest {
  name: string;
  parent_id: string;
  shared?: boolean;
}

export function getRootDirectoryContents(token: string): Promise<DirectoryContents> {
  return apiRequest<DirectoryContents>('/directories/root/contents', {
    method: 'GET',
    token,
  });
}

export function getDirectoryContents(token: string, directoryId: string): Promise<DirectoryContents> {
  return apiRequest<DirectoryContents>(`/directories/${directoryId}/contents`, {
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

export function createDirectory(
  token: string,
  data: CreateDirectoryRequest,
): Promise<Directory> {
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