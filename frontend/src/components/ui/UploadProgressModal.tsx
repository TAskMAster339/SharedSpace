import React from 'react';
import { AlertCircle, CheckCircle2, Loader2, Minimize2, RotateCcw, X } from 'lucide-react';
import { useUploadStore, selectErrorCount, selectSuccessCount, selectActiveCount } from '../../store/uploadStore';
import { formatFileSize, formatCountWord } from '../../utils/format';
import { resolveFileIconType } from '../../utils/fileType';
import { cn } from '../../utils/cn';
import { usePhoneViewport } from '../../hooks/usePhoneViewport';

export const UploadProgressModal: React.FC = () => {
  const tasks = useUploadStore((s) => s.tasks);
  const order = useUploadStore((s) => s.order);
  const isOpen = useUploadStore((s) => s.isModalOpen);
  const isMinimized = useUploadStore((s) => s.isMinimized);
  const closeModal = useUploadStore((s) => s.closeModal);
  const minimize = useUploadStore((s) => s.minimize);
  const expand = useUploadStore((s) => s.expand);
  const retryFailed = useUploadStore((s) => s.retryFailed);
  const clearCompleted = useUploadStore((s) => s.clearCompleted);
  const removeTask = useUploadStore((s) => s.removeTask);

  const isPhone = usePhoneViewport();

  const activeCount = useUploadStore(selectActiveCount);
  const errorCount = useUploadStore(selectErrorCount);
  const successCount = useUploadStore(selectSuccessCount);
  const total = order.length;

  const overallProgress =
    total === 0
      ? 0
      : Math.round(
          order.reduce((sum, id) => {
            const t = tasks[id];
            if (!t) return sum;
            if (t.status === 'success') return sum + 100;
            if (t.status === 'uploading') return sum + t.progress;
            return sum;
          }, 0) / total,
        );

  const canClose = activeCount === 0;

  const headerTitle =
    activeCount > 0
      ? `Загрузка ${activeCount} ${formatCountWord(activeCount, 'файла', 'файлов', 'файлов')}`
      : errorCount > 0
        ? `${errorCount} ${formatCountWord(errorCount, 'файл не загружен', 'файла не загружено', 'файлов не загружено')}`
        : 'Загрузка завершена';

  const handleClose = () => {
    if (canClose) {
      clearCompleted();
      if (errorCount === 0) closeModal();
      else closeModal(); // оставляем ошибки в сторе, но модалку закрываем — плавающий бейдж
    }
  };

  if (!isOpen) {
    // Плавающая мини-панель при сворачивании
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
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
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
        {/* Заголовок */}
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

        {/* Общий прогресс */}
        <div className="px-5 pt-3">
          <div className="w-full h-1.5 bg-theme-border rounded-theme overflow-hidden">
            <div
              className="h-full bg-brand transition-all duration-300"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>

        {/* Список файлов */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {order.map((id) => {
            const task = tasks[id];
            if (!task) return null;
            const ext = task.file.name.split('.').pop() ?? '';
            const iconType = resolveFileIconType(task.file.type, ext);
            return (
              <div
                key={id}
                className="flex items-start gap-3 px-3 py-2.5 rounded-theme hover:bg-theme-hover"
              >
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
                      {task.status === 'success' && (
                        <CheckCircle2 size={18} className="text-emerald-500" />
                      )}
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
                {task.status === 'success' && (
                  <button
                    type="button"
                    onClick={() => removeTask(id)}
                    aria-label="Убрать из списка"
                    className="shrink-0 p-1 text-theme-muted hover:text-theme-primary"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Футер */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-t border-theme">
          <span className="text-xs text-theme-muted">
            Всего: {total} · {formatCountWord(total, 'файл', 'файла', 'файлов')}
          </span>
          <div className="flex items-center gap-2">
            {errorCount > 0 && (
              <button
                type="button"
                onClick={retryFailed}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-theme bg-brand text-theme-on-brand hover:bg-brand-hover text-sm font-medium"
              >
                <RotateCcw size={14} />
                Повторить ({errorCount})
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