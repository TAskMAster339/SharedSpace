import React, { useEffect, useRef, useState } from 'react';
import { MoreVertical, Star, Trash2 } from 'lucide-react';
import { cn } from '../../utils/cn';

interface ItemActionsMenuProps {
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onDelete?: () => void;
  className?: string;
  iconSize?: number;
}

export const ItemActionsMenu: React.FC<ItemActionsMenuProps> = ({
  isFavorite = false,
  onToggleFavorite,
  onDelete,
  className,
  iconSize = 18,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [align, setAlign] = useState<'left' | 'right'>('right');
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Закрытие по клику вне меню (десктоп; на мобильном используется подложка)
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // На десктопе выбираем сторону раскрытия, чтобы меню не уехало за край экрана
  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const menuWidth = 192; // ширина меню (w-48)
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceOnLeft = rect.right;
    const spaceOnRight = window.innerWidth - rect.left;

    setAlign(spaceOnLeft < menuWidth && spaceOnRight >= menuWidth ? 'left' : 'right');
  }, [isOpen]);

  if (!onToggleFavorite && !onDelete) return null;

  const close = () => setIsOpen(false);

  const handleSelect = (e: React.MouseEvent, action: () => void) => {
    e.preventDefault();
    e.stopPropagation();
    action();
    close();
  };

  return (
    <div ref={containerRef} className={cn('relative inline-flex', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Открыть меню действий"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        className="p-2 -m-1 rounded-theme-sm text-theme-muted hover:text-theme-primary hover:bg-theme-hover transition-colors"
      >
        <MoreVertical size={iconSize} />
      </button>

      {isOpen && (
        <>
          {/* Затемнение фона на мобильных (bottom-sheet) */}
          <div
            className="fixed inset-0 z-40 bg-black/40 sm:hidden"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              close();
            }}
          />

          <div
            role="menu"
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'z-50 bg-theme-secondary shadow-theme-dropdown overflow-hidden',
              // Мобильный вид: выезжающая снизу панель на всю ширину
              'fixed inset-x-0 bottom-0 w-full rounded-t-theme-xl border-t border-theme pb-[env(safe-area-inset-bottom)]',
              // Десктопный вид: обычный выпадающий список
              'sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-full sm:mt-1 sm:w-48 sm:rounded-theme-md sm:border sm:pb-0',
              align === 'right' ? 'sm:right-0' : 'sm:left-0',
            )}
          >
            {/* Полоска-ручка для мобильной панели */}
            <div className="flex justify-center py-2 sm:hidden">
              <span className="h-1 w-10 rounded-full bg-theme-muted/40" />
            </div>

            <div className="py-1">
              {onToggleFavorite && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => handleSelect(e, onToggleFavorite)}
                  className="flex items-center gap-3 w-full px-4 py-3.5 text-base text-theme-secondary hover:bg-theme-hover transition-colors sm:px-3 sm:py-2 sm:text-sm"
                >
                  <Star
                    size={18}
                    className={isFavorite ? 'text-yellow-400' : 'text-theme-muted'}
                    fill={isFavorite ? 'currentColor' : 'none'}
                  />
                  {isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => handleSelect(e, onDelete)}
                  className="flex items-center gap-3 w-full px-4 py-3.5 text-base text-danger hover:bg-danger-light transition-colors sm:px-3 sm:py-2 sm:text-sm"
                >
                  <Trash2 size={18} />
                  Переместить в корзину
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
