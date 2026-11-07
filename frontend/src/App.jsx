import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api } from './api.js';
import Layout from './components/Layout.jsx';
import ApartmentPage from './pages/ApartmentPage.jsx';
import ApartmentsPage from './pages/ApartmentsPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

function Protected({ children }) {
  const { admin, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <div className="p-8 text-center">טוען...</div>;
  if (!admin) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

export default function App() {
  const [admin, setAdmin] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setReady(true);
      return;
    }
    api('/api/auth/me')
      .then(setAdmin)
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setReady(true));
  }, []);

  const value = useMemo(() => ({
    admin,
    ready,
    async login(username, password) {
      const result = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      localStorage.setItem('token', result.token);
      setAdmin(result.admin);
    },
    logout() {
      localStorage.removeItem('token');
      setAdmin(null);
    },
  }), [admin, ready]);

  return (
    <AuthContext.Provider value={value}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Protected><Layout /></Protected>}>
          <Route index element={<DashboardPage />} />
          <Route path="apartments" element={<ApartmentsPage />} />
          <Route path="apartments/:id" element={<ApartmentPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthContext.Provider>
  );
}
