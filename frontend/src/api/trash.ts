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
}

export function getTrashList(accessToken: string): Promise<TrashListResponse> {
  return apiRequest<TrashListResponse>('/trash', {
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
