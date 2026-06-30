import { useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { useFavoritesStore } from '../store/favoritesStore';

export const useFavorites = () => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const favoriteIds = useFavoritesStore((state) => state.favoriteIds);
  const favorites = useFavoritesStore((state) => state.favorites);
  const isLoading = useFavoritesStore((state) => state.isLoading);
  const loadedToken = useFavoritesStore((state) => state.loadedToken);
  const loadFavorites = useFavoritesStore((state) => state.loadFavorites);
  const toggle = useFavoritesStore((state) => state.toggleFavorite);

  const isFavorite = useCallback((fileId: string) => favoriteIds.has(fileId), [favoriteIds]);

  const toggleFavorite = useCallback(
    (fileId: string): Promise<boolean> => toggle(accessToken as string, fileId),
    [accessToken, toggle],
  );

  return { isFavorite, toggleFavorite, favorites, loadFavorites, isLoading, loadedToken };
};
