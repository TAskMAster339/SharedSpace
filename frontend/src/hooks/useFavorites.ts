import { useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { useFavoritesStore } from '../store/favoritesStore';

export const useFavorites = () => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const favoriteIds = useFavoritesStore((state) => state.favoriteIds);
  const loadFavorites = useFavoritesStore((state) => state.loadFavorites);
  const toggle = useFavoritesStore((state) => state.toggleFavorite);

  useEffect(() => {
    if (accessToken) loadFavorites(accessToken);
  }, [accessToken, loadFavorites]);

  const isFavorite = useCallback((fileId: string) => favoriteIds.has(fileId), [favoriteIds]);

  const toggleFavorite = useCallback(
    (fileId: string): Promise<boolean> => toggle(accessToken as string, fileId),
    [accessToken, toggle],
  );

  return { isFavorite, toggleFavorite };
};
