import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface ContextMenuProps {
  isOpen: boolean;
  onClose: () => void;
  position: { x: number; y: number } | null;
  children: React.ReactNode;
  width?: number;
}

const MENU_WIDTH = 224;
const EDGE = 8;

export const ContextMenu: React.FC<ContextMenuProps> = ({
  isOpen,
  onClose,
  position,
  children,
  width = MENU_WIDTH,
}) => {
  const [isMobile, setIsMobile] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

    const close = () => onClose();
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [isOpen, isMobile, onClose]);

  if (!isOpen || !position) return null;

  const clampedX = Math.min(position.x, window.innerWidth - width - EDGE);
  const clampedY = Math.min(position.y, window.innerHeight - EDGE);

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
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-x-0 bottom-0 z-[61] w-full rounded-t-theme-xl border-t border-theme bg-theme-secondary shadow-theme-dropdown overflow-hidden pb-[env(safe-area-inset-bottom)]"
        >
          <div className="flex justify-center py-2">
            <span className="h-1 w-10 rounded-full bg-theme-muted/40" />
          </div>
          {children}
        </div>
      </>
    ) : (
      <div
        ref={menuRef}
        role="menu"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: clampedY,
          left: clampedX,
          width,
          zIndex: 61,
        }}
        className="rounded-theme-md border border-theme bg-theme-secondary shadow-theme-dropdown overflow-hidden"
      >
        {children}
      </div>
    ),
    document.body,
  );
};
