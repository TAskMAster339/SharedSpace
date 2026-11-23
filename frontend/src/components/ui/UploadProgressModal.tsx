import React from 'react';
import { AlertCircle, CheckCircle2, Loader2, Minimize2, RotateCcw, X } from 'lucide-react';
import {
  useUploadStore,
  selectActiveCount,
  selectErrorCount,
  selectSuccessCount,
  selectRetryableErrorCount,
} from '../../store/uploadStore';
import { formatFileSize, formatCountWord } from '../../utils/format';
import { resolveFileIconType } from '../../utils/fileType';
import { cn } from '../../utils/cn';
import { usePhoneViewport } from '../../hooks/usePhoneViewport';

interface TaskRowProps {
  id: string;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}

const TaskRow = React.memo<TaskRowProps>(({ id, onRemove, onRetry }) => {
  const task = useUploadStore((s) => s.tasks[id]);
  if (!task) return null;

  const ext = task.file.name.split('.').pop() ?? '';
  const iconType = resolveFileIconType(task.file.type, ext);

  return (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-theme hover:bg-theme-hover">
      <div className="w-9 h-9 shrink-0 rounded-theme bg-theme-tertiary flex items-center justify-center text-theme-secondary text-xs font-semibold uppercase">
        {ext.slice(0, 4) || iconType}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm text-theme-primary truncate flex-1">{task.file.name}</p>
          <span className="shrink-0">
            {task.status === 'uploading' && (
              <Loader2 size={18} className="animate-spin text-brand" />
            )}
            {task.status === 'success' && <CheckCircle2 size={18} className="text-emerald-500" />}
            {task.status === 'error' && <AlertCircle size={18} className="text-danger" />}
          </span>
        </div>
        <p className="text-xs text-theme-muted mt-0.5 truncate">
          {formatFileSize(task.file.size)}
          {task.status === 'uploading' ? ` · ${task.progress}%` : ''}
          {task.status === 'error' && task.error ? ` · ${task.error}` : ''}
        </p>
        {task.status === 'uploading' && (
          <div className="mt-1.5 w-full h-1 bg-theme-border rounded-theme overflow-hidden">
            <div
              className="h-full bg-brand transition-all duration-200"
              style={{ width: `${task.progress}%` }}
            />
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {task.status === 'error' && task.retryable && (
          <button
            type="button"
            onClick={() => onRetry(id)}
            aria-label="Повторить загрузку файла"
            className="p-1 text-theme-muted hover:text-brand"
          >
            <RotateCcw size={14} />
          </button>
        )}
        {task.status === 'error' && (
          <button
            type="button"
            onClick={() => onRemove(id)}
            aria-label="Убрать из списка"
            className="p-1 text-theme-muted hover:text-theme-primary"
          >
            <X size={14} />
          </button>
        )}
        {task.status === 'success' && (
          <button
            type="button"
            onClick={() => onRemove(id)}
            aria-label="Убрать из списка"
            className="p-1 text-theme-muted hover:text-theme-primary"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
});
TaskRow.displayName = 'TaskRow';

export const UploadProgressModal: React.FC = () => {
  const order = useUploadStore((s) => s.order);
  const isOpen = useUploadStore((s) => s.isModalOpen);
  const isMinimized = useUploadStore((s) => s.isMinimized);
  const closeModal = useUploadStore((s) => s.closeModal);
  const minimize = useUploadStore((s) => s.minimize);
  const expand = useUploadStore((s) => s.expand);
  const retryFailed = useUploadStore((s) => s.retryFailed);
  const clearCompleted = useUploadStore((s) => s.clearCompleted);
  const removeTask = useUploadStore((s) => s.removeTask);

  const activeCount = useUploadStore(selectActiveCount);
  const errorCount = useUploadStore(selectErrorCount);
  const retryableErrorCount = useUploadStore(selectRetryableErrorCount);
  const successCount = useUploadStore(selectSuccessCount);
  const isPhone = usePhoneViewport();

  const total = order.length;
  const overallProgress = useUploadStore((s) => {
    if (s.order.length === 0) return 0;
    let sum = 0;
    for (const id of s.order) {
      const t = s.tasks[id];
      if (!t) continue;
      if (t.status === 'success') sum += 100;
      else if (t.status === 'uploading') sum += t.progress;
    }
    return Math.round(sum / s.order.length);
  });

  const canClose = activeCount === 0;

  const headerTitle =
    activeCount > 0
      ? `Загрузка ${activeCount} ${formatCountWord(activeCount, 'файла', 'файлов', 'файлов')}`
      : errorCount > 0
        ? `${errorCount} ${formatCountWord(errorCount, 'файл не загружен', 'файла не загружено', 'файлов не загружено')}`
        : 'Загрузка завершена';

  const handleClose = () => {
    if (!canClose) return;
    clearCompleted();
    closeModal();
  };

  if (!isOpen) {
    if (!isMinimized) return null;
    return (
      <button
        type="button"
        onClick={expand}
        className="fixed bottom-4 right-4 z-[70] flex items-center gap-3 rounded-theme border border-theme bg-theme-secondary px-4 py-3 shadow-theme-dropdown hover:bg-theme-hover transition-colors"
      >
        {activeCount > 0 ? (
          <Loader2 size={18} className="animate-spin text-brand" />
        ) : errorCount > 0 ? (
          <AlertCircle size={18} className="text-danger" />
        ) : (
          <CheckCircle2 size={18} className="text-emerald-500" />
        )}
        <span className="text-sm text-theme-primary">
          {activeCount > 0
            ? `Загрузка ${activeCount}…`
            : errorCount > 0
              ? `Ошибок: ${errorCount}`
              : `Загружено: ${successCount}`}
        </span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:px-4">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => {
          if (activeCount === 0) handleClose();
          else minimize();
        }}
      />
      <div
        className={cn(
          'relative flex w-full flex-col bg-theme-secondary border border-theme shadow-theme-dropdown',
          'rounded-t-theme sm:rounded-theme',
          isPhone ? 'max-h-[85dvh]' : 'max-w-xl max-h-[80vh]',
        )}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-theme">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-theme-primary truncate">{headerTitle}</h2>
            <p className="text-xs text-theme-muted mt-0.5">
              Успешно: {successCount} · Ошибки: {errorCount}
              {activeCount > 0 ? ` · В процессе: ${activeCount}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {activeCount > 0 && (
              <button
                type="button"
                onClick={minimize}
                aria-label="Свернуть"
                className="p-2 rounded-theme hover:bg-theme-hover text-theme-secondary"
              >
                <Minimize2 size={18} />
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              disabled={!canClose}
              aria-label="Закрыть"
              className={cn(
                'p-2 rounded-theme text-theme-secondary',
                canClose ? 'hover:bg-theme-hover' : 'opacity-40 cursor-not-allowed',
              )}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="px-5 pt-3">
          <div className="w-full h-1.5 bg-theme-border rounded-theme overflow-hidden">
            <div
              className="h-full bg-brand transition-all duration-300"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {order.map((id) => (
            <TaskRow key={id} id={id} onRemove={removeTask} onRetry={retryFailed} />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-t border-theme">
          <span className="text-xs text-theme-muted">
            Всего: {total} · {formatCountWord(total, 'файл', 'файла', 'файлов')}
          </span>
          <div className="flex items-center gap-2">
            {retryableErrorCount > 0 && (
              <button
                type="button"
                onClick={() => retryFailed()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-theme bg-brand text-theme-on-brand hover:bg-brand-hover text-sm font-medium"
              >
                <RotateCcw size={14} />
                Повторить всё ({retryableErrorCount})
              </button>
            )}
            {successCount > 0 && activeCount === 0 && (
              <button
                type="button"
                onClick={clearCompleted}
                className="px-3 py-1.5 rounded-theme border border-theme text-theme-secondary hover:bg-theme-hover text-sm"
              >
                Очистить
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
