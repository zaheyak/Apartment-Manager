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
const ThemeContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function useTheme() {
  return useContext(ThemeContext);
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
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

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

  const themeValue = useMemo(() => ({
    theme,
    toggleTheme() {
      setTheme((current) => current === 'dark' ? 'light' : 'dark');
    },
  }), [theme]);

  return (
    <ThemeContext.Provider value={themeValue}>
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
    </ThemeContext.Provider>
  );
}
