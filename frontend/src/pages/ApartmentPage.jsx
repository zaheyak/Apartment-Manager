import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, downloadFile } from '../api.js';
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Modal,
  Select,
  Stat,
  TextArea,
  TextInput,
} from '../components/ui.jsx';
import {
  CATEGORY_LABELS,
  METHOD_LABELS,
  MONTHS,
  STATUS_LABELS,
  formatDate,
  formatMoney,
  formatQty,
  monthLabel,
} from '../format.js';

const today = new Date().toISOString().slice(0, 10);
const now = new Date();
const emptyLease = {
  fullName: '',
  phone: '',
  monthlyRent: '',
  startDate: today,
  endDate: '',
  notes: '',
};

function Detail({ label, value }) {
  return <div><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-medium">{value || '—'}</div></div>;
}

function ChargeBlock({ title, charge, unit }) {
  if (!charge) return null;
  return (
    <div className="rounded-xl border border-slate-100 p-3 text-sm">
      <div className="mb-2 flex items-center justify-between"><strong>{title}</strong><Badge status={charge.status} /></div>
      {charge.previousReading != null && (
        <div className="mb-2 grid grid-cols-2 gap-2 text-xs text-slate-500 sm:grid-cols-4">
          <span>קודם: {formatQty(charge.previousReading)}</span>
          <span>נוכחי: {formatQty(charge.currentReading)}</span>
          <span>צריכה: {formatQty(charge.consumption)} {unit}</span>
          <span>כפול: {formatMoney(charge.tariffPrice)}</span>
        </div>
      )}
      {charge.consumption != null && <div className="mb-2 text-xs text-slate-500">{formatQty(charge.consumption)} × {formatMoney(charge.tariffPrice)} = {formatMoney(charge.amountDue)}</div>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3"><span>חיוב {formatMoney(charge.amountDue)}</span><span>שולם {formatMoney(charge.amountPaid)}</span><span>יתרה {formatMoney(charge.remaining)}</span></div>
      {charge.paymentDetails?.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-500">
          {charge.paymentDetails.map((payment) => (
            <div key={`${payment.paymentId}-${payment.amount}`} className="flex flex-wrap justify-between gap-2">
              <span>{formatDate(payment.paymentDate)} · {METHOD_LABELS[payment.method]}</span>
              <strong>{formatMoney(payment.amount)}</strong>
            </div>
          ))}
        </div>
      )}
      {charge.paidThroughDate && <div className="mt-1 text-xs text-slate-500">שולם עד {formatDate(charge.paidThroughDate)}</div>}
    </div>
  );
}

function MonthForm({ apartmentId, onDone }) {
  const [form, setForm] = useState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    rentAmount: '',
    electricityPrevious: '',
    electricityCurrent: '',
    electricityTariff: '',
    waterPrevious: '',
    waterCurrent: '',
    waterTariff: '',
  });
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/api/apartments/${apartmentId}/reading-preview?year=${form.year}&month=${form.month}`)
      .then((data) => {
        setPreview(data);
        setForm((current) => ({
          ...current,
          rentAmount: data.rentSuggestion,
          electricityPrevious: data.electricity.previous ?? '',
          electricityTariff: data.electricity.tariff,
          waterPrevious: data.water.previous ?? '',
          waterTariff: data.water.tariff,
        }));
      })
      .catch((err) => setError(err.message));
  }, [apartmentId, form.year, form.month]);

  const electricityUsage = Math.max(0, Number(form.electricityCurrent || 0) - Number(form.electricityPrevious || 0));
  const waterUsage = Math.max(0, Number(form.waterCurrent || 0) - Number(form.waterPrevious || 0));
  const electricityTotal = electricityUsage * Number(form.electricityTariff || 0);
  const waterTotal = waterUsage * Number(form.waterTariff || 0);
  const grandTotal = Number(form.rentAmount || 0) + electricityTotal + waterTotal;

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      await api(`/api/apartments/${apartmentId}/months`, {
        method: 'POST',
        body: JSON.stringify({
          year: Number(form.year),
          month: Number(form.month),
          rentAmount: Number(form.rentAmount),
          electricity: {
            previous: Number(form.electricityPrevious),
            current: Number(form.electricityCurrent),
            tariffPrice: Number(form.electricityTariff),
          },
          water: {
            previous: Number(form.waterPrevious),
            current: Number(form.waterCurrent),
            tariffPrice: Number(form.waterTariff),
          },
        }),
      });
      onDone();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <Alert>{error}</Alert>
      {preview?.monthExists && <Alert>כבר קיים חיוב לחודש זה.</Alert>}
      {preview && (preview.electricity.previous == null || preview.water.previous == null) && (
        <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
          <strong>הגדרת קריאות ראשוניות</strong>
          <p className="mt-1">זו הפעם הראשונה שמוזנות קריאות לדירה. יש להזין את הקריאה שממנה מתחילים ואת הקריאה הנוכחית. מהחודש הבא הקריאה הקודמת תועתק אוטומטית.</p>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="שנה"><TextInput dir="ltr" type="number" min="2000" max="2100" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></Field>
        <Field label="חודש">
          <Select value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })}>
            {MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="שכר דירה"><TextInput dir="ltr" type="number" min="0" step="0.01" value={form.rentAmount} onChange={(e) => setForm({ ...form, rentAmount: e.target.value })} required /></Field>
      <div className="rounded-xl bg-amber-50 p-4">
        <div className="mb-3 font-medium">חשמל</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={preview?.electricity.previous == null ? 'קריאה התחלתית לחשמל' : 'קריאה קודמת (אוטומטית)'}><TextInput dir="ltr" type="number" min="0" step="0.001" value={form.electricityPrevious} onChange={(e) => setForm({ ...form, electricityPrevious: e.target.value })} readOnly={preview?.electricity.previous != null} required /></Field>
          <Field label="קריאה נוכחית"><TextInput dir="ltr" type="number" min="0" step="0.001" value={form.electricityCurrent} onChange={(e) => setForm({ ...form, electricityCurrent: e.target.value })} required /></Field>
          <Field label="מחיר להכפלה לקוט״ש"><TextInput dir="ltr" type="number" min="0" step="0.0001" value={form.electricityTariff} onChange={(e) => setForm({ ...form, electricityTariff: e.target.value })} required /></Field>
        </div>
        <div className="mt-3 rounded-lg bg-white/70 p-3 text-sm">צריכה: <strong>{formatQty(electricityUsage)} קוט״ש</strong> × {formatMoney(form.electricityTariff)} = <strong>{formatMoney(electricityTotal)}</strong></div>
      </div>
      <div className="rounded-xl bg-sky-50 p-4">
        <div className="mb-3 font-medium">מים</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={preview?.water.previous == null ? 'קריאה התחלתית למים' : 'קריאה קודמת (אוטומטית)'}><TextInput dir="ltr" type="number" min="0" step="0.001" value={form.waterPrevious} onChange={(e) => setForm({ ...form, waterPrevious: e.target.value })} readOnly={preview?.water.previous != null} required /></Field>
          <Field label="קריאה נוכחית"><TextInput dir="ltr" type="number" min="0" step="0.001" value={form.waterCurrent} onChange={(e) => setForm({ ...form, waterCurrent: e.target.value })} required /></Field>
          <Field label="מחיר להכפלה למ״ק"><TextInput dir="ltr" type="number" min="0" step="0.0001" value={form.waterTariff} onChange={(e) => setForm({ ...form, waterTariff: e.target.value })} required /></Field>
        </div>
        <div className="mt-3 rounded-lg bg-white/70 p-3 text-sm">צריכה: <strong>{formatQty(waterUsage)} מ״ק</strong> × {formatMoney(form.waterTariff)} = <strong>{formatMoney(waterTotal)}</strong></div>
      </div>
      <div className="rounded-xl bg-slate-950 p-4 text-white"><div className="text-sm text-slate-300">סה״כ לחודש: שכירות + חשמל + מים</div><div className="mt-1 text-2xl font-semibold">{formatMoney(grandTotal)}</div></div>
      <Button disabled={preview?.monthExists}>יצירת חיוב חודשי</Button>
    </form>
  );
}

function EditMonthForm({ apartmentId, record, onDone }) {
  const [form, setForm] = useState({
    rentAmount: record.rent?.amountDue || '',
    electricityPrevious: record.electricity?.previousReading || '',
    electricityCurrent: record.electricity?.currentReading || '',
    electricityTariff: record.electricity?.tariffPrice || '',
    waterPrevious: record.water?.previousReading || '',
    waterCurrent: record.water?.currentReading || '',
    waterTariff: record.water?.tariffPrice || '',
  });
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      await api(`/api/apartments/${apartmentId}/months/${record.year}/${record.month}`, {
        method: 'PATCH',
        body: JSON.stringify({
          rentAmount: Number(form.rentAmount),
          electricity: { previous: Number(form.electricityPrevious), current: Number(form.electricityCurrent), tariffPrice: Number(form.electricityTariff) },
          water: { previous: Number(form.waterPrevious), current: Number(form.waterCurrent), tariffPrice: Number(form.waterTariff) },
        }),
      });
      onDone();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <Alert>{error}</Alert>
      <p className="text-sm text-slate-500">שינוי מחיר ההכפלה ישפיע רק על החודש הזה.</p>
      <Field label="שכר דירה"><TextInput dir="ltr" type="number" min="0" step="0.01" value={form.rentAmount} onChange={(e) => setForm({ ...form, rentAmount: e.target.value })} /></Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="חשמל — קריאה קודמת"><TextInput dir="ltr" type="number" min="0" step="0.001" value={form.electricityPrevious} onChange={(e) => setForm({ ...form, electricityPrevious: e.target.value })} /></Field>
        <Field label="חשמל — קריאה נוכחית"><TextInput dir="ltr" type="number" min="0" step="0.001" value={form.electricityCurrent} onChange={(e) => setForm({ ...form, electricityCurrent: e.target.value })} /></Field>
        <Field label="חשמל — מחיר להכפלה"><TextInput dir="ltr" type="number" min="0" step="0.0001" value={form.electricityTariff} onChange={(e) => setForm({ ...form, electricityTariff: e.target.value })} /></Field>
        <Field label="מים — קריאה קודמת"><TextInput dir="ltr" type="number" min="0" step="0.001" value={form.waterPrevious} onChange={(e) => setForm({ ...form, waterPrevious: e.target.value })} /></Field>
        <Field label="מים — קריאה נוכחית"><TextInput dir="ltr" type="number" min="0" step="0.001" value={form.waterCurrent} onChange={(e) => setForm({ ...form, waterCurrent: e.target.value })} /></Field>
        <Field label="מים — מחיר להכפלה"><TextInput dir="ltr" type="number" min="0" step="0.0001" value={form.waterTariff} onChange={(e) => setForm({ ...form, waterTariff: e.target.value })} /></Field>
      </div>
      <Button>שמירת שינויים</Button>
    </form>
  );
}

function PaymentForm({ apartmentId, months, onDone }) {
  const latestMonth = months.at(-1);
  const [form, setForm] = useState({
    paymentDate: today,
    amount: '',
    method: 'bank_transfer',
    category: 'multiple',
    applyToOldest: true,
    billingKey: latestMonth ? `${latestMonth.year}-${latestMonth.month}` : '',
    notes: '',
    referenceNumber: '',
  });
  const [error, setError] = useState('');
  const selectedMonth = months.find((month) => `${month.year}-${month.month}` === form.billingKey);

  async function submit(event) {
    event.preventDefault();
    const [billingYear, billingMonth] = form.billingKey.split('-').map(Number);
    setError('');
    try {
      await api(`/api/apartments/${apartmentId}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          amount: Number(form.amount),
          billingYear,
          billingMonth,
        }),
      });
      onDone();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
      <div className="sm:col-span-2"><Alert>{error}</Alert></div>
      <label className="sm:col-span-2 flex items-start gap-3 rounded-xl border border-slate-200 p-4">
        <input className="mt-1" type="checkbox" checked={form.applyToOldest} onChange={(e) => setForm({ ...form, applyToOldest: e.target.checked })} />
        <span><strong>תשלום על חשבון החוב המצטבר</strong><span className="mt-1 block text-sm text-slate-500">הסכום יוקצה אוטומטית מהחיוב הישן ביותר לחדש ביותר, גם אם הוא מכסה כמה חודשים.</span></span>
      </label>
      <Field label="תאריך תשלום"><TextInput dir="ltr" type="date" value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} required /></Field>
      <Field label="סכום"><TextInput dir="ltr" type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></Field>
      <Field label="אמצעי תשלום">
        <Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
          {Object.entries(METHOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </Field>
      <Field label="קטגוריה">
        <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </Field>
      <Field label={form.applyToOldest ? 'סגירת חוב מצטבר עד חודש' : 'חודש חיוב'}>
        <Select value={form.billingKey} onChange={(e) => setForm({ ...form, billingKey: e.target.value })} required>
          <option value="">בחירת חודש</option>
          {[...months].reverse().map((month) => <option key={`${month.year}-${month.month}`} value={`${month.year}-${month.month}`}>{monthLabel(month.year, month.month)} · {form.applyToOldest ? `חוב מצטבר ${formatMoney(month.cumulativeRemaining)}` : `יתרת חודש ${formatMoney(month.remaining)}`}</option>)}
        </Select>
      </Field>
      <Field label="מספר אסמכתא"><TextInput value={form.referenceNumber} onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })} /></Field>
      {selectedMonth && <div className="sm:col-span-2 rounded-xl bg-slate-950 p-4 text-white"><div className="text-sm text-slate-300">{form.applyToOldest ? 'החוב המצטבר שניתן לשלם' : 'יתרת החודש שניתן לשלם'}</div><div className="mt-1 text-2xl font-semibold">{formatMoney(form.applyToOldest ? selectedMonth.cumulativeRemaining : selectedMonth.remaining)}</div></div>}
      <div className="sm:col-span-2"><Field label="הערות"><TextArea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field></div>
      <div className="sm:col-span-2"><Button>רישום תשלום והפקת אישור</Button></div>
    </form>
  );
}

function ApartmentEditForm({ apartment, onDone }) {
  const [form, setForm] = useState({ number: apartment.number, floor: apartment.floor || '', notes: apartment.notes || '' });
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    try {
      await api(`/api/apartments/${apartment.id}`, { method: 'PUT', body: JSON.stringify(form) });
      onDone();
    } catch (err) { setError(err.message); }
  }
  return <form className="space-y-4" onSubmit={submit}><Alert>{error}</Alert><Field label="מספר דירה"><TextInput value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} required /></Field><Field label="קומה"><TextInput value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} /></Field><Field label="הערות"><TextArea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field><Button>שמירה</Button></form>;
}

function LeaseForm({ apartment, onDone }) {
  const [form, setForm] = useState(apartment.leaseId ? {
    fullName: apartment.tenantName || '',
    phone: apartment.tenantPhone || '',
    monthlyRent: apartment.monthlyRent || '',
    startDate: apartment.leaseStart || today,
    endDate: apartment.leaseEnd || '',
    notes: apartment.leaseNotes || '',
  } : emptyLease);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    try {
      await api(`/api/apartments/${apartment.id}/lease`, {
        method: apartment.leaseId ? 'PUT' : 'POST',
        body: JSON.stringify({ ...form, monthlyRent: Number(form.monthlyRent), endDate: form.endDate || null }),
      });
      onDone();
    } catch (err) { setError(err.message); }
  }
  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
      <div className="sm:col-span-2"><Alert>{error}</Alert></div>
      <Field label="שם הדייר"><TextInput value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required /></Field>
      <Field label="טלפון"><TextInput dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
      <Field label="שכר דירה חודשי"><TextInput dir="ltr" type="number" min="0" step="0.01" value={form.monthlyRent} onChange={(e) => setForm({ ...form, monthlyRent: e.target.value })} required /></Field>
      <Field label="תחילת שכירות"><TextInput dir="ltr" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required /></Field>
      <Field label="סיום שכירות"><TextInput dir="ltr" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field>
      <div className="sm:col-span-2"><Field label="הערות"><TextArea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field></div>
      <div className="sm:col-span-2"><Button>{apartment.leaseId ? 'עדכון פרטי הדייר' : 'שיבוץ דייר'}</Button></div>
    </form>
  );
}

export default function ApartmentPage() {
  const { id } = useParams();
  const [apartment, setApartment] = useState(null);
  const [months, setMonths] = useState([]);
  const [payments, setPayments] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [tab, setTab] = useState('details');
  const [modal, setModal] = useState(null);
  const [error, setError] = useState('');
  const [year, setYear] = useState('all');
  const [status, setStatus] = useState('all');
  const [detailMonthKey, setDetailMonthKey] = useState('');

  const load = useCallback(async () => {
    try {
      const [apartmentData, monthsData, paymentsData, receiptsData] = await Promise.all([
        api(`/api/apartments/${id}`),
        api(`/api/apartments/${id}/months`),
        api(`/api/apartments/${id}/payments`),
        api(`/api/apartments/${id}/receipts`),
      ]);
      setApartment(apartmentData);
      setMonths(monthsData);
      setDetailMonthKey((current) => {
        const currentExists = monthsData.some(
          (month) => `${month.year}-${month.month}` === current,
        );
        const latest = monthsData.at(-1);
        return currentExists || !latest ? current : `${latest.year}-${latest.month}`;
      });
      setPayments(paymentsData);
      setReceipts(receiptsData);
      setModal(null);
    } catch (err) { setError(err.message); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const years = useMemo(() => [...new Set(months.map((month) => month.year))].sort((a, b) => b - a), [months]);
  const filteredMonths = useMemo(() => months.filter((month) => (year === 'all' || month.year === Number(year)) && (status === 'all' || month.status === status)).reverse(), [months, year, status]);
  const annual = useMemo(() => {
    const selected = year === 'all' ? months : months.filter((month) => month.year === Number(year));
    return {
      due: selected.reduce((sum, month) => sum + Number(month.totalDue), 0),
      paid: selected.reduce((sum, month) => sum + Number(month.totalPaid), 0),
      remaining: selected.reduce((sum, month) => sum + Number(month.remaining), 0),
    };
  }, [months, year]);
  const detailMonth = useMemo(
    () => months.find((month) => `${month.year}-${month.month}` === detailMonthKey)
      || months.at(-1),
    [months, detailMonthKey],
  );
  const detailMonthIndex = detailMonth
    ? months.findIndex((month) => month.year === detailMonth.year && month.month === detailMonth.month)
    : -1;

  if (error && !apartment) return <Alert>{error}</Alert>;
  if (!apartment) return <p>טוען את פרטי הדירה...</p>;

  const tabs = [
    ['details', 'פרטי דירה ודייר'],
    ['months', 'היסטוריה חודשית'],
    ['payments', 'תשלומים'],
    ['documents', 'מסמכים'],
  ];

  async function finishLease() {
    if (!window.confirm('לסיים את השכירות הפעילה ולהפוך את הדירה לפנויה?')) return;
    try {
      await api(`/api/apartments/${id}/lease/end`, { method: 'POST' });
      load();
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="apartment-page -m-4 min-h-[calc(100vh-57px)] space-y-6 p-4 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/apartments" className="text-sm text-teal-800">חזרה לכל הדירות</Link>
          <div className="mt-1 flex items-center gap-3"><h1 className="text-2xl font-semibold">דירה {apartment.number}</h1><Badge status={apartment.status} /></div>
          <p className="text-sm text-slate-500">{apartment.tenantName || 'ללא דייר פעיל'}{apartment.floor ? ` · קומה ${apartment.floor}` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => downloadFile(`/api/apartments/${id}/history.xlsx`, `apartment-${apartment.number}.xlsx`)}>ייצוא Excel</Button>
          <Button variant="secondary" onClick={() => downloadFile(`/api/apartments/${id}/history.pdf`, `full-history-${apartment.number}.pdf`)}>PDF כל החודשים והתשלומים</Button>
          <Button onClick={() => setModal({ type: 'month' })}>{months.length === 0 ? 'הזנת קריאות ראשוניות' : 'חודש חדש'}</Button>
        </div>
      </div>
      <Alert>{error}</Alert>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="שכר דירה חודשי" value={apartment.monthlyRent ? formatMoney(apartment.monthlyRent) : '—'} />
        <Stat label="סך ששולם" value={formatMoney(apartment.totalPaid)} />
        <Stat label="יתרה כוללת" value={formatMoney(apartment.outstanding)} />
      </div>
      <div className="flex flex-wrap gap-2 rounded-2xl bg-white p-2 shadow-sm">
        {tabs.map(([value, label]) => <button key={value} type="button" onClick={() => setTab(value)} className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm ${tab === value ? 'bg-slate-950 text-white' : 'hover:bg-slate-100'}`}>{label}</button>)}
      </div>

      {tab === 'details' && (
        <div className="grid gap-4 lg:grid-cols-2">
          {months.length === 0 && (
            <Card className="border-2 border-teal-600 lg:col-span-2" title="מתחילים כאן — הגדרת החודש הראשון">
              <p className="text-sm text-slate-500">כדי להתחיל לנהל את הדירה, הזינו שכר דירה, קריאה התחלתית וקריאה נוכחית לחשמל ולמים. לאחר השמירה, המערכת תעביר בכל חודש את הקריאה הנוכחית להיות הקריאה הקודמת של החודש הבא.</p>
              <Button className="mt-4" onClick={() => setModal({ type: 'month' })}>הזנת קריאות ראשוניות</Button>
            </Card>
          )}
          {detailMonth && (
            <Card
              className="lg:col-span-2"
              title={`חשבון חודשי · ${monthLabel(detailMonth.year, detailMonth.month)}`}
              action={<Badge status={detailMonth.status} />}
            >
              <div className="mb-5 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:bg-[#0b1020]">
                <Button
                  variant="secondary"
                  disabled={detailMonthIndex <= 0}
                  onClick={() => {
                    const previous = months[detailMonthIndex - 1];
                    if (previous) setDetailMonthKey(`${previous.year}-${previous.month}`);
                  }}
                >
                  החודש הקודם
                </Button>
                <Field label="בחירת חודש">
                  <Select
                    value={`${detailMonth.year}-${detailMonth.month}`}
                    onChange={(event) => setDetailMonthKey(event.target.value)}
                  >
                    {[...months].reverse().map((month) => (
                      <option key={`${month.year}-${month.month}`} value={`${month.year}-${month.month}`}>
                        {monthLabel(month.year, month.month)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button
                  variant="secondary"
                  disabled={detailMonthIndex < 0 || detailMonthIndex >= months.length - 1}
                  onClick={() => {
                    const next = months[detailMonthIndex + 1];
                    if (next) setDetailMonthKey(`${next.year}-${next.month}`);
                  }}
                >
                  החודש הבא
                </Button>
                <Button
                  className="sm:ms-auto"
                  onClick={() => downloadFile(
                    `/api/apartments/${id}/months/${detailMonth.year}/${detailMonth.month}/summary.pdf`,
                    `monthly-charge-${detailMonth.year}-${detailMonth.month}.pdf`,
                  )}
                >
                  הורדת PDF לחודש
                </Button>
              </div>
              <div className="mb-4 grid gap-3 lg:grid-cols-3">
                <ChargeBlock title="שכר דירה" charge={detailMonth.rent} />
                <ChargeBlock title="חשמל" charge={detailMonth.electricity} unit="קוט״ש" />
                <ChargeBlock title="מים" charge={detailMonth.water} unit="מ״ק" />
              </div>
              <div className="grid gap-3 rounded-xl bg-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-4 dark:bg-[#0b1020]">
                <Detail label="יתרה מחודשים קודמים" value={formatMoney(detailMonth.openingBalance)} />
                <Detail label="חיוב החודש" value={formatMoney(detailMonth.totalDue)} />
                <Detail label="שולם בחודש" value={formatMoney(detailMonth.totalPaid)} />
                <Detail label="יתרה מצטברת" value={formatMoney(detailMonth.cumulativeRemaining)} />
              </div>
            </Card>
          )}
          <Card title="פרטי הדירה" action={<Button variant="ghost" onClick={() => setModal({ type: 'apartment' })}>עריכה</Button>}>
            <div className="grid grid-cols-2 gap-5">
              <Detail label="מספר דירה" value={apartment.number} />
              <Detail label="קומה" value={apartment.floor} />
              <Detail label="סטטוס" value={STATUS_LABELS[apartment.status]} />
              <Detail label="הערות" value={apartment.notes} />
            </div>
          </Card>
          <Card title="פרטי הדייר" action={<Button variant="ghost" onClick={() => setModal({ type: 'lease' })}>{apartment.leaseId ? 'עריכה' : 'שיבוץ דייר'}</Button>}>
            {apartment.leaseId ? (
              <>
                <div className="grid grid-cols-2 gap-5">
                  <Detail label="שם" value={apartment.tenantName} />
                  <Detail label="טלפון" value={apartment.tenantPhone} />
                  <Detail label="שכר דירה" value={formatMoney(apartment.monthlyRent)} />
                  <Detail label="תחילת שכירות" value={formatDate(apartment.leaseStart)} />
                  <Detail label="סיום שכירות" value={formatDate(apartment.leaseEnd)} />
                  <Detail label="הערות" value={apartment.leaseNotes} />
                </div>
                <Button variant="danger" className="mt-5" onClick={finishLease}>סיום שכירות</Button>
              </>
            ) : <p className="text-sm text-slate-500">אין דייר פעיל בדירה זו.</p>}
          </Card>
        </div>
      )}

      {tab === 'months' && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="סך חיובים בתקופה" value={formatMoney(annual.due)} />
            <Stat label="סך ששולם בתקופה" value={formatMoney(annual.paid)} />
            <Stat label="יתרה בתקופה" value={formatMoney(annual.remaining)} />
          </div>
          <Card>
            <div className="mb-4 flex flex-wrap gap-3">
              <Select className="max-w-48" value={year} onChange={(e) => setYear(e.target.value)}><option value="all">כל השנים</option>{years.map((value) => <option key={value} value={value}>{value}</option>)}</Select>
              <Select className="max-w-48" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">כל הסטטוסים</option><option value="unpaid">לא שולם</option><option value="partial">שולם חלקית</option><option value="paid">שולם</option></Select>
            </div>
            <div className="mb-6 overflow-auto rounded-xl border border-slate-200">
              <table className="min-w-[2600px] text-right text-xs">
                <thead className="sticky top-0 bg-slate-100 text-slate-600">
                  <tr>
                    {['חודש', 'יתרת פתיחה', 'שכר דירה', 'שולם שכ״ד', 'אופן תשלום שכ״ד', 'סטטוס שכ״ד', 'שכ״ד שולם עד', 'חשמל קודם', 'חשמל נוכחי', 'צריכת חשמל', 'מחיר חשמל להכפלה', 'חיוב חשמל', 'שולם חשמל', 'אופן תשלום חשמל', 'סטטוס חשמל', 'חשמל שולם עד', 'מים קודם', 'מים נוכחי', 'צריכת מים', 'מחיר מים להכפלה', 'חיוב מים', 'שולם מים', 'אופן תשלום מים', 'סטטוס מים', 'מים שולם עד', 'סך חיובים', 'סך ששולם', 'יתרת חודש', 'יתרה מצטברת'].map((heading) => <th key={heading} className="whitespace-nowrap p-3">{heading}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filteredMonths.map((month) => (
                    <tr key={`table-${month.year}-${month.month}`} className="border-t border-slate-100">
                      <td className="whitespace-nowrap p-3 font-medium">{monthLabel(month.year, month.month)}</td>
                      <td className="p-3 font-medium">{formatMoney(month.openingBalance)}</td>
                      <td className="p-3">{formatMoney(month.rent?.amountDue)}</td>
                      <td className="p-3">{formatMoney(month.rent?.amountPaid)}</td>
                      <td className="p-3">{month.rent?.paymentDetails?.map((payment) => METHOD_LABELS[payment.method]).join(', ') || '—'}</td>
                      <td className="p-3">{STATUS_LABELS[month.rent?.status]}</td>
                      <td className="p-3">{formatDate(month.rent?.paidThroughDate)}</td>
                      <td className="p-3">{formatQty(month.electricity?.previousReading)}</td>
                      <td className="p-3">{formatQty(month.electricity?.currentReading)}</td>
                      <td className="p-3">{formatQty(month.electricity?.consumption)}</td>
                      <td className="p-3">{formatMoney(month.electricity?.tariffPrice)}</td>
                      <td className="p-3">{formatMoney(month.electricity?.amountDue)}</td>
                      <td className="p-3">{formatMoney(month.electricity?.amountPaid)}</td>
                      <td className="p-3">{month.electricity?.paymentDetails?.map((payment) => METHOD_LABELS[payment.method]).join(', ') || '—'}</td>
                      <td className="p-3">{STATUS_LABELS[month.electricity?.status]}</td>
                      <td className="p-3">{formatDate(month.electricity?.paidThroughDate)}</td>
                      <td className="p-3">{formatQty(month.water?.previousReading)}</td>
                      <td className="p-3">{formatQty(month.water?.currentReading)}</td>
                      <td className="p-3">{formatQty(month.water?.consumption)}</td>
                      <td className="p-3">{formatMoney(month.water?.tariffPrice)}</td>
                      <td className="p-3">{formatMoney(month.water?.amountDue)}</td>
                      <td className="p-3">{formatMoney(month.water?.amountPaid)}</td>
                      <td className="p-3">{month.water?.paymentDetails?.map((payment) => METHOD_LABELS[payment.method]).join(', ') || '—'}</td>
                      <td className="p-3">{STATUS_LABELS[month.water?.status]}</td>
                      <td className="p-3">{formatDate(month.water?.paidThroughDate)}</td>
                      <td className="p-3 font-medium">{formatMoney(month.totalDue)}</td>
                      <td className="p-3">{formatMoney(month.totalPaid)}</td>
                      <td className="p-3 font-medium">{formatMoney(month.remaining)}</td>
                      <td className="p-3 font-medium">{formatMoney(month.cumulativeRemaining)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-4">
              {filteredMonths.map((month) => (
                <div key={`${month.year}-${month.month}`} className="rounded-2xl border border-slate-200 p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div><h3 className="font-semibold">{monthLabel(month.year, month.month)}</h3><p className="text-sm text-slate-500">יתרת פתיחה {formatMoney(month.openingBalance)} · חיוב החודש {formatMoney(month.totalDue)} · שולם {formatMoney(month.totalPaid)} · יתרה מצטברת {formatMoney(month.cumulativeRemaining)}</p></div>
                    <div className="flex flex-wrap gap-2"><Badge status={month.status} /><Button variant="ghost" onClick={() => setModal({ type: 'editMonth', record: month })}>עריכה</Button><Button variant="ghost" onClick={() => downloadFile(`/api/apartments/${id}/months/${month.year}/${month.month}/summary.pdf`, `monthly-charge-${month.year}-${month.month}.pdf`)}>PDF סיכום חיוב החודש</Button></div>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-3">
                    <ChargeBlock title="שכר דירה" charge={month.rent} />
                    <ChargeBlock title="חשמל" charge={month.electricity} unit="קוט״ש" />
                    <ChargeBlock title="מים" charge={month.water} unit="מ״ק" />
                  </div>
                </div>
              ))}
              {filteredMonths.length === 0 && <p className="text-sm text-slate-500">אין חודשים להצגה.</p>}
            </div>
          </Card>
        </div>
      )}

      {tab === 'payments' && (
        <Card title="כל התשלומים" action={<Button onClick={() => setModal({ type: 'payment' })}>רישום תשלום</Button>}>
          <div className="overflow-auto">
            <table className="w-full min-w-[700px] text-right text-sm">
              <thead className="border-b text-slate-500"><tr><th className="p-3">תאריך</th><th className="p-3">חודש</th><th className="p-3">סכום</th><th className="p-3">אמצעי</th><th className="p-3">קטגוריה</th><th className="p-3">אסמכתא</th><th className="p-3">מסמך</th></tr></thead>
              <tbody>{payments.map((payment) => <tr key={payment.id} className="border-b border-slate-100"><td className="p-3">{formatDate(payment.paymentDate)}</td><td className="p-3">{payment.applyToOldest ? `חוב מצטבר עד ${monthLabel(payment.billingYear, payment.billingMonth)}` : monthLabel(payment.billingYear, payment.billingMonth)}</td><td className="p-3 font-medium">{formatMoney(payment.amount)}</td><td className="p-3">{METHOD_LABELS[payment.method]}</td><td className="p-3">{CATEGORY_LABELS[payment.category]}</td><td className="p-3">{payment.referenceNumber || '—'}</td><td className="p-3">{payment.receiptId && <Button variant="ghost" onClick={() => downloadFile(`/api/receipts/${payment.receiptId}/pdf`, `${payment.receiptNumber}.pdf`)}>אישור תשלום PDF</Button>}</td></tr>)}</tbody>
            </table>
          </div>
          {payments.length === 0 && <p className="mt-4 text-sm text-slate-500">עדיין לא נרשמו תשלומים.</p>}
        </Card>
      )}

      {tab === 'documents' && (
        <Card title="אישורי תשלום">
          <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">המסמכים הם אישורי תשלום פנימיים ואינם חשבוניות מס או קבלות כדין.</p>
          <div className="space-y-2">{receipts.map((receipt) => <div key={receipt.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"><div><div className="font-medium">{receipt.receiptNumber}</div><div className="text-sm text-slate-500">{formatDate(receipt.snapshot.paymentDate)} · {formatMoney(receipt.snapshot.paidNow)} · {monthLabel(receipt.snapshot.billingYear, receipt.snapshot.billingMonth)}</div></div><Button variant="secondary" onClick={() => downloadFile(`/api/receipts/${receipt.id}/pdf`, `${receipt.receiptNumber}.pdf`)}>אישור תשלום PDF</Button></div>)}</div>
          {receipts.length === 0 && <p className="text-sm text-slate-500">אין מסמכים שמורים.</p>}
        </Card>
      )}

      {modal?.type === 'month' && <Modal title={months.length === 0 ? 'הזנת קריאות ראשוניות' : 'פתיחת חודש חדש'} onClose={() => setModal(null)}><MonthForm apartmentId={id} onDone={load} /></Modal>}
      {modal?.type === 'editMonth' && <Modal title={`עריכת ${monthLabel(modal.record.year, modal.record.month)}`} onClose={() => setModal(null)}><EditMonthForm apartmentId={id} record={modal.record} onDone={load} /></Modal>}
      {modal?.type === 'payment' && <Modal title="רישום תשלום" onClose={() => setModal(null)}><PaymentForm apartmentId={id} months={months} onDone={load} /></Modal>}
      {modal?.type === 'apartment' && <Modal title="עריכת פרטי הדירה" onClose={() => setModal(null)}><ApartmentEditForm apartment={apartment} onDone={load} /></Modal>}
      {modal?.type === 'lease' && <Modal title={apartment.leaseId ? 'עריכת פרטי הדייר והשכירות' : 'שיבוץ דייר'} onClose={() => setModal(null)}><LeaseForm apartment={apartment} onDone={load} /></Modal>}
    </div>
  );
}
