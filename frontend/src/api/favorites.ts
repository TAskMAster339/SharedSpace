import { apiRequest } from './client';

export interface FavoriteFile {
  id: string;
  filename: string;
  extension: string;
  mime_type: string;
  size: number;
  directory_id: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  favorited_at: string;
  has_share_links?: boolean;
}

interface FavoritesListResponse {
  favorites: FavoriteFile[];
  next_cursor?: string;
}

export interface FavoritesPaginationParams {
  limit?: number;
  cursor?: string;
}

function buildFavoritesQuery(params?: FavoritesPaginationParams): string {
  if (!params) return '';
  const parts: string[] = [];
  if (params.limit !== undefined) parts.push(`limit=${params.limit}`);
  if (params.cursor) parts.push(`cursor=${encodeURIComponent(params.cursor)}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export function getFavorites(
  accessToken: string,
  pagination?: FavoritesPaginationParams,
): Promise<FavoritesListResponse> {
  const query = buildFavoritesQuery(pagination);
  return apiRequest<FavoritesListResponse>(`/files/favorites${query}`, {
    method: 'GET',
    token: accessToken,
  });
}

export function addFavorite(accessToken: string, fileId: string): Promise<void> {
  return apiRequest<void>(`/files/${fileId}/favorite`, {
    method: 'POST',
    token: accessToken,
  });
}

export function removeFavorite(accessToken: string, fileId: string): Promise<void> {
  return apiRequest<void>(`/files/${fileId}/favorite`, {
    method: 'DELETE',
    token: accessToken,
  });
}
