import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import PublicRoute from './components/PublicRoute';
import MainPage from './pages/MainPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import ProfileSettingsPage from './pages/ProfileSettingsPage';
import SharedDirListPage from './pages/SharedDirListPage';
import DirectoryPage from './pages/DirectoryPage';
import FileViewPage from './pages/FileViewPage';
import SharedSettingsPage from './pages/SharedSettingsPage';
import InvitationsPage from './pages/InvitationsPage';
import FavoritesPage from './pages/FavoritesPage';
import TrashPage from './pages/TrashPage';
import SharePage from './pages/SharePage';
import ConvertPage from './pages/ConvertPage';
import Error404Page from './pages/Error404Page';
import './styles.css';

const App: React.FC = () => {
  return (
    <AuthProvider>
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
          </Route>

          {/* Защищённые маршруты */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/settings" element={<ProfileSettingsPage />} />
            <Route path="/directories" element={<SharedDirListPage />} />
            <Route path="/directories/:id" element={<DirectoryPage />} />
            <Route path="/files/:id" element={<FileViewPage />} />
            <Route path="/shared/:id/settings" element={<SharedSettingsPage />} />
            <Route path="/invitations" element={<InvitationsPage />} />
            <Route path="/favorites" element={<FavoritesPage />} />
            <Route path="/trash" element={<TrashPage />} />
            <Route path="/files/:id/convert" element={<ConvertPage />} />
          </Route>

          {/* Редирект по умолчанию */}
          <Route
            path="*"
            element={
              <Layout>
                <Error404Page />
              </Layout>
            }
          />
        </Routes>
      </Router>
    </AuthProvider>
  );
};

export default App;
