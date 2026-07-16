import { apiRequest } from './client';

export interface LinkItem {
  id: string;
  item_type: 'file' | 'directory';
  filename: string;
  extension: string;
  mime_type: string;
  size: number;
  directory_id: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  link_token: string;
  link_id: string;
  is_active: boolean;
  link_created_at: string;
}

interface LinksListResponse {
  items: LinkItem[];
  next_cursor?: string;
}

export interface LinksPaginationParams {
  limit?: number;
  cursor?: string;
}

function buildLinksQuery(params?: LinksPaginationParams): string {
  if (!params) return '';
  const parts: string[] = [];
  if (params.limit !== undefined) parts.push(`limit=${params.limit}`);
  if (params.cursor) parts.push(`cursor=${encodeURIComponent(params.cursor)}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export function deleteAllLinks(accessToken: string): Promise<void> {
  return apiRequest<void>('/links', {
    method: 'DELETE',
    token: accessToken,
  });
}

export function getLinks(
  accessToken: string,
  pagination?: LinksPaginationParams,
): Promise<LinksListResponse> {
  const query = buildLinksQuery(pagination);
  return apiRequest<LinksListResponse>(`/links${query}`, {
    method: 'GET',
    token: accessToken,
  });
}
