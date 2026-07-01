import { useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { useSharedDirectoriesStore } from '../store/sharedDirectoriesStore';

export type { SharedDirectoryWithStats } from '../api/sharing';

export const useSharedDirectories = () => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const sharedDirectories = useSharedDirectoriesStore((state) => state.sharedDirectories);
  const sharedDirectoryIds = useSharedDirectoriesStore((state) => state.sharedDirectoryIds);
  const isLoading = useSharedDirectoriesStore((state) => state.isLoading);
  const loadedToken = useSharedDirectoriesStore((state) => state.loadedToken);
  const load = useSharedDirectoriesStore((state) => state.loadSharedDirectories);
  const hasTriedLoad = useRef(false);

  const tryLoad = useCallback(() => {
    if (!accessToken) return;
    if (hasTriedLoad.current && loadedToken === accessToken) return;
    hasTriedLoad.current = true;
    load(accessToken);
  }, [accessToken, loadedToken, load]);

  const isShared = useCallback(
    (directoryId: string): boolean => {
      if (loadedToken !== accessToken) {
        tryLoad();
      }
      return sharedDirectoryIds.has(directoryId);
    },
    [sharedDirectoryIds, loadedToken, accessToken, tryLoad],
  );

  const getUserRole = useCallback(
    (directoryId: string): string | null => {
      if (loadedToken !== accessToken) {
        tryLoad();
      }
      const dir = sharedDirectories.find((d) => d.directory_id === directoryId);
      return dir?.role || null;
    },
    [sharedDirectories, loadedToken, accessToken, tryLoad],
  );

  const canUpload = useCallback(
    (directoryId: string): boolean => {
      const role = getUserRole(directoryId);
      if (role === null) return true;
      return role !== 'viewer';
    },
    [getUserRole],
  );

  const loadSharedDirectories = useCallback(() => {
    hasTriedLoad.current = true;
    return load(accessToken);
  }, [accessToken, load]);

  return {
    sharedDirectories,
    sharedDirectoryIds,
    isLoading,
    isShared,
    getUserRole,
    canUpload,
    loadSharedDirectories,
  };
};
