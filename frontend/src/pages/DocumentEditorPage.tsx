import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { startDocumentEditor } from '../api/documents';
import { ApiError } from '../api/client';
import { Button } from '../components/ui/Button';
import SEOHead from '../components/SEOHead';
import { useAuthStore } from '../store/authStore';

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

const DocumentEditorPage: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.accessToken);
  const editor = useRef<OfficeEditor>();
  const mount = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const filePath = `/files/${id}`;

  useEffect(() => {
    if (!token || !id || !mount.current) return;
    const controller = new AbortController();
    const container = mount.current;
    const anchor = document.createElement('div');
    anchor.id = 'sharedspace-office-editor';
    container.replaceChildren(anchor);

    setTitle('');
    setError('');
    setReady(false);
    let loadTimeout: number | undefined;

    const open = async () => {
      try {
        const session = await startDocumentEditor(token, id, controller.signal);
        const api = await loadOfficeScript(session.script_url);
        if (controller.signal.aborted) return;
        const filename = session.config.document.title;
        setTitle(filename);
        loadTimeout = window.setTimeout(
          () => setError('Редактор не открыл документ. Попробуйте ещё раз.'),
          45000,
        );
        editor.current = new api.DocEditor(anchor.id, {
          ...session.config,
          editorConfig: {
            ...session.config.editorConfig,
            customization: {
              ...session.config.editorConfig.customization,
              uiTheme: document.documentElement.classList.contains('dark')
                ? 'theme-dark'
                : 'theme-light',
            },
          },
          width: '100%',
          height: '100%',
          events: {
            onAppReady: () => {
              const iframe = container.querySelector('iframe');
              if (iframe) iframe.title = `Редактор документа ${filename}`;
            },
            onDocumentReady: () => {
              window.clearTimeout(loadTimeout);
              setReady(true);
              setError('');
            },
            onRequestClose: () => navigate(filePath),
            onError: () => {
              window.clearTimeout(loadTimeout);
              setError('Редактор не смог открыть документ или продолжить редактирование.');
            },
          },
        });
      } catch (reason) {
        if (controller.signal.aborted) return;
        setError(
          reason instanceof ApiError
            ? reason.message
            : 'Не удалось открыть редактор. Попробуйте ещё раз.',
        );
      }
    };

    void open();
    return () => {
      controller.abort();
      window.clearTimeout(loadTimeout);
      editor.current?.destroyEditor();
      editor.current = undefined;
      container.replaceChildren();
    };
  }, [attempt, filePath, id, navigate, token]);

  return (
    <div className="space-y-3">
      <SEOHead
        title={title ? `Редактирование — ${title}` : 'Редактирование документа'}
        description="Совместное редактирование DOCX"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          to={filePath}
          onClick={(event) => {
            if (
              !ready ||
              !editor.current ||
              error ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            event.preventDefault();
            editor.current.requestClose();
          }}
          className="inline-flex items-center gap-2 py-2 text-sm text-theme-secondary hover:text-theme-primary"
        >
          <ArrowLeft size={16} aria-hidden="true" />К файлу
        </Link>
        <h1 className="min-w-0 truncate text-sm font-medium text-theme-primary">
          {title || 'Редактирование документа'}
        </h1>
      </div>
      {!ready && !error && (
        <p role="status" className="text-sm text-theme-secondary">
          Подключаем редактор…
        </p>
      )}
      {error && (
        <div className="flex flex-wrap items-center gap-2 rounded-theme border border-theme bg-theme-secondary p-3">
          <p role="alert" className="grow text-sm text-danger">
            {error}
          </p>
          <Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}>
            Повторить
          </Button>
        </div>
      )}
      <div
        ref={mount}
        hidden={!title}
        className="h-[78dvh] min-h-[30rem] w-full rounded-theme border border-theme bg-theme-secondary"
      />
    </div>
  );
};

export default DocumentEditorPage;
