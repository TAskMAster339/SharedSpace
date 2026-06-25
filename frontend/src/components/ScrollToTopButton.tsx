import React, { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

const SHOW_AFTER_PX = 300;

export const ScrollToTopButton: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > SHOW_AFTER_PX);
    };

    // Проверяем при первом рендере
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
      className="fixed bottom-6 right-6 z-40 w-11 h-11 flex items-center justify-center rounded-theme-full bg-brand text-theme-on-brand shadow-theme-dropdown hover:bg-brand-hover transition-colors animate-in fade-in"
    >
      <ArrowUp size={20} />
    </button>
  );
};
