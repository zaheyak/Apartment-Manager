import { STATUS_LABELS, statusClass } from '../format.js';

export function Button({ variant = 'primary', className = '', ...props }) {
  const styles = {
    primary: 'bg-teal-700 text-white hover:bg-teal-800',
    secondary: 'bg-white text-slate-800 border border-slate-200 hover:bg-slate-50',
    danger: 'bg-rose-700 text-white hover:bg-rose-800',
    ghost: 'text-teal-800 hover:bg-teal-50',
  };
  return (
    <button
      className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    />
  );
}

export function Field({ label, children }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

export const controlClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100';

export function TextInput(props) {
  return <input className={controlClass} {...props} />;
}

export function Select(props) {
  return <select className={controlClass} {...props} />;
}

export function TextArea(props) {
  return <textarea className={controlClass} rows={3} {...props} />;
}

export function Badge({ status }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(status)}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export function Card({ title, action, children, className = '' }) {
  return (
    <section className={`rounded-2xl bg-white p-5 shadow-sm ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Alert({ children }) {
  if (!children) return null;
  return <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{children}</div>;
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/50 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100" onClick={onClose} type="button">סגירה</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Stat({ label, value, hint }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}
