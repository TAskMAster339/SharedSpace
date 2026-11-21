import React, { useEffect, useState } from 'react';
import { Files, Folder, Trash2, Users } from 'lucide-react';
import { Link } from './Link';
import { getStorageUsage, StorageUsage } from '../../api/users';
import { useAuthStore } from '../../store/authStore';
import { useStorageUsageStore } from '../../store/storageUsageStore';
import { cn } from '../../utils/cn';
import { formatFileSize } from '../../utils/format';
import { Modal } from './Modal';
import { Button } from './Button';

export const StorageUsageModal: React.FC = () => {
  const { isOpen, close } = useStorageUsageStore();
  const token = useAuthStore((s) => s.accessToken);
  const [data, setData] = useState<StorageUsage | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!isOpen || !token) return;
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getStorageUsage(token, 'size', controller.signal)
      .then((result) => {
        if (!active) return;
        setData(result);
      })
      .catch(() => {
        if (active) setError('Не удалось загрузить использование хранилища. Попробуйте ещё раз.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [isOpen, token, retryKey]);

  const retry = () => setRetryKey((key) => key + 1);
  const sharedBytes = data?.shared_files_bytes ?? data?.other_files_bytes ?? 0;
  const personalBytes =
    data?.personal_files_bytes ??
    Math.max(0, (data?.used_bytes ?? 0) - (data?.trash_bytes ?? 0) - sharedBytes);
  const otherBytes = Math.max(
    0,
    (data?.used_bytes ?? 0) - (data?.trash_bytes ?? 0) - personalBytes - sharedBytes,
  );
  const rows = data
    ? [
        {
          name: 'Личное хранилище',
          bytes: personalBytes,
          to: `/directories/${data.root_id ?? 'personal'}`,
          icon: Folder,
        },
        {
          name: 'Общие директории',
          bytes: sharedBytes,
          to: '/directories',
          icon: Users,
        },
        { name: 'Корзина', bytes: data.trash_bytes, to: '/trash', icon: Trash2 },
        ...(otherBytes > 0
          ? [{ name: 'Другие расположения', bytes: otherBytes, to: null, icon: Files }]
          : []),
      ]
    : [];
  const percentage =
    data && data.quota_bytes > 0
      ? Math.min(100, Math.max(0, (data.used_bytes / data.quota_bytes) * 100))
      : 0;

  return (
    <Modal isOpen={isOpen} onClose={close} title="Использование хранилища">
      {error ? (
        <div role="alert" className="space-y-2 text-sm text-theme-secondary">
          <p>{error}</p>
          <Button variant="secondary" onClick={retry}>
            Повторить
          </Button>
        </div>
      ) : loading || !data ? (
        <p role="status" className="py-8 text-center text-sm text-theme-secondary">
          Загружаем использование хранилища…
        </p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-theme-primary">
              Занято {formatFileSize(data.used_bytes)} из {formatFileSize(data.quota_bytes)}
            </p>
            <div
              role="progressbar"
              aria-label="Занятое хранилище"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percentage}
              className="h-2 overflow-hidden rounded-theme bg-theme-border"
            >
              <div className="h-full bg-brand" style={{ width: `${percentage}%` }} />
            </div>
          </div>
          <ul aria-label="Содержимое хранилища">
            {rows.map(({ name, bytes, to, icon: Icon }) => (
              <li
                key={name}
                className={cn(
                  'storage-usage-row flex items-center gap-3 border-t border-theme px-2 py-3',
                  to === '/trash' && 'storage-usage-row-trash',
                )}
              >
                <Icon
                  aria-hidden="true"
                  size={18}
                  className="storage-usage-icon shrink-0 text-theme-secondary transition-colors"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-theme-primary">{name}</p>
                  <p className="text-xs tabular-nums text-theme-secondary">
                    {formatFileSize(bytes)}
                  </p>
                </div>
                {to && (
                  <Link
                    to={to}
                    onClick={close}
                    variant="secondary"
                    aria-label={`Открыть «${name}»`}
                    className="shrink-0 rounded-theme border border-theme bg-theme-tertiary px-3 py-2 text-sm font-medium hover:bg-theme-hover"
                  >
                    Открыть
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
};
