import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface ContextMenuProps {
  isOpen: boolean;
  onClose: () => void;
  position: { x: number; y: number } | null;
  children: React.ReactNode;
  width?: number;
  trigger?: HTMLElement | null;
}

const MENU_WIDTH = 224;
const EDGE = 8;

export const ContextMenu: React.FC<ContextMenuProps> = ({
  isOpen,
  onClose,
  position,
  children,
  width = MENU_WIDTH,
  trigger,
}) => {
  const [isMobile, setIsMobile] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedY, setAdjustedY] = useState<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || isMobile) return;

    const close = (event: Event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      onClose();
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [isOpen, isMobile, onClose]);

  useLayoutEffect(() => {
    if (!isOpen || !position || isMobile || !menuRef.current) {
      setAdjustedY(null);
      return;
    }

    const menuHeight = menuRef.current.offsetHeight;
    if (menuHeight === 0) return;

    const spaceBelow = window.innerHeight - position.y - EDGE;

    let y = position.y;

    if (spaceBelow < menuHeight) {
      const spaceAbove = position.y - EDGE;
      if (spaceAbove >= menuHeight) {
        y = position.y - menuHeight;
      } else {
        y = Math.max(EDGE, window.innerHeight - menuHeight - EDGE);
      }
    }

    y = Math.max(EDGE, y);
    setAdjustedY(y);
  }, [isOpen, position, isMobile]);

  useLayoutEffect(() => {
    if (isOpen && position && trigger) {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"], button')?.focus({
        preventScroll: true,
      });
    }
  }, [isOpen, position, isMobile, trigger]);

  const handleKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!trigger) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      trigger.focus({ preventScroll: true });
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const items = Array.from(
        event.currentTarget.querySelectorAll<HTMLElement>(
          '[role="menuitem"]:not(:disabled), button:not(:disabled)',
        ),
      );
      const current = items.indexOf(document.activeElement as HTMLElement);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(current + step + items.length) % items.length]?.focus({ preventScroll: true });
    }
  };

  if (!isOpen || !position) return null;

  const clampedX = Math.max(EDGE, Math.min(position.x, window.innerWidth - width - EDGE));
  const displayY = adjustedY !== null ? adjustedY : Math.min(position.y, window.innerHeight - EDGE);

  return createPortal(
    isMobile ? (
      <>
        <div
          className="fixed inset-0 z-[60] bg-black/40"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }}
        />
        <div
          ref={menuRef}
          role="menu"
          onKeyDown={handleKeys}
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-x-0 bottom-0 z-[61] w-full rounded-t-theme border-t border-theme bg-theme-secondary shadow-theme-dropdown max-h-[90dvh] overflow-y-auto pb-[env(safe-area-inset-bottom)]"
        >
          <div className="flex justify-center pt-1 pb-0.5">
            <span className="h-1 w-10 rounded-theme bg-theme-muted/40" />
          </div>
          {children}
        </div>
      </>
    ) : (
      <div
        ref={menuRef}
        role="menu"
        onKeyDown={handleKeys}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: displayY,
          left: clampedX,
          width,
          zIndex: 61,
        }}
        className="rounded-theme border border-theme bg-theme-secondary shadow-theme-dropdown max-h-[calc(100dvh_-_1rem)] overflow-y-auto"
      >
        {children}
      </div>
    ),
    document.body,
  );
};
