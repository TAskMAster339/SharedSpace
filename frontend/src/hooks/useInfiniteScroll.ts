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

    const fillViewport = () => {
      if (!activeRef.current || loadingRef.current) return;
      if (document.documentElement.scrollHeight <= window.innerHeight + threshold) {
        loadingRef.current = true;
        callbackRef.current();
      }
    };

    const onScroll = checkAndLoad;
    const onResize = () => {
      checkAndLoad();
      fillViewport();
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    checkAndLoad();
    fillViewport();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [threshold, active]);

  return { sentinelRef };
}
