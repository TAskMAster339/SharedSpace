import type { MouseEvent } from 'react';

export function preventModalContextMenu(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
}
