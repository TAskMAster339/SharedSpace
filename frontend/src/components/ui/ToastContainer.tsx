import React from 'react';
import { Toast, ToastVariant } from './Toast';
import { useToastStore } from '../../hooks/useToast';

export type { ToastVariant };

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onRemove: (id: string) => void;
}

const useIsMobile = () => {
  const [mobile, setMobile] = React.useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : true,
  );
  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return mobile;
};

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onRemove }) => {
  const mobileMoreOpen = useToastStore((s) => s.mobileMoreOpen);
  const toastMobileBottomPx = useToastStore((s) => s.toastMobileBottomPx);
  const isMobile = useIsMobile();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed right-4 left-4 md:left-auto z-[60] flex flex-col gap-2 md:w-96 transition-all duration-300 md:bottom-4"
      style={{ bottom: isMobile ? toastMobileBottomPx : undefined }}
    >
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          variant={toast.variant}
          onClose={() => onRemove(toast.id)}
          duration={5000}
          actionLabel={toast.actionLabel}
          onAction={toast.onAction}
        />
      ))}
    </div>
  );
};
