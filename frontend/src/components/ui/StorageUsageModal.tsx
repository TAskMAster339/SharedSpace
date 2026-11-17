import React, { useEffect, useState } from 'react';
import { Folder, HardDrive, FileText, Trash2, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getStorageUsage, StorageUsage } from '../../api/users';
import { useAuthStore } from '../../store/authStore';
import { useStorageUsageStore } from '../../store/storageUsageStore';
import { formatFileSize } from '../../utils/format';
import { Modal } from './Modal';
import { Button } from './Button';

export const StorageUsageModal: React.FC = () => {
  const { isOpen, close } = useStorageUsageStore();
  const token = useAuthStore((s) => s.accessToken);
  const [sort, setSort] = useState<'size' | 'name'>('size');
  const [data, setData] = useState<StorageUsage | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!isOpen || !token) return;
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getStorageUsage(token, sort, controller.signal)
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
  }, [isOpen, token, sort, retryKey]);

  const retry = () => setRetryKey((key) => key + 1);
  const rows = data
    ? [
        ...data.folders.map((folder) => ({
          ...folder,
          to: `/directories/${folder.id}`,
          icon: Folder,
        })),
        ...(data.root_files_bytes > 0 && data.root_id
          ? [
              {
                id: 'root-files',
                name: 'Файлы в корне',
                size_bytes: data.root_files_bytes,
                to: `/directories/${data.root_id}`,
                icon: FileText,
              },
            ]
          : []),
        ...(data.other_files_bytes > 0
          ? [
              {
                id: 'other-files',
                name: 'Ваши файлы в других папках',
                size_bytes: data.other_files_bytes,
                to: '/directories',
                icon: Users,
              },
            ]
          : []),
        { id: 'trash', name: 'Корзина', size_bytes: data.trash_bytes, to: '/trash', icon: Trash2 },
      ].sort((a, b) => {
        const byName = a.name.localeCompare(b.name, 'ru', { numeric: true, sensitivity: 'base' });
        return (
          (sort === 'size' ? b.size_bytes - a.size_bytes : 0) || byName || a.id.localeCompare(b.id)
        );
      })
    : [];
  const percentage =
    data && data.quota_bytes > 0
      ? Math.min(100, Math.max(0, (data.used_bytes / data.quota_bytes) * 100))
      : 0;

  return (
    <Modal isOpen={isOpen} onClose={close} title="Использование хранилища" maxWidth="xl">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-sm text-theme-secondary">
            <HardDrive size={18} className="text-brand" />
            Ваше хранилище
          </span>
          <div className="flex items-center gap-2">
            <select
              aria-label="Сортировка содержимого"
              value={sort}
              onChange={(e) => setSort(e.target.value as 'size' | 'name')}
              className="bg-theme-tertiary text-theme-secondary border border-theme rounded-theme-sm px-2 py-1.5 text-xs"
            >
              <option value="size">По объёму</option>
              <option value="name">По имени</option>
            </select>
          </div>
        </div>
        {error ? (
          <div role="alert" className="space-y-2 text-sm text-theme-secondary">
            <p>{error}</p>
            <Button variant="secondary" onClick={retry}>
              Повторить
            </Button>
          </div>
        ) : loading && !data ? (
          <p role="status" className="py-8 text-sm text-center text-theme-muted">
            Загружаем использование хранилища…
          </p>
        ) : (
          data && (
            <>
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
                  className="h-2 bg-theme-border rounded-full overflow-hidden"
                >
                  <div
                    className="h-full bg-brand rounded-full"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <p className="text-xs leading-relaxed text-theme-muted">
                  Учитываются ваши файлы, включая вложенные папки, общие папки и корзину.
                </p>
              </div>
              <div role="list" aria-label="Содержимое хранилища" className="space-y-4">
                {rows.map((row) => {
                  const width =
                    data.used_bytes > 0
                      ? Math.min(100, (row.size_bytes / data.used_bytes) * 100)
                      : 0;
                  return (
                    <div role="listitem" key={row.id} className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <row.icon
                          size={17}
                          className={
                            row.id === 'trash' ? 'text-theme-muted shrink-0' : 'text-brand shrink-0'
                          }
                        />
                        <span
                          className="text-theme-primary flex-1 min-w-0 truncate"
                          title={row.name}
                        >
                          {row.name}
                        </span>
                        <span className="text-theme-secondary tabular-nums whitespace-nowrap text-xs">
                          {formatFileSize(row.size_bytes)}
                        </span>
                        <Link
                          to={row.to}
                          onClick={close}
                          aria-label={`Открыть «${row.name}»`}
                          className="text-xs text-brand px-1 py-1"
                        >
                          Открыть
                        </Link>
                      </div>
                      <div className="h-1.5 bg-theme-border rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${row.id === 'trash' ? 'bg-slate-400' : 'bg-brand'}`}
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {data.folder_count > data.folders.length && (
                <p className="text-xs text-theme-muted">
                  Показано {data.folders.length} из {data.folder_count} папок. Остальные доступны в
                  личном хранилище.
                </p>
              )}
            </>
          )
        )}
      </div>
    </Modal>
  );
};
