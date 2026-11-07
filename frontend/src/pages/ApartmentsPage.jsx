import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Alert, Badge, Button, Card, Field, TextInput } from '../components/ui.jsx';
import { formatMoney } from '../format.js';

const emptyTenant = {
  fullName: '',
  phone: '',
  monthlyRent: '',
  startDate: '',
  endDate: '',
  notes: '',
};

export default function ApartmentsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [withTenant, setWithTenant] = useState(false);
  const [form, setForm] = useState({ number: '', floor: '', notes: '', tenant: emptyTenant });

  function load() {
    api('/api/apartments').then(setRows).catch((err) => setError(err.message));
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const needle = query.trim();
    if (!needle) return rows;
    return rows.filter((row) => `${row.number} ${row.tenantName || ''} ${row.floor || ''}`.includes(needle));
  }, [rows, query]);

  async function createApartment(event) {
    event.preventDefault();
    setError('');
    const payload = { number: form.number, floor: form.floor, notes: form.notes };
    if (withTenant) {
      payload.tenant = {
        ...form.tenant,
        monthlyRent: Number(form.tenant.monthlyRent),
        endDate: form.tenant.endDate || null,
      };
    }
    try {
      const created = await api('/api/apartments', { method: 'POST', body: JSON.stringify(payload) });
      navigate(`/apartments/${created.id}`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">דירות</h1>
          <p className="text-sm text-slate-500">כל דירה נפתחת לדף ניהול נפרד.</p>
        </div>
        <Button onClick={() => setOpen((value) => !value)}>{open ? 'סגירה' : 'דירה חדשה'}</Button>
      </div>
      <Alert>{error}</Alert>
      {open && (
        <Card title="הוספת דירה">
          <form className="grid gap-4 md:grid-cols-3" onSubmit={createApartment}>
            <Field label="מספר דירה"><TextInput value={form.number} onChange={(event) => setForm({ ...form, number: event.target.value })} required /></Field>
            <Field label="קומה"><TextInput value={form.floor} onChange={(event) => setForm({ ...form, floor: event.target.value })} /></Field>
            <Field label="הערות"><TextInput value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm md:col-span-3">
              <input type="checkbox" checked={withTenant} onChange={(event) => setWithTenant(event.target.checked)} />
              לשייך דייר כבר עכשיו
            </label>
            {withTenant && (
              <>
                <Field label="שם הדייר"><TextInput value={form.tenant.fullName} onChange={(event) => setForm({ ...form, tenant: { ...form.tenant, fullName: event.target.value } })} required /></Field>
                <Field label="טלפון"><TextInput dir="ltr" value={form.tenant.phone} onChange={(event) => setForm({ ...form, tenant: { ...form.tenant, phone: event.target.value } })} /></Field>
                <Field label="שכר דירה חודשי"><TextInput dir="ltr" type="number" min="0" step="0.01" value={form.tenant.monthlyRent} onChange={(event) => setForm({ ...form, tenant: { ...form.tenant, monthlyRent: event.target.value } })} required /></Field>
                <Field label="תחילת שכירות"><TextInput dir="ltr" type="date" value={form.tenant.startDate} onChange={(event) => setForm({ ...form, tenant: { ...form.tenant, startDate: event.target.value } })} required /></Field>
                <Field label="סיום שכירות"><TextInput dir="ltr" type="date" value={form.tenant.endDate} onChange={(event) => setForm({ ...form, tenant: { ...form.tenant, endDate: event.target.value } })} /></Field>
              </>
            )}
            <div className="md:col-span-3"><Button>שמירה ופתיחת הדירה</Button></div>
          </form>
        </Card>
      )}
      <TextInput placeholder="חיפוש לפי מספר דירה או שם דייר" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="grid gap-4 md:grid-cols-2">
        {filtered.map((row) => (
          <Link key={row.id} to={`/apartments/${row.id}`} className="rounded-2xl bg-white p-5 shadow-sm hover:ring-2 hover:ring-teal-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">דירה {row.number}</h2>
                <p className="text-sm text-slate-500">{row.floor ? `קומה ${row.floor}` : 'קומה לא צוינה'} · {row.tenantName || 'ללא דייר'}</p>
              </div>
              <Badge status={row.status} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-slate-500">שכר דירה</div><div className="font-medium">{row.monthlyRent ? formatMoney(row.monthlyRent) : '—'}</div></div>
              <div><div className="text-slate-500">יתרה</div><div className="font-medium">{formatMoney(row.outstanding)}</div></div>
            </div>
          </Link>
        ))}
      </div>
      {filtered.length === 0 && <p className="text-sm text-slate-500">אין דירות להצגה.</p>}
    </div>
  );
}
