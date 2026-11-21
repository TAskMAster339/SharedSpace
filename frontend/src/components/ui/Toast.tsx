import React, { useEffect, useState, useRef } from 'react';
import { CheckCircle, XCircle, X, Clock3, Trash2, RotateCcw, Star } from 'lucide-react';
import { cn } from '../../utils/cn';

export type ToastVariant = 'success' | 'error' | 'info' | 'undo' | 'favorite' | 'move' | 'pending';

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
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const persistent = variant === 'pending';

  useEffect(() => {
    if (persistent || !isVisible) return;
    const timer = setTimeout(() => setIsVisible(false), duration);
    return () => clearTimeout(timer);
  }, [duration, isVisible, persistent]);

  useEffect(() => {
    if (isVisible) return;
    const timer = setTimeout(() => onCloseRef.current(), 300);
    return () => clearTimeout(timer);
  }, [isVisible]);

  useEffect(() => {
    if (persistent) return;
    const raf = requestAnimationFrame(() => setProgress(0));
    return () => cancelAnimationFrame(raf);
  }, [persistent]);

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
    pending: {
      icon: Clock3,
      iconColor: 'text-brand',
      progressColor: '',
    },
    move: {
      icon: CheckCircle,
      iconColor: 'text-emerald-500',
      progressColor: 'bg-emerald-500',
    },
  };

  const style = variants[variant] || variants.info;
  const Icon = style.icon;

  return (
    <div
      className={cn(
        'relative overflow-hidden flex items-center gap-3 px-4 py-3 rounded-theme border border-theme shadow-theme-dropdown w-full',
        'bg-theme-secondary',
        'transition-[opacity,transform] duration-300 transform motion-reduce:transition-none',
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
      )}
    >
      {!persistent && (
        <div
          className={cn('absolute top-0 left-0 h-1', style.progressColor)}
          style={{
            width: `${progress}%`,
            transitionProperty: 'width',
            transitionTimingFunction: 'linear',
            transitionDuration: `${duration}ms`,
          }}
        />
      )}
      <Icon aria-hidden="true" size={20} className={cn('shrink-0', style.iconColor)} />
      <p className="text-sm text-theme-primary flex-1 min-w-0 break-words">{message}</p>
      {actionLabel && onAction && (
        <button
          onClick={() => {
            onAction();
            setIsVisible(false);
          }}
          className="shrink-0 text-brand hover:text-brand-hover font-medium text-sm transition-colors flex items-center gap-1"
        >
          <RotateCcw size={14} />
          {actionLabel}
        </button>
      )}
      <button
        type="button"
        aria-label="Закрыть уведомление"
        onClick={() => setIsVisible(false)}
        className={cn(
          'shrink-0 text-theme-muted hover:text-theme-primary transition-colors focus-visible:ring-2 focus-visible:ring-brand rounded-theme',
          persistent && 'grid min-h-11 min-w-11 place-items-center',
        )}
      >
        <X size={16} />
      </button>
    </div>
  );
};
