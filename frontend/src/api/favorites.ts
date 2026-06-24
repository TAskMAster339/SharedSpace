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
}

interface FavoritesListResponse {
  favorites: FavoriteFile[];
}

export function getFavorites(accessToken: string): Promise<FavoritesListResponse> {
  return apiRequest<FavoritesListResponse>('/files/favorites', {
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
