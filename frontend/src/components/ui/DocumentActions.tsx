import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { History, Pencil } from 'lucide-react';
import {
  DocumentHistory,
  getDocumentHistory,
  getDocumentVersionURL,
  restoreDocumentVersion,
} from '../../api/documents';
import { ApiError } from '../../api/client';
import { formatDate, formatFileSize } from '../../utils/format';
import { Button } from './Button';
import { Modal } from './Modal';

interface DocumentActionsProps {
  id: string;
  token: string;
  onRestored: () => void;
}

export const DocumentActions: React.FC<DocumentActionsProps> = ({ id, token, onRestored }) => {
  const [history, setHistory] = useState<DocumentHistory>();
  const [opened, setOpened] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<number>();
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const result = await getDocumentHistory(token, id, signal);
        if (!signal?.aborted) setHistory(result);
      } catch (reason) {
        if (!signal?.aborted) {
          setError(reason instanceof ApiError ? reason.message : 'Не удалось загрузить историю');
        }
      }
    },
    [id, token],
  );

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    if (!opened) return;
    const controller = new AbortController();
    void refresh(controller.signal);
    const timer = window.setInterval(() => void refresh(controller.signal), 5000);
    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, [opened, refresh]);

  function close() {
    setOpened(false);
    setError('');
    setSelected(undefined);
  }

  async function download(number: number) {
    setError('');
    try {
      const { url } = await getDocumentVersionURL(token, id, number);
      window.location.assign(url);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось скачать версию');
    }
  }

  async function restore(number: number) {
    setError('');
    setBusy(true);
    try {
      await restoreDocumentVersion(token, id, number);
      setSelected(undefined);
      await refresh();
      onRestored();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось восстановить версию');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {history?.can_edit && (
        <Link
          to={`/files/${id}/edit`}
          className="inline-flex items-center justify-center gap-2 rounded-theme bg-brand px-3 py-2 text-sm font-medium text-theme-on-brand hover:bg-brand-hover"
        >
          <Pencil size={16} aria-hidden="true" />
          Редактировать
        </Link>
      )}
      {(history?.can_edit || !!history?.versions.length || history?.save_pending) && (
        <Button
          type="button"
          variant="secondary"
          onClick={() => setOpened(true)}
          className="inline-flex items-center gap-2 border border-theme"
        >
          <History size={16} aria-hidden="true" />
          История версий
        </Button>
      )}
      <Modal native isOpen={opened} onClose={close} title="История версий" maxWidth="lg">
        {history?.save_pending && (
          <p role="status" className="mb-3 text-sm text-theme-secondary">
            Сохраняем изменения. История обновится после сохранения.
          </p>
        )}
        {!history?.versions.length && (
          <p className="text-sm text-theme-secondary">
            Здесь появятся версии после первого сохранения.
          </p>
        )}
        {!!history?.versions.length && (
          <ul className="divide-y divide-theme">
            {history.versions.map((version, index) => (
              <li key={version.number} className="space-y-2 py-3 first:pt-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-theme-primary">
                      Версия {version.number}
                      {index === 0 && ' · текущая'}
                    </p>
                    <p className="break-words text-sm text-theme-secondary">
                      {formatDate(version.created_at)} · {formatFileSize(version.size)}
                      {!!version.contributors.length && ` · ${version.contributors.join(', ')}`}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    aria-label={`Скачать версию ${version.number}`}
                    onClick={() => void download(version.number)}
                  >
                    Скачать
                  </Button>
                </div>
                {history.can_restore && index > 0 && selected !== version.number && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => setSelected(version.number)}
                  >
                    Восстановить
                  </Button>
                )}
                {selected === version.number && (
                  <div className="rounded-theme border border-theme p-3">
                    <p className="mb-2 text-sm text-theme-secondary">
                      Версия {version.number} станет текущей. Текущая версия сохранится в истории.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() => void restore(version.number)}
                    >
                      {busy ? 'Восстанавливаем…' : 'Подтвердить восстановление'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => setSelected(undefined)}
                    >
                      Отмена
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
      </Modal>
    </>
  );
};
