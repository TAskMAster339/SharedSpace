import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { getFavorites, addFavorite, removeFavorite } from '../api/favorites';

export const useFavorites = () => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // Загружаем избранное
  useEffect(() => {
    if (!accessToken) return;

    getFavorites(accessToken)
      .then(data => {
        setFavorites(new Set(data.favorites.map(f => f.id)));
      })
      .catch(() => {});
  }, [accessToken]);

  // Проверка, избранный ли файл
  const isFavorite = useCallback((fileId: string) => {
    return favorites.has(fileId);
  }, [favorites]);

  // Переключение избранного
  const toggleFavorite = useCallback(async (fileId: string) => {
    if (!accessToken) return;

    const isFav = favorites.has(fileId);
    
    // Оптимистичное обновление
    setFavorites(prev => {
      const next = new Set(prev);
      isFav ? next.delete(fileId) : next.add(fileId);
      return next;
    });

    try {
      if (isFav) {
        await removeFavorite(accessToken, fileId);
      } else {
        await addFavorite(accessToken, fileId);
      }
    } catch {
      // Откат при ошибке
      setFavorites(prev => {
        const next = new Set(prev);
        isFav ? next.add(fileId) : next.delete(fileId);
        return next;
      });
    }
  }, [accessToken, favorites]);

  return { isFavorite, toggleFavorite };
};
