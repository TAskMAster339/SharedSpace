import { create } from 'zustand';
import { getSharedWithMeStats, SharedDirectoryWithStats } from '../api/sharing';

interface SharedDirectoriesState {
  sharedDirectories: SharedDirectoryWithStats[];
  sharedDirectoryIds: Set<string>;
  isLoading: boolean;
  loadedToken: string | null;
  loadSharedDirectories: (accessToken: string | null) => Promise<void>;
  reset: () => void;
}

let inFlight: Promise<void> | null = null;

export const useSharedDirectoriesStore = create<SharedDirectoriesState>((set, get) => ({
  sharedDirectories: [],
  sharedDirectoryIds: new Set(),
  isLoading: true,
  loadedToken: null,

  loadSharedDirectories: async (accessToken) => {
    if (!accessToken) {
      set({ isLoading: false });
      return;
    }

    if (get().loadedToken === accessToken && !get().isLoading) return;

    if (inFlight) return inFlight;

    set({ isLoading: true });

    inFlight = getSharedWithMeStats(accessToken)
      .then((directories) => {
        set({
          sharedDirectories: directories,
          sharedDirectoryIds: new Set(directories.map((d) => d.directory_id)),
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

  reset: () => {
    inFlight = null;
    set({
      sharedDirectories: [],
      sharedDirectoryIds: new Set(),
      isLoading: true,
      loadedToken: null,
    });
  },
}));
