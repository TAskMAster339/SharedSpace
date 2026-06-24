import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { getSharedWithMeStats, SharedDirectoryWithStats } from '../api/sharing';

export const useSharedDirectories = () => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const [sharedDirectories, setSharedDirectories] = useState<SharedDirectoryWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sharedDirectoryIds, setSharedDirectoryIds] = useState<Set<string>>(new Set());

  const loadSharedDirectories = useCallback(async () => {
    if (!accessToken) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const directories = await getSharedWithMeStats(accessToken);
      setSharedDirectories(directories);
      setSharedDirectoryIds(new Set(directories.map((d) => d.directory_id)));
    } catch (error) {
      console.error('Failed to load shared directories:', error);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    loadSharedDirectories();
  }, [loadSharedDirectories]);

  const isShared = useCallback(
    (directoryId: string) => {
      return sharedDirectoryIds.has(directoryId);
    },
    [sharedDirectoryIds],
  );

  return {
    sharedDirectories,
    sharedDirectoryIds,
    isLoading,
    isShared,
    loadSharedDirectories,
  };
};
