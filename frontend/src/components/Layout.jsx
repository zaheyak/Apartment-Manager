import { NavLink, Outlet } from 'react-router-dom';
import { useAuth, useTheme } from '../App.jsx';

const links = [
  ['/', 'לוח בקרה'],
  ['/apartments', 'דירות'],
  ['/reports', 'דוחות'],
  ['/settings', 'הגדרות'],
];

function ThemeButton({ compact = false }) {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={dark ? 'מעבר למצב בהיר' : 'מעבר למצב כהה'}
      className="rounded-xl border border-current/20 px-3 py-2 text-sm transition hover:bg-white/10"
    >
      <span aria-hidden="true">{dark ? '☀' : '☾'}</span>{!compact && <span className="mr-2">{dark ? 'מצב בהיר' : 'מצב כהה'}</span>}
    </button>
  );
}

export default function Layout() {
  const { admin, logout } = useAuth();
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 right-0 z-20 hidden w-64 flex-col bg-slate-950 text-white lg:flex">
        <div className="border-b border-white/10 px-6 py-6">
          <div className="text-xs text-teal-200">מערכת ניהול</div>
          <div className="mt-1 text-2xl font-semibold">ניהול דירות</div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-4">
          {links.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `rounded-xl px-4 py-3 text-sm ${isActive ? 'bg-white text-slate-950' : 'text-slate-200 hover:bg-white/10'}`}
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4 text-sm">
          <div className="font-medium">{admin?.fullName}</div>
          <div className="mt-1 text-slate-400">{admin?.username}</div>
          <div className="mt-4 flex items-center justify-between gap-2">
            <ThemeButton />
            <button className="text-teal-200" onClick={logout} type="button">יציאה</button>
          </div>
        </div>
      </aside>
      <div className="lg:mr-64">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:hidden">
            <div className="font-semibold">ניהול דירות</div>
            <div className="flex items-center gap-2">
              <ThemeButton compact />
              <button className="text-sm text-slate-600" onClick={logout} type="button">יציאה</button>
            </div>
            <nav className="order-last flex w-full gap-2 overflow-x-auto pb-1 text-sm">
              {links.map(([to, label]) => (
                <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `rounded-full px-3 py-1 ${isActive ? 'bg-slate-950 text-white' : 'bg-slate-100'}`}>
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
