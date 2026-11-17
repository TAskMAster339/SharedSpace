import React, { useEffect, useId, useLayoutEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../utils/cn';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showCloseButton?: boolean;
  native?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'md',
  className,
  showCloseButton = true,
  native = false,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (native && isOpen && dialog && !dialog.open) {
      dialog.showModal();
    }
  }, [isOpen, native]);

  useEffect(() => {
    if (native) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, native, onClose]);

  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

  const panelClassName = cn(
    'bg-theme-secondary rounded-theme-xl shadow-theme-dropdown border border-theme max-h-[90vh] flex-col',
    maxWidthClasses[maxWidth],
    className,
  );
  const content = (
    <>
      <div
        className={`flex items-center px-6 py-4 border-b border-theme shrink-0 ${showCloseButton ? 'justify-between' : 'justify-center'}`}
      >
        <h2 id={titleId} className="text-lg font-semibold text-theme-primary">
          {title}
        </h2>
        {showCloseButton && (
          <button
            type="button"
            aria-label="Закрыть"
            onClick={() => (native ? dialogRef.current?.close() : onClose())}
            className="p-1 rounded-theme-full hover:bg-theme-hover transition-colors group"
          >
            <X
              size={20}
              className="text-theme-secondary group-hover:text-brand transition-colors"
            />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">{children}</div>
    </>
  );

  if (native) {
    return (
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        {...{ closedby: 'any' }}
        onClose={onClose}
        className={cn(
          panelClassName,
          'm-auto w-[calc(100%_-_2rem)] p-0 open:flex overscroll-contain backdrop:bg-black/50 backdrop:backdrop-blur-sm backdrop:overflow-hidden backdrop:overscroll-contain',
        )}
      >
        {content}
      </dialog>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={cn('relative flex w-full', panelClassName)}>{content}</div>
    </div>
  );
};
