import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { Layout } from './components/Layout';
import { DropZoneWrapper } from './components/DropZoneWrapper';
import ProtectedRoute from './components/ProtectedRoute';
import PublicRoute from './components/PublicRoute';
import EmailVerificationModal from './components/EmailVerificationModal';
import MainPage from './pages/MainPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import DashboardPage from './pages/DashboardPage';
import ProfileSettingsPage from './pages/ProfileSettingsPage';
import SharedDirListPage from './pages/SharedDirListPage';
import DirectoryPage from './pages/DirectoryPage';
import FileViewPage from './pages/FileViewPage';
import SharedSettingsPage from './pages/SharedSettingsPage';
import FolderSettingsPage from './pages/FolderSettingsPage';
import InvitationsPage from './pages/InvitationsPage';
import FavoritesPage from './pages/FavoritesPage';
import MyLinksPage from './pages/MyLinksPage';
import TrashPage from './pages/TrashPage';
import SharePage from './pages/SharePage';
import SharedDirectoryPage from './pages/SharedDirectoryPage';
import Error404Page from './pages/Error404Page';
import './styles.css';

const App: React.FC = () => {
  const hydrate = useAuthStore((state) => state.hydrate);
  const isHydrating = useAuthStore((state) => state.isHydrating);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (isHydrating) {
    return null;
  }

  return (
    <Router>
      <Routes>
        {/* Публичные маршруты */}
        <Route
          path="/"
          element={
            <Layout>
              <MainPage />
            </Layout>
          }
        />
        <Route
          path="/share/:token"
          element={
            <Layout>
              <SharePage />
            </Layout>
          }
        />
        <Route
          path="/share/dir/:token"
          element={
            <Layout>
              <SharedDirectoryPage />
            </Layout>
          }
        />
        {/* Подтверждение почты и сброс пароля — публичные, открываются по
            ссылке из письма. Не обёрнуты в PublicRoute, чтобы работать и для
            залогиненных, и для незалогиненных пользователей. */}
        <Route
          path="/verify-email/:token"
          element={
            <Layout>
              <VerifyEmailPage />
            </Layout>
          }
        />
        <Route
          path="/reset-password/:token"
          element={
            <Layout>
              <ResetPasswordPage />
            </Layout>
          }
        />

        {/* Только гостевые маршруты */}
        <Route
          element={
            <PublicRoute>
              <Layout />
            </PublicRoute>
          }
        >
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        </Route>

        {/* Защищённые маршруты */}
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          {/* Страницы с DropZone */}
          <Route
            path="/dashboard"
            element={
              <DropZoneWrapper>
                <DashboardPage />
              </DropZoneWrapper>
            }
          />
          <Route
            path="/directories/:id"
            element={
              <DropZoneWrapper>
                <DirectoryPage />
              </DropZoneWrapper>
            }
          />
          <Route
            path="/favorites"
            element={
              <DropZoneWrapper>
                <FavoritesPage />
              </DropZoneWrapper>
            }
          />

          {/* Страницы без DropZone */}
          <Route path="/settings" element={<ProfileSettingsPage />} />
          <Route path="/directories" element={<SharedDirListPage />} />
          <Route path="/directories/:id/settings" element={<FolderSettingsPage />} />
          <Route path="/files/:id" element={<FileViewPage />} />
          <Route path="/shared/:id/settings" element={<SharedSettingsPage />} />
          <Route path="/links" element={<MyLinksPage />} />
          <Route path="/invitations" element={<InvitationsPage />} />
          <Route path="/trash" element={<TrashPage />} />
        </Route>

        {/* 404 без DropZone */}
        <Route
          path="*"
          element={
            <Layout>
              <Error404Page />
            </Layout>
          }
        />
      </Routes>

      {/* Глобальный модал подтверждения почты. Рендерится поверх всего UI
          для аутентифицированных, но не активированных пользователей.
          Не-dismissable — блокирует взаимодействие с приложением до тех пор,
          пока пользователь не подтвердит почту (по ссылке из письма) или не
          выйдет из аккаунта. */}
      <EmailVerificationModal />
    </Router>
  );
};

export default App;
