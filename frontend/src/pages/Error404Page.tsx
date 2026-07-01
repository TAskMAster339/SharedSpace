import React from 'react';
import { Link } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import SEOHead from '../components/SEOHead';

const Error404Page: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <SEOHead
        title="Страница не найдена"
        description="Страница, которую вы ищете, не существует или была удалена."
      />
      <div className="flex flex-col items-center gap-6 text-center">
        <FileQuestion size={64} className="text-theme-muted" />

        <h1 className="text-[8rem] sm:text-[10rem] md:text-[12rem] font-bold leading-none tracking-tighter">
          <span className="text-brand-dark dark:text-brand">4</span>
          <span className="text-brand">0</span>
          <span className="text-brand-dark dark:text-brand">4</span>
        </h1>

        <p className="text-lg sm:text-xl text-theme-muted font-medium -mt-4">Страница не найдена</p>

        <Link
          to="/dashboard"
          className="mt-2 px-6 py-2.5 bg-brand text-theme-on-brand rounded-theme-md font-medium hover:bg-brand-hover transition-colors"
        >
          На главную
        </Link>
      </div>
    </div>
  );
};

export default Error404Page;
