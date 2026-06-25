import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { Footer } from './Footer';
import { ScrollToTopButton } from './ScrollToTopButton';
import { GlobalDropZone } from './GlobalDropZone';
import { ToastContainer } from './ui/ToastContainer';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';

interface LayoutProps {
  children?: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [mainEl, setMainEl] = useState<HTMLElement | null>(null);
  const { toasts, showToast, removeToast } = useToast();

  const handleFileUploaded = (file: File, success: boolean, message?: string) => {
    if (success && message) {
      showToast(message, 'success');
    } else if (!success && message) {
      showToast(message, 'error');
    }
  };

  return (
    <div className="h-screen bg-theme-primary flex flex-col">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        {isAuthenticated && <Sidebar />}

        {/* Основная область контента */}
        <GlobalDropZone onFileUploaded={handleFileUploaded}>
          <div className="flex-1 flex flex-col min-h-0">
            <main ref={setMainEl} className="flex-1 overflow-y-auto overflow-x-clip">
              <div className="max-w-6xl mx-auto p-4 sm:p-6">{children ? children : <Outlet />}</div>
            </main>
            {/* Footer теперь внутри GlobalDropZone и под main */}
            <Footer />
          </div>
        </GlobalDropZone>
      </div>

      <ScrollToTopButton scrollContainer={mainEl} />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
};
