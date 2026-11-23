import React from 'react';
import { Toast, ToastVariant } from './Toast';
import { useToastStore } from '../../hooks/useToast';
import { useUploadStore } from '../../store/uploadStore';

export type { ToastVariant };

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  actionLabel?: string;
  onAction?: () => void;
}

type ToastPopover = HTMLDivElement & {
  showPopover: () => void;
  hidePopover: () => void;
};

export const ToastContainer: React.FC = () => {
  const toasts = useToastStore((state) => state.toasts);
  const onRemove = useToastStore((state) => state.removeToast);
  const toastMobileBottomPx = useToastStore((s) => s.toastMobileBottomPx);
  const uploadsMinimized = useUploadStore((s) => s.isMinimized);
  const bottomClass = uploadsMinimized
    ? 'bottom-[calc(var(--toast-bottom)+3.25rem)] md:bottom-[4.25rem]'
    : 'bottom-[var(--toast-bottom)] md:bottom-4';

  const stack = React.useRef<ToastPopover>(null);
  const shown = toasts.length > 0;
  const supportsPopover =
    typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;

  React.useEffect(() => {
    const element = stack.current;
    if (!element || !supportsPopover) return;
    if (shown && !element.matches(':popover-open')) element.showPopover();
    if (!shown && element.matches(':popover-open')) element.hidePopover();
  }, [shown, supportsPopover]);

  return (
    <>
      <div className="sr-only" role="status" aria-relevant="additions">
        {toasts.map(({ id, message }) => (
          <span key={id}>{message}</span>
        ))}
      </div>
      <div
        ref={stack}
        {...(supportsPopover ? { popover: 'manual' } : {})}
        role="region"
        aria-label="Уведомления"
        className={`pointer-events-none fixed m-0 max-w-none top-auto right-4 left-4 md:left-auto z-[60] flex-col gap-2 md:w-96 border-0 bg-transparent p-0 max-h-[min(50dvh,24rem)] overflow-y-auto ${bottomClass} ${shown ? 'flex' : 'hidden'}`}
        style={{ '--toast-bottom': `${toastMobileBottomPx}px` } as React.CSSProperties}
      >
        {toasts.map((toast) => (
          <div className="pointer-events-auto shrink-0" key={toast.id}>
            <Toast
              message={toast.message}
              variant={toast.variant}
              onClose={() => onRemove(toast.id)}
              duration={5000}
              actionLabel={toast.actionLabel}
              onAction={toast.onAction}
            />
          </div>
        ))}
      </div>
    </>
  );
};
