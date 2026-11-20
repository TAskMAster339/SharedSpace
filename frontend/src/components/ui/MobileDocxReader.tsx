import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Download, FileText, Moon, Pencil, Sun } from 'lucide-react';
import { getDocumentHistory } from '../../api/documents';
import { useTheme } from '../../hooks/useTheme';
import { Button } from './Button';

interface MobileDocxReaderProps {
  filename: string;
  size: number;
  loadUrl: (signal: AbortSignal) => Promise<string>;
  onBack: () => void;
  onStandardPreview: () => void;
  onDownload?: () => void;
  privateFile?: { id: string; token: string };
}

const iconButton = 'inline-grid size-11 shrink-0 place-items-center p-0';

export function MobileDocxReader({
  filename,
  size,
  loadUrl,
  onBack,
  onStandardPreview,
  onDownload,
  privateFile,
}: MobileDocxReaderProps) {
  const content = useRef<HTMLElement>(null);
  const { theme, toggleTheme } = useTheme();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [canEdit, setCanEdit] = useState(false);
  const id = privateFile?.id;
  const token = privateFile?.token;

  useEffect(() => {
    const controller = new AbortController();
    setCanEdit(false);
    if (id && token) {
      getDocumentHistory(token, id, controller.signal)
        .then(({ can_edit }) => {
          if (!controller.signal.aborted) setCanEdit(can_edit);
        })
        .catch(() => {});
    }
    return () => controller.abort();
  }, [id, token]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const article = content.current;
    setStatus('loading');
    article?.replaceChildren();
    const timeout = window.setTimeout(() => {
      controller.abort();
      setStatus('error');
    }, 30000);

    async function open() {
      try {
        const { loadDocxReader, maxReaderSize } = await import('../../utils/loadDocxReader');
        if (size > maxReaderSize) throw new Error('Документ слишком большой для мобильного чтения');
        const url = await loadUrl(signal);
        const html = await loadDocxReader(url, signal);
        const { sanitizeDocxMarkup } = await import('../../utils/docxReaderMarkup');
        const sanitized = await sanitizeDocxMarkup(html);
        if (!signal.aborted) {
          if (!sanitized.childNodes.length) throw new Error('Документ не содержит текста');
          article?.replaceChildren(sanitized);
          setStatus('ready');
        }
      } catch {
        if (!signal.aborted) setStatus('error');
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void open();
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [loadUrl, size]);

  return (
    <main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-theme-primary">
      <header className="flex shrink-0 items-center gap-1 border-b border-theme bg-theme-secondary px-2 pt-[env(safe-area-inset-top)]">
        <Button
          type="button"
          variant="secondary"
          aria-label="Назад"
          className={iconButton}
          onClick={onBack}
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </Button>
        <h1
          className="min-w-0 flex-1 truncate text-sm font-semibold text-theme-primary"
          title={filename}
        >
          {filename}
        </h1>
        <Button
          type="button"
          variant="secondary"
          aria-label="Переключить тему"
          className={iconButton}
          onClick={toggleTheme}
        >
          {theme === 'dark' ? (
            <Sun size={18} aria-hidden="true" />
          ) : (
            <Moon size={18} aria-hidden="true" />
          )}
        </Button>
        {onDownload && (
          <Button
            type="button"
            variant="secondary"
            aria-label="Скачать файл"
            className={iconButton}
            onClick={onDownload}
          >
            <Download size={18} aria-hidden="true" />
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          aria-label="Обычный предпросмотр и сведения"
          title="Обычный предпросмотр и сведения"
          className={iconButton}
          onClick={onStandardPreview}
        >
          <FileText size={18} aria-hidden="true" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-24 pt-6 sm:px-6">
        {status === 'loading' && (
          <p role="status" className="text-center text-sm text-theme-secondary">
            Подготавливаем документ…
          </p>
        )}
        {status === 'error' && (
          <div
            role="alert"
            className="mx-auto max-w-xs space-y-3 text-center text-sm text-theme-secondary"
          >
            <p>Не удалось подготовить документ для мобильного чтения.</p>
            <Button type="button" variant="secondary" onClick={onStandardPreview}>
              Открыть обычный предпросмотр
            </Button>
          </div>
        )}
        <article
          ref={content}
          aria-label="Содержимое документа"
          aria-busy={status === 'loading'}
          className="docx-reader mx-auto max-w-[64ch] text-theme-primary"
        />
      </div>
      {canEdit && id && (
        <Link
          to={`/files/${id}/edit`}
          className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 inline-flex min-h-11 items-center gap-2 rounded-theme bg-brand px-4 text-sm font-medium text-theme-on-brand shadow-theme-dropdown hover:bg-brand-hover"
        >
          <Pencil size={17} aria-hidden="true" />
          Редактировать
        </Link>
      )}
    </main>
  );
}
