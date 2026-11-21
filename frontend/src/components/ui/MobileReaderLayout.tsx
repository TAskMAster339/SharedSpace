import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Download, FileText, Moon, Pencil, Sun } from 'lucide-react';
import { getDocumentHistory } from '../../api/documents';
import { useTheme } from '../../hooks/useTheme';
import { Button } from './Button';

export interface MobileReaderLayoutProps {
  filename: string;
  onBack: () => void;
  onStandardPreview: () => void;
  onDownload?: () => void;
  privateFile?: { id: string; token: string };
}

const iconButton = 'inline-grid size-11 shrink-0 place-items-center p-0';

export function MobileReaderLayout({
  filename,
  onBack,
  onStandardPreview,
  onDownload,
  privateFile,
  children,
}: React.PropsWithChildren<MobileReaderLayoutProps>) {
  const { theme, toggleTheme } = useTheme();
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
        {canEdit && id && (
          <Link
            to={`/files/${id}/edit`}
            aria-label="Редактировать"
            title="Редактировать"
            className={`${iconButton} rounded-theme text-brand hover:bg-theme-hover`}
          >
            <Pencil size={18} aria-hidden="true" />
          </Link>
        )}
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
      {children}
    </main>
  );
}
