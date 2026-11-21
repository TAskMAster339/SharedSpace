import React, { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Moon, Sun, X } from 'lucide-react';
import { Header } from '../components/Header';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { OfficeFrame, OfficeFrameHandle } from '../components/ui/OfficeFrame';
import SEOHead from '../components/SEOHead';
import { useTheme } from '../hooks/useTheme';
import { useAuthStore } from '../store/authStore';
import { canEditOfficeFile } from '../utils/officeFormats';

const DocumentEditorPage: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.accessToken);
  const { theme, toggleTheme } = useTheme();
  const frame = useRef<OfficeFrameHandle>(null);
  const changed = useRef(false);
  const afterClose = useRef<(() => void) | null>(null);
  const [confirmTheme, setConfirmTheme] = useState(false);
  const [waitingForTheme, setWaitingForTheme] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [title, setTitle] = useState('');
  const filePath = `/files/${id}`;
  const themeLabel = theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему';

  function reopenInTheme() {
    changed.current = false;
    setWaitingForTheme(false);
    setResuming(true);
    toggleTheme();
  }

  function requestThemeChange() {
    setConfirmTheme(false);
    setWaitingForTheme(true);
    afterClose.current = reopenInTheme;
    if (!frame.current?.requestClose(true)) {
      afterClose.current = null;
      reopenInTheme();
    }
  }

  function leaveEditor(action: () => void) {
    setWaitingForTheme(false);
    frame.current?.cancelDeferredClose();
    afterClose.current = action;
    if (!frame.current?.requestClose()) {
      afterClose.current = null;
      action();
    }
  }

  function returnToFile(event: React.MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    leaveEditor(() => navigate(filePath));
  }

  function toggleEditorTheme() {
    if (waitingForTheme) {
      if (frame.current?.cancelDeferredClose()) {
        afterClose.current = null;
        setWaitingForTheme(false);
      }
    } else if (changed.current) {
      setConfirmTheme(true);
    } else {
      requestThemeChange();
    }
  }

  return (
    <div className="flex h-screen supports-[height:100dvh]:h-[100dvh] min-w-0 flex-col bg-theme-primary">
      <SEOHead
        title={title ? `Редактирование — ${title}` : 'Редактирование файла'}
        description="Совместное редактирование офисных файлов"
        canonical={`https://shared-space.ru${filePath}`}
      />
      <Header
        workspace={{
          nearLogo: (
            <Link
              to={filePath}
              onClick={returnToFile}
              aria-label="К файлу"
              title="К файлу"
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-theme border border-brand/30 bg-brand-light px-2.5 text-sm font-semibold text-brand-dark transition-colors hover:bg-brand hover:text-theme-on-brand dark:text-brand dark:hover:text-theme-on-brand sm:px-3"
            >
              <ArrowLeft size={18} aria-hidden="true" />
              <span className="hidden sm:inline">К файлу</span>
            </Link>
          ),
          themeButton: (
            <Button
              type="button"
              variant="secondary"
              aria-label={waitingForTheme ? 'Отменить смену темы' : themeLabel}
              title={waitingForTheme ? 'Отменить смену темы' : themeLabel}
              className="grid size-9 shrink-0 place-items-center p-0 sm:size-11"
              onClick={toggleEditorTheme}
            >
              {waitingForTheme ? (
                <X size={18} aria-hidden="true" />
              ) : theme === 'dark' ? (
                <Sun size={18} aria-hidden="true" />
              ) : (
                <Moon size={18} aria-hidden="true" />
              )}
            </Button>
          ),
          actions: (
            <>
              {waitingForTheme && (
                <span
                  role="status"
                  className="sr-only sm:not-sr-only sm:text-xs sm:text-theme-secondary"
                >
                  Сохраняем…
                </span>
              )}
              {canEditOfficeFile(title) && (
                <Link
                  to={filePath}
                  aria-label="Режим чтения"
                  title="Режим чтения"
                  onClick={returnToFile}
                  className="grid size-9 shrink-0 place-items-center rounded-theme text-theme-secondary hover:bg-theme-hover hover:text-theme-primary sm:hidden"
                >
                  <BookOpen size={18} aria-hidden="true" />
                </Link>
              )}
            </>
          ),
          leave: leaveEditor,
        }}
      />

      <main className="min-h-0 min-w-0 flex-1" aria-label="Рабочая область документа">
        {token && (
          <OfficeFrame
            ref={frame}
            fileId={id}
            token={token}
            mode="edit"
            theme={theme}
            waitForSave={resuming}
            onTitle={setTitle}
            onChanged={() => {
              changed.current = true;
            }}
            onRequestClose={() => {
              const action = afterClose.current;
              afterClose.current = null;
              if (action) action();
              else navigate(filePath);
            }}
          />
        )}
      </main>

      <Modal
        native
        isOpen={confirmTheme}
        onClose={() => setConfirmTheme(false)}
        title="Сменить тему редактора"
        maxWidth="sm"
      >
        <p className="text-sm text-theme-secondary">
          Редактор завершит текущий сеанс в этой вкладке и снова откроет файл в новой теме.
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => setConfirmTheme(false)}>
            Отмена
          </Button>
          <Button type="button" onClick={requestThemeChange}>
            Применить тему
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default DocumentEditorPage;
