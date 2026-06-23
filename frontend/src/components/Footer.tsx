import React from 'react';
import { Link } from 'react-router-dom';
import { GitFork } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

const logo = '/logo-mark.png';

const GITHUB_URL = 'https://github.com/TAskMAster339/SharedSpace';

export const Footer: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-theme mt-4">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Авторизованного ведём в дашборд, а не на лендинг — как в Header. */}
        <Link
          to={isAuthenticated ? '/dashboard' : '/'}
          className="flex items-center gap-2 cursor-pointer"
        >
          <img
            src={logo}
            alt="SharedSpace"
            className="w-7 h-7 rounded-theme-sm shadow-theme-card"
          />
          <span className="text-sm font-semibold tracking-tight">
            <span className="text-brand-dark dark:text-brand">Shared</span>
            <span className="text-brand">Space</span>
          </span>
        </Link>

        <p className="text-sm text-theme-muted text-center">
          © {year} SharedSpace. Учебный проект.
        </p>

        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm font-medium text-theme-secondary hover:text-theme-primary transition-colors"
        >
          <GitFork size={16} />
          GitHub
        </a>
      </div>
    </footer>
  );
};
