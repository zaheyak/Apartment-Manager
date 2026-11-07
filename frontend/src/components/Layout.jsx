import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../App.jsx';

const links = [
  ['/', 'לוח בקרה'],
  ['/apartments', 'דירות'],
  ['/reports', 'דוחות'],
  ['/settings', 'הגדרות'],
];

export default function Layout() {
  const { admin, logout } = useAuth();
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 right-0 z-20 hidden w-64 flex-col bg-slate-950 text-white md:flex">
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
          <button className="mt-3 text-teal-200" onClick={logout} type="button">יציאה</button>
        </div>
      </aside>
      <div className="md:mr-64">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-8">
            <div className="font-semibold md:hidden">ניהול דירות</div>
            <nav className="flex gap-2 overflow-auto text-sm md:hidden">
              {links.map(([to, label]) => (
                <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `rounded-full px-3 py-1 ${isActive ? 'bg-slate-950 text-white' : 'bg-slate-100'}`}>
                  {label}
                </NavLink>
              ))}
            </nav>
            <button className="text-sm text-slate-600 md:hidden" onClick={logout} type="button">יציאה</button>
          </div>
        </header>
        <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
