import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { getDirectoryById } from '../../api/directories';
import { getFileMetadata } from '../../api/files';
import { useAuthStore } from '../../store/authStore';
import { formatFileSize } from '../../utils/format';
import { Button } from './Button';
import { Modal } from './Modal';

export interface PropertiesTarget {
  kind: 'file' | 'directory';
  id: string;
}

const OpenProperties = createContext<(target: PropertiesTarget) => void>(() => {});
const dateTime = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short' });
const byteCount = new Intl.NumberFormat('ru-RU');

export function ItemPropertiesProvider({ children }: { children: React.ReactNode }) {
  const { key } = useLocation();
  const token = useAuthStore((state) => state.accessToken);
  const ownerID = useAuthStore((state) => state.user?.id);
  const [selection, setSelection] = useState<{ target: PropertiesTarget; route: string } | null>(
    null,
  );
  const target = selection?.route === key ? selection.target : null;
  const open = useCallback(
    (target: PropertiesTarget) => setSelection({ target, route: key }),
    [key],
  );

  useEffect(() => {
    setSelection((previous) => (previous?.route === key ? previous : null));
  }, [key]);

  return (
    <OpenProperties.Provider value={open}>
      {children}
      {target && token && (
        <Modal native isOpen title="Свойства" onClose={() => setSelection(null)}>
          <PropertiesContent
            key={`${ownerID}:${target.kind}:${target.id}`}
            target={target}
            token={token}
            userID={ownerID}
          />
        </Modal>
      )}
    </OpenProperties.Provider>
  );
}

export function ItemPropertiesAction({
  target,
  focusTarget,
  onSelect,
  separated = false,
}: {
  target: PropertiesTarget;
  focusTarget: () => HTMLElement | null;
  onSelect: () => void;
  separated?: boolean;
}) {
  const open = useContext(OpenProperties);
  return (
    <>
      {separated && <div role="separator" className="my-1 border-t border-theme" />}
      <button
        type="button"
        role="menuitem"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          focusTarget()?.focus({ preventScroll: true });
          onSelect();
          open(target);
        }}
        className="group flex w-full items-center gap-3 px-4 py-3.5 text-base text-theme-secondary transition-colors hover:bg-theme-hover sm:px-3 sm:py-2 sm:text-sm"
      >
        <Info size={18} className="transition-colors group-hover:text-brand" />
        Свойства
      </button>
    </>
  );
}

type PropertiesState =
  | { status: 'loading' }
  | { status: 'ready'; rows: { label: string; value: React.ReactNode }[] }
  | { status: 'error'; message: string; retryable: boolean };

function readableSize(bytes: number) {
  return bytes < 1024
    ? `${byteCount.format(bytes)} Б`
    : `${formatFileSize(bytes)} (${byteCount.format(bytes)} Б)`;
}

function displayDate(value: string) {
  const date = new Date(value);
  return <time dateTime={value}>{dateTime.format(date)}</time>;
}

function PropertiesContent({
  target,
  token,
  userID,
}: {
  target: PropertiesTarget;
  token: string;
  userID?: string;
}) {
  const { id, kind } = target;
  const [state, setState] = useState<PropertiesState>({ status: 'loading' });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    async function load() {
      try {
        const entry =
          kind === 'file'
            ? await getFileMetadata(token, id, signal)
            : await getDirectoryById(token, id, signal);
        const rows =
          'filename' in entry
            ? [
                { label: 'Имя', value: entry.filename },
                { label: 'Размер', value: readableSize(entry.size) },
                ...(entry.extension ? [{ label: 'Расширение', value: entry.extension }] : []),
                { label: 'MIME-тип', value: entry.mime_type },
              ]
            : [
                { label: 'Имя', value: entry.name },
                {
                  label: 'Тип',
                  value: entry.is_music_root
                    ? 'Системная аудиопапка'
                    : entry.purpose === 'audio'
                      ? 'Плейлист-папка'
                      : 'Папка',
                },
                {
                  label: 'Размер',
                  value:
                    typeof entry.size_bytes === 'number'
                      ? readableSize(entry.size_bytes)
                      : 'Недоступен',
                },
              ];
        if (signal.aborted) return;
        setState({
          status: 'ready',
          rows: [
            ...rows,
            {
              label: 'Владелец',
              value: entry.owner_id === userID ? 'Вы' : entry.owner_username || 'Недоступен',
            },
            { label: 'Создано', value: displayDate(entry.created_at) },
            { label: 'Изменено', value: displayDate(entry.updated_at) },
          ],
        });
      } catch (error) {
        if (signal.aborted) return;
        const status = error instanceof ApiError ? error.status : undefined;
        const message =
          status === 403
            ? 'У вас нет доступа к этому объекту.'
            : status === 404
              ? 'Объект больше недоступен.'
              : 'Не удалось загрузить свойства.';
        setState({ status: 'error', message, retryable: status !== 403 && status !== 404 });
      }
    }
    void load();
    return () => controller.abort();
  }, [id, kind, retry, token, userID]);

  if (state.status === 'loading') {
    return (
      <p role="status" className="text-sm text-theme-secondary">
        Загружаем свойства…
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-theme-primary">
          {state.message}
        </p>
        {state.retryable && (
          <Button
            variant="secondary"
            onClick={(event) => {
              event.currentTarget.closest('dialog')?.querySelector('button')?.focus();
              setState({ status: 'loading' });
              setRetry((attempt) => attempt + 1);
            }}
          >
            Повторить
          </Button>
        )}
      </div>
    );
  }
  return (
    <dl className="text-sm">
      {state.rows.map(({ label, value }) => (
        <div
          key={label}
          className="grid gap-1 border-t border-theme py-2.5 first:border-0 first:pt-0 last:pb-0 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-3"
        >
          <dt className="text-theme-secondary">{label}</dt>
          <dd className="min-w-0 break-words font-medium text-theme-primary">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
