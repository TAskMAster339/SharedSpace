import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { getFavorites, addFavorite, removeFavorite } from '../api/favorites';

export const useFavorites = () => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // Актуальное значение для чтения внутри стабильных колбэков (без устаревших замыканий)
  const favoritesRef = useRef(favorites);
  favoritesRef.current = favorites;

  // Загружаем избранное
  useEffect(() => {
    if (!accessToken) return;

    getFavorites(accessToken)
      .then((data) => {
        setFavorites(new Set(data.favorites.map((f) => f.id)));
      })
      .catch(() => {});
  }, [accessToken]);

  // Проверка, избранный ли файл (зависит от favorites, чтобы мемоизации пересчитывались)
  const isFavorite = useCallback(
    (fileId: string) => {
      return favorites.has(fileId);
    },
    [favorites],
  );

  // Переключение избранного.
  // Возвращает true, если файл был добавлен в избранное, и false, если убран.
  // Колбэк стабилен и читает актуальное состояние через ref, поэтому повторный
  // вызов (например, при отмене действия) корректно переключает обратно.
  const toggleFavorite = useCallback(
    async (fileId: string): Promise<boolean> => {
      if (!accessToken) return false;

      const makeFavorite = !favoritesRef.current.has(fileId);

      // Оптимистичное обновление
      setFavorites((prev) => {
        const next = new Set(prev);
        makeFavorite ? next.add(fileId) : next.delete(fileId);
        return next;
      });

      try {
        if (makeFavorite) {
          await addFavorite(accessToken, fileId);
        } else {
          await removeFavorite(accessToken, fileId);
        }
      } catch (err) {
        // Откат при ошибке
        setFavorites((prev) => {
          const next = new Set(prev);
          makeFavorite ? next.delete(fileId) : next.add(fileId);
          return next;
        });
        throw err;
      }

      return makeFavorite;
    },
    [accessToken],
  );

  return { isFavorite, toggleFavorite };
};
