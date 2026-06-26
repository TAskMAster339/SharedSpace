import { useEffect, useMemo } from 'react';
import { LayoutDashboard, Folder, Users, Star, Mail, Trash2 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useDirectoryStore } from '../store/directoryStore';

const BYTES_TO_GB = 1024 * 1024 * 1024;

export const useSidebarMenu = () => {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const { personalStorageId, isLoading, fetchPersonalStorageId } = useDirectoryStore();

  // Загружаем ID только если ещё не загружено и есть токен
  useEffect(() => {
    if (isAuthenticated && accessToken && isLoading) {
      fetchPersonalStorageId(accessToken);
    }
  }, [isAuthenticated, accessToken, isLoading, fetchPersonalStorageId]);

  const storageUsed = useMemo(() => (user ? user.storage_used / BYTES_TO_GB : 0), [user]);
  const storageQuota = useMemo(() => (user ? user.storage_quota / BYTES_TO_GB : 0), [user]);

  const menuItems = useMemo(
    () => [
      { label: 'Дашборд', icon: LayoutDashboard, path: '/dashboard' },
      { label: 'Личное хранилище', icon: Folder, path: `/directories/${personalStorageId}` },
      { label: 'Общие директории', icon: Users, path: '/directories' },
      { label: 'Избранное', icon: Star, path: '/favorites' },
      { label: 'Приглашения', icon: Mail, path: '/invitations' },
      { label: 'Корзина', icon: Trash2, path: '/trash' },
    ],
    [personalStorageId],
  );

  return { menuItems, storageUsed, storageQuota, isLoading };
};
