import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import DirectoryPage from './pages/DirectoryPage';
import FileViewPage from './pages/FileViewPage';
import SharedSettingsPage from './pages/SharedSettingsPage';
import InvitationsPage from './pages/InvitationsPage';
import FavoritesPage from './pages/FavoritesPage';
import TrashPage from './pages/TrashPage';
import SharePage from './pages/SharePage';
import ConvertPage from './pages/ConvertPage';
import './styles.css';

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        {/* Публичные маршруты */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/share/:token" element={<SharePage />} />

        {/* Защищённые маршруты */}
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/directories/:id" element={<DirectoryPage />} />
          <Route path="/files/:id" element={<FileViewPage />} />
          <Route path="/shared/:id/settings" element={<SharedSettingsPage />} />
          <Route path="/invitations" element={<InvitationsPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/trash" element={<TrashPage />} />
          <Route path="/files/:id/convert" element={<ConvertPage />} />
        </Route>

        {/* Редирект по умолчанию */}
        <Route path="*" element={<LoginPage />} />
      </Routes>
    </Router>
  );
};

export default App;