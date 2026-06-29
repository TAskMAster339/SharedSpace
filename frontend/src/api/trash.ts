import { apiRequest } from './client';

export interface TrashItem {
  id: string;
  name: string;
  type: 'file' | 'directory';
  owner_id: string;
  parent_id?: string | null;
  size: number;
  deleted_at: string;
}

export interface TrashListResponse {
  items: TrashItem[];
  total_size: number;
  count: number;
  next_files_cursor?: string;
  next_dirs_cursor?: string;
}

export interface TrashPaginationParams {
  files_limit?: number;
  files_cursor?: string;
  dirs_limit?: number;
  dirs_cursor?: string;
}

function buildTrashQuery(params?: TrashPaginationParams): string {
  if (!params) return '';
  const parts: string[] = [];
  if (params.files_limit !== undefined) parts.push(`files_limit=${params.files_limit}`);
  if (params.files_cursor) parts.push(`files_cursor=${encodeURIComponent(params.files_cursor)}`);
  if (params.dirs_limit !== undefined) parts.push(`dirs_limit=${params.dirs_limit}`);
  if (params.dirs_cursor) parts.push(`dirs_cursor=${encodeURIComponent(params.dirs_cursor)}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export function getTrashList(accessToken: string, pagination?: TrashPaginationParams): Promise<TrashListResponse> {
  const query = buildTrashQuery(pagination);
  return apiRequest<TrashListResponse>(`/trash${query}`, {
    method: 'GET',
    token: accessToken,
  });
}

export function clearTrash(accessToken: string, itemIds: string[]): Promise<void> {
  return apiRequest<void>('/trash', {
    method: 'DELETE',
    token: accessToken,
    body: JSON.stringify({ item_ids: itemIds }),
  });
}
