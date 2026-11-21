import React, { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { MobileReaderLayout, MobileReaderLayoutProps } from './MobileReaderLayout';

interface MobileDocxReaderProps extends MobileReaderLayoutProps {
  size: number;
  loadUrl: (signal: AbortSignal) => Promise<string>;
}

export function MobileDocxReader({ size, loadUrl, ...layout }: MobileDocxReaderProps) {
  const content = useRef<HTMLElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

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
    <MobileReaderLayout {...layout}>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-6">
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
            <Button type="button" variant="secondary" onClick={layout.onStandardPreview}>
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
    </MobileReaderLayout>
  );
}
