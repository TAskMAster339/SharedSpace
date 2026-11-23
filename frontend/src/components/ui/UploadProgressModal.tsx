import React from 'react';
import { Button } from './Button';
import { FileIcon } from './FileIcon';
import { preventModalContextMenu } from './preventModalContextMenu';
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

const iconButtonClasses =
  'inline-grid size-10 place-items-center p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

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
    <li className="flex items-center gap-3 px-3 py-2.5">
      <div className="grid size-9 shrink-0 place-items-center rounded-theme bg-theme-tertiary">
        <FileIcon type={iconType} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-theme-primary" title={task.file.name}>
          {task.file.name}
        </p>
        <p className="mt-0.5 text-xs text-theme-secondary">
          {formatFileSize(task.file.size)}
          {task.status === 'uploading' ? ` · ${task.progress}%` : ''}
        </p>
        {task.status === 'error' && task.error && (
          <p className="mt-0.5 break-words text-xs text-danger">{task.error}</p>
        )}
        {task.status === 'uploading' && (
          <div className="mt-1.5 h-1 overflow-hidden rounded-theme bg-theme-border">
            <div
              className="h-full origin-left bg-brand transition-transform duration-200 motion-reduce:transition-none"
              style={{ transform: `scaleX(${task.progress / 100})` }}
            />
          </div>
        )}
      </div>
      <div className="grid shrink-0 grid-cols-[auto_1.5rem_2.5rem] items-center gap-x-1">
        {task.status === 'error' && task.retryable && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onRetry(id)}
            aria-label={`Повторить загрузку файла: ${task.file.name}`}
            className={cn(iconButtonClasses, 'col-start-1 row-start-1')}
          >
            <RotateCcw size={16} />
          </Button>
        )}
        <span className="col-start-2 row-start-1 grid place-items-center">
          {task.status === 'uploading' && <Loader2 size={18} className="animate-spin text-brand" />}
          {task.status === 'success' && (
            <CheckCircle2 size={18} className="text-[color:var(--success)]" />
          )}
          {task.status === 'error' && <AlertCircle size={18} className="text-danger" />}
        </span>
        {(task.status === 'success' || task.status === 'error') && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onRemove(id)}
            aria-label={`Убрать из списка: ${task.file.name}`}
            className={cn(iconButtonClasses, 'col-start-3 row-start-1')}
          >
            <X size={18} />
          </Button>
        )}
      </div>
    </li>
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
          <CheckCircle2 size={18} className="text-[color:var(--success)]" />
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
    <div
      onContextMenu={preventModalContextMenu}
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:px-4"
    >
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
            <h2 className="text-lg font-semibold text-theme-primary truncate">{headerTitle}</h2>
            <p className="text-xs text-theme-muted mt-0.5">
              Успешно: {successCount} · Ошибки: {errorCount}
              {activeCount > 0 ? ` · В процессе: ${activeCount}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {activeCount > 0 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={minimize}
                aria-label="Свернуть"
                className={iconButtonClasses}
              >
                <Minimize2 size={18} />
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleClose}
              disabled={!canClose}
              aria-label="Закрыть"
              className={iconButtonClasses}
            >
              <X size={18} />
            </Button>
          </div>
        </div>

        <div className="px-5 pt-3">
          <div className="w-full h-1.5 bg-theme-border rounded-theme overflow-hidden">
            <div
              className="h-full origin-left bg-brand transition-transform duration-300 motion-reduce:transition-none"
              style={{ transform: `scaleX(${overallProgress / 100})` }}
            />
          </div>
        </div>

        <ul className="min-h-0 flex-1 divide-y divide-theme overflow-y-auto px-2 py-2">
          {order.map((id) => (
            <TaskRow key={id} id={id} onRemove={removeTask} onRetry={retryFailed} />
          ))}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-t border-theme">
          <span className="text-xs text-theme-muted">
            Всего: {total} · {formatCountWord(total, 'файл', 'файла', 'файлов')}
          </span>
          <div className="flex items-center gap-2">
            {retryableErrorCount > 0 && (
              <Button
                type="button"
                size="sm"
                onClick={() => retryFailed()}
                className="inline-flex items-center gap-1.5"
              >
                <RotateCcw size={14} />
                Повторить всё ({retryableErrorCount})
              </Button>
            )}
            {successCount > 0 && activeCount === 0 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={clearCompleted}
                className="border border-theme"
              >
                Очистить
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
