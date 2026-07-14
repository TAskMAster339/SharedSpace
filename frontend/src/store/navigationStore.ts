import { create } from 'zustand';

const MAX_HISTORY = 50;

interface NavigationState {
  past: string[];
  current: string | null;
  future: string[];
  push: (path: string) => void;
  back: () => string | null;
  forward: () => string | null;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  past: [],
  current: null,
  future: [],

  push: (path) => {
    const { current, past } = get();
    if (current === null) {
      set({ current: path, past: [], future: [] });
      return;
    }
    if (path === current) return;

    const newPast = [...past, current];
    if (newPast.length > MAX_HISTORY) newPast.shift();

    set({ past: newPast, current: path, future: [] });
  },

  back: () => {
    const { past, current, future } = get();
    if (past.length === 0 || !current) return null;

    const newPast = past.slice(0, -1);
    const newFuture = [current, ...future];

    set({ past: newPast, current: past[past.length - 1], future: newFuture });
    return past[past.length - 1];
  },

  forward: () => {
    const { past, current, future } = get();
    if (future.length === 0 || !current) return null;

    const newPast = [...past, current];
    const newFuture = future.slice(1);

    set({ past: newPast, current: future[0], future: newFuture });
    return future[0];
  },

  canGoBack: () => {
    const { past } = get();
    return past.length > 0;
  },

  canGoForward: () => {
    const { future } = get();
    return future.length > 0;
  },
}));
