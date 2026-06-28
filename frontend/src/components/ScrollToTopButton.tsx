import React, { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { cn } from '../utils/cn';

const SHOW_AFTER_PX = 300;
const FOOTER_BUFFER = 100;

export const ScrollToTopButton: React.FC = () => {
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
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Наверх"
      className={cn(
        'fixed right-6 z-40 w-11 h-11 flex items-center justify-center rounded-theme-full bg-brand text-theme-on-brand shadow-theme-dropdown hover:bg-brand-hover transition-all duration-200 animate-in fade-in',
        nearBottom ? 'bottom-24' : 'bottom-6',
      )}
    >
      <ArrowUp size={20} />
    </button>
  );
};
