import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, X, Trash2, RotateCcw, Star } from 'lucide-react';
import { cn } from '../../utils/cn';

export type ToastVariant = 'success' | 'error' | 'info' | 'undo' | 'favorite';

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
  duration = 5000,
  onClose,
  actionLabel,
  onAction,
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setProgress(0));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Фон уведомления всегда непрозрачный и зависит только от темы
  // (светлый в светлой теме, тёмный в тёмной). Цветом отличается только
  // полоска времени и иконка, в зависимости от типа действия.
  const variants = {
    success: {
      icon: CheckCircle,
      iconColor: 'text-emerald-500',
      progressColor: 'bg-emerald-500',
    },
    error: {
      icon: XCircle,
      iconColor: 'text-red-500',
      progressColor: 'bg-red-500',
    },
    info: {
      icon: CheckCircle,
      iconColor: 'text-blue-500',
      progressColor: 'bg-blue-500',
    },
    undo: {
      icon: Trash2,
      iconColor: 'text-red-500',
      progressColor: 'bg-red-500',
    },
    favorite: {
      icon: Star,
      iconColor: 'text-yellow-400',
      progressColor: 'bg-yellow-400',
    },
  };

  const style = variants[variant] || variants.info;
  const Icon = style.icon;

  return (
    <div
      className={cn(
        'relative overflow-hidden flex items-center gap-3 px-4 py-3 rounded-theme-lg border border-theme shadow-theme-dropdown max-w-sm w-full',
        'bg-theme-secondary',
        'transition-all duration-300 transform',
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
      )}
    >
      <div
        className={cn('absolute top-0 left-0 h-1', style.progressColor)}
        style={{
          width: `${progress}%`,
          transitionProperty: 'width',
          transitionTimingFunction: 'linear',
          transitionDuration: `${duration}ms`,
        }}
      />
      <Icon size={20} className={cn('shrink-0', style.iconColor)} />
      <p className="text-sm text-theme-primary flex-1">{message}</p>
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
