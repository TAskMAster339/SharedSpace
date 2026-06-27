import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, Star, Trash2, Move } from 'lucide-react';
import { cn } from '../../utils/cn';

interface ItemActionsMenuProps {
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onDelete?: () => void;
  onMove?: () => void;
  className?: string;
  iconSize?: number;
}

const MENU_WIDTH = 192; // w-48
const MENU_HEIGHT_EST = 140;
const GAP = 4;
const EDGE = 8;

export const ItemActionsMenu: React.FC<ItemActionsMenuProps> = ({
  isFavorite = false,
  onToggleFavorite,
  onDelete,
  onMove,
  className,
  iconSize = 18,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; openUp: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Определяем мобильный режим (bottom-sheet) или десктопный (дропдаун)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Координаты дропдауна на десктопе: считаем от позиции триггера на экране
  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < MENU_HEIGHT_EST && rect.top > spaceBelow;

    // По умолчанию правый край меню совпадает с правым краем триггера
    let left = rect.right - MENU_WIDTH;
    if (left < EDGE) left = rect.left;
    if (left + MENU_WIDTH > window.innerWidth - EDGE) left = window.innerWidth - EDGE - MENU_WIDTH;

    const top = openUp ? rect.top - GAP : rect.bottom + GAP;
    setCoords({ top, left, openUp });
  }, []);

  useLayoutEffect(() => {
    if (isOpen && !isMobile) updatePosition();
  }, [isOpen, isMobile, updatePosition]);

  // Закрытие по клику вне меню/триггера
  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isOpen]);

  // На десктопе позиция фиксированная, поэтому при скролле/ресайзе просто закрываем меню
  useEffect(() => {
    if (!isOpen || isMobile) return;

    const close = () => setIsOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [isOpen, isMobile]);

  if (!onToggleFavorite && !onDelete && !onMove) return null;

  const close = () => setIsOpen(false);

  const handleSelect = (e: React.MouseEvent, action: () => void) => {
    e.preventDefault();
    e.stopPropagation();
    action();
    close();
  };

  const menuItems = (
    <div className="py-1">
      {onMove && (
        <button
          type="button"
          role="menuitem"
          onClick={(e) => handleSelect(e, onMove)}
          className="flex items-center gap-3 w-full px-4 py-3.5 text-base text-theme-secondary hover:bg-theme-hover transition-colors sm:px-3 sm:py-2 sm:text-sm"
        >
          <Move size={18} />
          Переместить файл
        </button>
      )}
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
  );

  return (
    <div className={cn('relative inline-flex', className)}>
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

      {isOpen &&
        createPortal(
          isMobile ? (
            <>
              <div
                className="fixed inset-0 z-[60] bg-black/40"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  close();
                }}
              />
              <div
                ref={menuRef}
                role="menu"
                onClick={(e) => e.stopPropagation()}
                className="fixed inset-x-0 bottom-0 z-[61] w-full rounded-t-theme-xl border-t border-theme bg-theme-secondary shadow-theme-dropdown overflow-hidden pb-[env(safe-area-inset-bottom)]"
              >
                <div className="flex justify-center py-2">
                  <span className="h-1 w-10 rounded-full bg-theme-muted/40" />
                </div>
                {menuItems}
              </div>
            </>
          ) : (
            <div
              ref={menuRef}
              role="menu"
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'fixed',
                top: coords?.top ?? 0,
                left: coords?.left ?? 0,
                width: MENU_WIDTH,
                transform: coords?.openUp ? 'translateY(-100%)' : undefined,
                visibility: coords ? 'visible' : 'hidden',
              }}
              className="z-[61] rounded-theme-md border border-theme bg-theme-secondary shadow-theme-dropdown overflow-hidden"
            >
              {menuItems}
            </div>
          ),
          document.body,
        )}
    </div>
  );
};
