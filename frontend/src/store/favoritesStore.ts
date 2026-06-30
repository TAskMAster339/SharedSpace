import { create } from 'zustand';
import { getFavorites, addFavorite, removeFavorite, FavoriteFile } from '../api/favorites';

interface FavoritesState {
  favoriteIds: Set<string>;
  favorites: FavoriteFile[];
  isLoading: boolean;
  loadedToken: string | null;
  loadFavorites: (accessToken: string, force?: boolean) => Promise<void>;
  toggleFavorite: (accessToken: string, fileId: string) => Promise<boolean>;
  reset: () => void;
}

let inFlight: Promise<void> | null = null;

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  favoriteIds: new Set(),
  favorites: [],
  isLoading: false,
  loadedToken: null,

  loadFavorites: async (accessToken, force) => {
    if (!accessToken) return;

    if (!force && get().loadedToken === accessToken && !get().isLoading) return;

    if (inFlight) return inFlight;

    set({ isLoading: true });

    inFlight = getFavorites(accessToken)
      .then((data) => {
        set({
          favoriteIds: new Set(data.favorites.map((f) => f.id)),
          favorites: data.favorites,
          loadedToken: accessToken,
        });
      })
      .catch(() => {})
      .finally(() => {
        set({ isLoading: false });
        inFlight = null;
      });

    return inFlight;
  },

  toggleFavorite: async (accessToken, fileId) => {
    if (!accessToken) return false;

    const makeFavorite = !get().favoriteIds.has(fileId);

    set((state) => {
      const next = new Set(state.favoriteIds);
      makeFavorite ? next.add(fileId) : next.delete(fileId);
      return { favoriteIds: next };
    });

    try {
      if (makeFavorite) {
        await addFavorite(accessToken, fileId);
      } else {
        await removeFavorite(accessToken, fileId);
      }
    } catch (err) {
      set((state) => {
        const next = new Set(state.favoriteIds);
        makeFavorite ? next.delete(fileId) : next.add(fileId);
        return { favoriteIds: next };
      });
      throw err;
    }

    return makeFavorite;
  },

  reset: () => {
    inFlight = null;
    set({ favoriteIds: new Set(), favorites: [], isLoading: false, loadedToken: null });
  },
}));
