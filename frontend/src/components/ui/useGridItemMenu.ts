import { useEffect, useRef, useState } from 'react';

export function useGridItemMenu(onContextMenu?: (event: React.MouseEvent) => void) {
  const anchor = useRef<HTMLAnchorElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const pendingOpen = useRef<ReturnType<typeof setTimeout>>();
  const start = useRef<{ x: number; y: number; at: number }>();
  const longPressed = useRef(false);

  useEffect(() => () => clearTimeout(pendingOpen.current), []);

  function requestMenu(target: HTMLElement, x: number, y: number) {
    target.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }),
    );
  }

  return {
    anchor,
    position,
    close: () => setPosition(null),
    consumeLongPress: () => {
      const pressed = longPressed.current;
      longPressed.current = false;
      return pressed;
    },
    handlers: {
      onContextMenu: (event: React.MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault();
        event.stopPropagation();
        if (start.current) return;
        if (onContextMenu) {
          onContextMenu(event);
        } else {
          setPosition({ x: event.clientX, y: event.clientY });
        }
      },
      onKeyDown: (event: React.KeyboardEvent<HTMLAnchorElement>) => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          requestMenu(event.currentTarget, rect.left, rect.bottom);
        }
      },
      onPointerDown: (event: React.PointerEvent<HTMLAnchorElement>) => {
        longPressed.current = false;
        if (event.pointerType === 'touch') {
          start.current = { x: event.clientX, y: event.clientY, at: performance.now() };
        }
      },
      onPointerMove: (event: React.PointerEvent<HTMLAnchorElement>) => {
        if (
          start.current &&
          Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 10
        ) {
          start.current = undefined;
        }
      },
      onPointerUp: (event: React.PointerEvent<HTMLAnchorElement>) => {
        const gesture = start.current;
        start.current = undefined;
        if (!gesture || performance.now() - gesture.at < 550) return;
        longPressed.current = true;
        const { currentTarget, clientX, clientY } = event;
        // Let the release click finish before placing menu actions under the pointer.
        pendingOpen.current = setTimeout(() => requestMenu(currentTarget, clientX, clientY));
      },
      onPointerCancel: () => {
        start.current = undefined;
      },
      onPointerLeave: () => {
        start.current = undefined;
      },
    },
  };
}
