import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { cn } from '../../utils/cn';

export type ConfirmModalVariant = 'danger' | 'warning' | 'info';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  variant?: ConfirmModalVariant;
  confirmLabel?: string;
  cancelLabel?: string;
  showCancel?: boolean;
  isConfirming?: boolean;
  error?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

const variantStyles: Record<ConfirmModalVariant, {
  iconBg: string;
  iconColor: string;
  buttonVariant: 'danger' | 'primary' | 'secondary';
}> = {
  danger: {
    iconBg: 'bg-danger-light/20',
    iconColor: 'text-danger',
    buttonVariant: 'danger',
  },
  warning: {
    iconBg: 'bg-warning/20',
    iconColor: 'text-warning',
    buttonVariant: 'primary',
  },
  info: {
    iconBg: 'bg-brand-light/20',
    iconColor: 'text-brand',
    buttonVariant: 'primary',
  },
};

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  variant = 'danger',
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  showCancel = true,
  isConfirming = false,
  error,
  icon,
  children,
}) => {
  if (!isOpen) return null;

  const styles = variantStyles[variant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={showCancel ? onClose : undefined}
      />
      <div className="relative bg-theme-secondary rounded-theme-xl max-w-md w-full p-6 shadow-theme-dropdown border border-theme">
        <div className="flex items-center gap-3 mb-4">
          <div className={cn('p-3 rounded-theme-full', styles.iconBg, styles.iconColor)}>
            {icon || <AlertTriangle size={24} />}
          </div>
          <div className="flex-1">{children}</div>
        </div>

        {error && <p className="text-danger text-sm mb-4">{error}</p>}

        <div className={cn('flex gap-3', !showCancel && 'justify-end')}>
          {showCancel && (
            <Button
              variant="secondary"
              onClick={onClose}
              disabled={isConfirming}
              className="flex-1"
            >
              {cancelLabel}
            </Button>
          )}
          <Button
            variant={styles.buttonVariant}
            onClick={onConfirm}
            disabled={isConfirming}
            className={cn(showCancel ? 'flex-1' : '')}
          >
            {isConfirming ? 'Загрузка...' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};