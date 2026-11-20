import { useSyncExternalStore } from 'react';

const phoneQuery = '(max-width: 640px)';

function subscribe(notify: () => void) {
  const media = window.matchMedia?.(phoneQuery);
  media?.addEventListener('change', notify);
  return () => media?.removeEventListener('change', notify);
}

function getSnapshot() {
  return window.matchMedia?.(phoneQuery).matches ?? false;
}

export function usePhoneViewport() {
  return useSyncExternalStore(subscribe, getSnapshot);
}
