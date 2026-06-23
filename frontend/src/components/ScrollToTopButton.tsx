import React, { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

interface ScrollToTopButtonProps {
  scrollContainer: HTMLElement | null;
}

const SHOW_AFTER_PX = 300;

export const ScrollToTopButton: React.FC<ScrollToTopButtonProps> = ({ scrollContainer }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!scrollContainer) {
      return;
    }
    const handleScroll = () => {
      setVisible(scrollContainer.scrollTop > SHOW_AFTER_PX);
    };
    handleScroll();
    scrollContainer.addEventListener('scroll', handleScroll);
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, [scrollContainer]);

  if (!visible) {
    return null;
  }

  return (
    <button
      onClick={() => scrollContainer?.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Наверх"
      className="fixed bottom-6 right-6 z-40 w-11 h-11 flex items-center justify-center rounded-theme-full bg-brand text-theme-on-brand shadow-theme-dropdown hover:bg-brand-hover transition-colors animate-in fade-in"
    >
      <ArrowUp size={20} />
    </button>
  );
};
