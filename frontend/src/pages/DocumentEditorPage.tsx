import React, { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Moon, Sun, X } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { OfficeFrame, OfficeFrameHandle } from '../components/ui/OfficeFrame';
import SEOHead from '../components/SEOHead';
import { useTheme } from '../hooks/useTheme';
import { useAuthStore } from '../store/authStore';

const DocumentEditorPage: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.accessToken);
  const { theme, toggleTheme } = useTheme();
  const frame = useRef<OfficeFrameHandle>(null);
  const changed = useRef(false);
  const intent = useRef<'file' | 'theme'>('file');
  const [confirmTheme, setConfirmTheme] = useState(false);
  const [waitingForTheme, setWaitingForTheme] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [title, setTitle] = useState('');
  const filePath = `/files/${id}`;
  const themeLabel = theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему';

  function reopenInTheme() {
    changed.current = false;
    intent.current = 'file';
    setWaitingForTheme(false);
    setResuming(true);
    toggleTheme();
  }

  function requestThemeChange() {
    setConfirmTheme(false);
    intent.current = 'theme';
    setWaitingForTheme(true);
    if (!frame.current?.requestClose(true)) reopenInTheme();
  }

  return (
    <main className="flex h-screen supports-[height:100dvh]:h-[100dvh] min-w-0 flex-col bg-theme-primary">
      <SEOHead
        title={title ? `Редактирование — ${title}` : 'Редактирование файла'}
        description="Совместное редактирование офисных файлов"
        canonical={`https://shared-space.ru${filePath}`}
      />
      <div className="flex shrink-0 items-center gap-3 border-b border-theme bg-theme-secondary px-2 py-1 sm:px-4">
        <Link
          to={filePath}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            setWaitingForTheme(false);
            frame.current?.cancelDeferredClose();
            intent.current = 'file';
            if (frame.current?.requestClose()) event.preventDefault();
          }}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-theme px-2 text-sm text-theme-secondary hover:bg-theme-hover hover:text-theme-primary"
        >
          <ArrowLeft size={16} aria-hidden="true" />К файлу
        </Link>
        <h1
          title={title || undefined}
          className="min-w-0 flex-1 truncate text-center text-sm font-medium text-theme-primary"
        >
          {title || 'Редактирование файла'}
        </h1>
        {waitingForTheme && (
          <span role="status" className="shrink-0 text-xs text-theme-secondary">
            Сохраняем…
          </span>
        )}
        <Button
          type="button"
          variant="secondary"
          aria-label={waitingForTheme ? 'Отменить смену темы' : themeLabel}
          title={waitingForTheme ? 'Отменить смену темы' : themeLabel}
          className="grid size-[44px] shrink-0 place-items-center p-0"
          onClick={() => {
            if (waitingForTheme) {
              if (frame.current?.cancelDeferredClose()) {
                intent.current = 'file';
                setWaitingForTheme(false);
              }
            } else if (changed.current) setConfirmTheme(true);
            else requestThemeChange();
          }}
        >
          {waitingForTheme ? (
            <X size={18} aria-hidden="true" />
          ) : theme === 'dark' ? (
            <Sun size={18} aria-hidden="true" />
          ) : (
            <Moon size={18} aria-hidden="true" />
          )}
        </Button>
      </div>

      <div className="min-h-0 min-w-0 flex-1">
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
              if (intent.current === 'theme') reopenInTheme();
              else navigate(filePath);
            }}
          />
        )}
      </div>

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
    </main>
  );
};

export default DocumentEditorPage;
