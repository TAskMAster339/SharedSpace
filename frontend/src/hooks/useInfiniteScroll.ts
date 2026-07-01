import { useEffect, useRef } from 'react';

export function useInfiniteScroll(
  onLoadMore: () => void,
  active: boolean = true,
  threshold: number = 300,
) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onLoadMore);
  const activeRef = useRef(active);
  const loadingRef = useRef(false);
  callbackRef.current = onLoadMore;
  activeRef.current = active;

  // Когда active становится true (загрузка завершена), разрешаем следующую
  if (active) {
    loadingRef.current = false;
  }

  useEffect(() => {
    const checkAndLoad = () => {
      if (!activeRef.current || loadingRef.current) return;
      const el = sentinelRef.current;
      if (el && el.getBoundingClientRect().top < window.innerHeight + threshold) {
        loadingRef.current = true;
        callbackRef.current();
      }
    };

    window.addEventListener('scroll', checkAndLoad, { passive: true });
    window.addEventListener('resize', checkAndLoad, { passive: true });
    checkAndLoad();
    return () => {
      window.removeEventListener('scroll', checkAndLoad);
      window.removeEventListener('resize', checkAndLoad);
    };
  }, [threshold, active]);

  return { sentinelRef };
}
