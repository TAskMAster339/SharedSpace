import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { getSharedWithMeStats } from '../api/sharing';

export interface SharedDirectoryWithStats {
  directory_id: string;
  name: string;
  role: string; // 'viewer' | 'editor' | 'admin'
  member_count: number;
  file_count: number;
  member_usernames: string[];
}

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
      // Если директория не общая - возвращаем true (пользователь владелец)
      if (role === null) return true;
      // Если общая - проверяем роль (viewer не может загружать)
      return role !== 'viewer';
    },
    [getUserRole],
  );

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
