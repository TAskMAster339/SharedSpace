import { useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { useSharedDirectoriesStore } from '../store/sharedDirectoriesStore';

export type { SharedDirectoryWithStats } from '../api/sharing';

export const useSharedDirectories = () => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const sharedDirectories = useSharedDirectoriesStore((state) => state.sharedDirectories);
  const sharedDirectoryIds = useSharedDirectoriesStore((state) => state.sharedDirectoryIds);
  const isLoading = useSharedDirectoriesStore((state) => state.isLoading);
  const load = useSharedDirectoriesStore((state) => state.loadSharedDirectories);

  useEffect(() => {
    load(accessToken);
  }, [accessToken, load]);

  const isShared = useCallback(
    (directoryId: string) => sharedDirectoryIds.has(directoryId),
    [sharedDirectoryIds],
  );

  const getUserRole = useCallback(
    (directoryId: string): string | null => {
      const dir = sharedDirectories.find((d) => d.directory_id === directoryId);
      return dir?.role || null;
    },
    [sharedDirectories],
  );

  const canUpload = useCallback(
    (directoryId: string): boolean => {
      const role = getUserRole(directoryId);
      if (role === null) return true;
      return role !== 'viewer';
    },
    [getUserRole],
  );

  const loadSharedDirectories = useCallback(() => load(accessToken), [accessToken, load]);

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
