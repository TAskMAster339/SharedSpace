import React, { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { useToastStore } from '../hooks/useToast';

const SHOW_AFTER_PX = 300;
const FOOTER_BUFFER = 100;

export const ScrollToTopButton: React.FC = () => {
  const playerOffset = useToastStore((state) => state.toastDesktopBottomPx);
  const toastOffset = useToastStore((state) => state.toastDesktopTopOffsetPx);
  const [visible, setVisible] = useState(false);
  const [nearBottom, setNearBottom] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const viewport = window.innerHeight;
      const docHeight = document.documentElement.scrollHeight;
      setVisible(scrollY > SHOW_AFTER_PX);
      setNearBottom(scrollY + viewport >= docHeight - FOOTER_BUFFER);
    };

    handleScroll();

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <button
      onClick={() =>
        window.scrollTo({
          top: 0,
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
        })
      }
      aria-label="Наверх"
      style={{ bottom: Math.max(nearBottom ? 96 : 24, playerOffset, toastOffset) }}
      className="fixed right-6 z-40 hidden size-11 items-center justify-center rounded-theme bg-brand text-theme-on-brand shadow-theme-dropdown hover:bg-brand-hover motion-safe:transition-colors md:flex"
    >
      <ArrowUp size={20} />
    </button>
  );
};
