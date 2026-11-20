import React, { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { OfficeMode, OfficeTheme, startOfficeSession } from '../../api/documents';
import { Button } from './Button';

interface OfficeEditor {
  destroyEditor(): void;
  requestClose(): void;
}

type OfficeAPI = {
  DocEditor: new (elementId: string, config: Record<string, unknown>) => OfficeEditor;
};

let officeScript: { url: string; load: Promise<OfficeAPI> } | undefined;

function loadOfficeScript(url: string) {
  const source = new URL(url);
  if (
    !['http:', 'https:'].includes(source.protocol) ||
    (window.location.protocol === 'https:' && source.protocol !== 'https:') ||
    source.pathname !== '/web-apps/apps/api/documents/api.js' ||
    source.username ||
    source.password ||
    source.search ||
    source.hash
  ) {
    return Promise.reject(new Error('Некорректный адрес редактора'));
  }
  if (officeScript?.url === source.href) return officeScript.load;
  if (officeScript) return Promise.reject(new Error('Обновите страницу, чтобы открыть редактор'));

  const load = new Promise<OfficeAPI>((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = window.setTimeout(() => fail(), 15000);
    const fail = () => {
      window.clearTimeout(timeout);
      script.remove();
      reject(new Error('Не удалось загрузить редактор'));
    };
    script.src = source.href;
    script.referrerPolicy = 'strict-origin-when-cross-origin';
    script.onerror = fail;
    script.onload = () => {
      const api = (window as Window & { DocsAPI?: OfficeAPI }).DocsAPI;
      if (!api?.DocEditor) {
        fail();
        return;
      }
      window.clearTimeout(timeout);
      resolve(api);
    };
    document.head.append(script);
  }).catch((error) => {
    officeScript = undefined;
    throw error;
  });
  officeScript = { url: source.href, load };
  return load;
}

export interface OfficeFrameHandle {
  requestClose(afterSave?: boolean): boolean;
  cancelDeferredClose(): boolean;
}

interface OfficeFrameProps {
  fileId: string;
  token: string;
  mode: OfficeMode;
  theme: OfficeTheme;
  waitForSave?: boolean;
  onTitle?: (title: string) => void;
  onChanged?: () => void;
  onRequestClose?: () => void;
}

export const OfficeFrame = forwardRef<OfficeFrameHandle, OfficeFrameProps>(function OfficeFrame(
  { fileId, token, mode, theme, waitForSave, onTitle, onChanged, onRequestClose },
  ref,
) {
  const mount = useRef<HTMLDivElement>(null);
  const editor = useRef<OfficeEditor>();
  const unsaved = useRef(false);
  const closeAfterSave = useRef(false);
  const callbacks = useRef({ onTitle, onChanged, onRequestClose, token });
  const anchorId = useId();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<'loading' | 'saving' | 'ready'>('loading');
  const [error, setError] = useState('');
  const editing = mode === 'edit';

  useEffect(() => {
    callbacks.current = { onTitle, onChanged, onRequestClose, token };
  }, [onTitle, onChanged, onRequestClose, token]);

  useImperativeHandle(
    ref,
    () => ({
      requestClose(afterSave = false) {
        if (!editor.current || state !== 'ready') return false;
        closeAfterSave.current = afterSave && unsaved.current;
        if (!closeAfterSave.current) editor.current.requestClose();
        return true;
      },
      cancelDeferredClose() {
        if (!closeAfterSave.current) return false;
        closeAfterSave.current = false;
        return true;
      },
    }),
    [state],
  );

  useEffect(() => {
    if (!mount.current) return;
    const controller = new AbortController();
    const active = () => !controller.signal.aborted;
    const container = mount.current;
    const anchor = document.createElement('div');
    anchor.id = anchorId;
    container.replaceChildren(anchor);
    let loadTimeout: number | undefined;
    let retryTimeout: number | undefined;
    unsaved.current = false;
    closeAfterSave.current = false;
    setState('loading');
    setError('');

    const open = async (retries: number) => {
      try {
        const session = await startOfficeSession(
          callbacks.current.token,
          fileId,
          mode,
          theme,
          controller.signal,
        );
        const api = await loadOfficeScript(session.script_url);
        if (!active()) return;
        const filename = session.config.document.title;
        callbacks.current.onTitle?.(filename);
        const nameIframe = () => {
          const iframe = container.querySelector('iframe');
          if (iframe) {
            iframe.title = `${editing ? 'Редактор' : 'Предпросмотр'} документа ${filename}`;
          }
        };
        loadTimeout = window.setTimeout(
          () => setError('Не удалось открыть документ вовремя.'),
          45000,
        );
        editor.current = new api.DocEditor(anchor.id, {
          ...session.config,
          width: '100%',
          height: '100%',
          events: {
            onAppReady: nameIframe,
            onDocumentReady: () => {
              if (!active()) return;
              window.clearTimeout(loadTimeout);
              setState('ready');
              setError('');
            },
            onDocumentStateChange: (event: { data?: boolean }) => {
              if (!active() || typeof event.data !== 'boolean') return;
              unsaved.current = event.data;
              if (event.data) {
                callbacks.current.onChanged?.();
              } else if (closeAfterSave.current) {
                closeAfterSave.current = false;
                editor.current?.requestClose();
              }
            },
            onRequestClose: () => {
              if (active()) callbacks.current.onRequestClose?.();
            },
            onError: () => {
              if (!active()) return;
              window.clearTimeout(loadTimeout);
              setError(
                editing
                  ? 'Редактор не смог продолжить работу с файлом.'
                  : 'Просмотрщик не смог открыть файл.',
              );
            },
          },
        });
        nameIframe();
      } catch (reason) {
        if (!active()) return;
        if (retries > 0 && reason instanceof ApiError && reason.code === 'document_saving') {
          setState('saving');
          retryTimeout = window.setTimeout(() => void open(retries - 1), 1500);
          return;
        }
        setError(
          reason instanceof ApiError ? reason.message : 'Не удалось подключиться к ONLYOFFICE.',
        );
      }
    };
    void open(waitForSave ? 12 : 0);

    return () => {
      controller.abort();
      window.clearTimeout(loadTimeout);
      window.clearTimeout(retryTimeout);
      editor.current?.destroyEditor();
      editor.current = undefined;
      container.replaceChildren();
    };
  }, [anchorId, attempt, editing, fileId, mode, theme, waitForSave]);

  return (
    <div className="relative size-full min-h-0 bg-theme-secondary">
      <div ref={mount} className="absolute inset-0" />
      {state !== 'ready' && !error && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3">
          <p
            role="status"
            className="rounded-theme border border-theme bg-theme-secondary px-3 py-2 text-sm text-theme-secondary shadow-theme-card"
          >
            {state === 'saving'
              ? 'Ждём сохранения изменений…'
              : editing
                ? 'Подключаем редактор…'
                : 'Загружаем предпросмотр…'}
          </p>
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-2 border-t border-theme bg-theme-secondary px-4 py-2"
        >
          <p className="grow text-sm text-danger">{error}</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Повторить
          </Button>
        </div>
      )}
    </div>
  );
});
