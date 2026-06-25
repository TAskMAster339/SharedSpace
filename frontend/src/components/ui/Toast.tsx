import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, X, Trash2, RotateCcw } from 'lucide-react';
import { cn } from '../../utils/cn';
import { capitalize } from '../../utils/text';

export type ToastVariant = 'success' | 'error' | 'info' | 'undo';

interface ToastProps {
  message: string;
  variant?: ToastVariant;
  duration?: number;
  onClose: () => void;
  actionLabel?: string;
  onAction?: () => void;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  variant = 'success',
  duration = 3000,
  onClose,
  actionLabel,
  onAction,
}) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const variants = {
    success: {
      bg: 'bg-emerald-50 dark:bg-emerald-950/50',
      border: 'border-emerald-200 dark:border-emerald-800',
      icon: CheckCircle,
      iconColor: 'text-emerald-500',
    },
    error: {
      bg: 'bg-red-50 dark:bg-red-950/50',
      border: 'border-red-200 dark:border-red-800',
      icon: XCircle,
      iconColor: 'text-red-500',
    },
    info: {
      bg: 'bg-blue-50 dark:bg-blue-950/50',
      border: 'border-blue-200 dark:border-blue-800',
      icon: CheckCircle,
      iconColor: 'text-blue-500',
    },
    undo: {
      bg: 'bg-amber-50 dark:bg-amber-950/50',
      border: 'border-amber-200 dark:border-amber-800',
      icon: Trash2,
      iconColor: 'text-amber-500',
    },
  };

  const style = variants[variant] || variants.info;
  const Icon = style.icon;

  // Автоматически делаем первую букву заглавной
  const formattedMessage = capitalize(message);

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-theme-lg border shadow-theme-dropdown max-w-sm w-full',
        'transition-all duration-300 transform',
        style.bg,
        style.border,
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
      )}
    >
      <Icon size={20} className={cn('shrink-0', style.iconColor)} />
      <p className="text-sm text-theme-primary flex-1">{formattedMessage}</p>
      {actionLabel && onAction && (
        <button
          onClick={() => {
            onAction();
            setIsVisible(false);
            setTimeout(onClose, 300);
          }}
          className="shrink-0 text-brand hover:text-brand-hover font-medium text-sm transition-colors flex items-center gap-1"
        >
          <RotateCcw size={14} />
          {actionLabel}
        </button>
      )}
      <button
        onClick={() => {
          setIsVisible(false);
          setTimeout(onClose, 300);
        }}
        className="shrink-0 text-theme-muted hover:text-theme-primary transition-colors"
      >
        <X size={16} />
      </button>
    </div>
  );
};
