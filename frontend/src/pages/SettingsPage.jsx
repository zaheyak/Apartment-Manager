import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Alert, Button, Card, Field, Select, TextArea, TextInput } from '../components/ui.jsx';
import { formatDate, formatMoney } from '../format.js';

const today = new Date().toISOString().slice(0, 10);

export default function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [building, setBuilding] = useState({ name: '', address: '', notes: '' });
  const [tariff, setTariff] = useState({ meterType: 'electricity', price: '', effectiveFrom: today });
  const [password, setPassword] = useState({ currentPassword: '', newPassword: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function load() {
    api('/api/settings').then((data) => {
      setSettings(data);
      setBuilding({
        name: data.building?.name || '',
        address: data.building?.address || '',
        notes: data.building?.notes || '',
      });
    }).catch((err) => setError(err.message));
  }

  useEffect(() => { load(); }, []);

  async function saveBuilding(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await api('/api/settings/building', { method: 'PUT', body: JSON.stringify(building) });
      setMessage('פרטי הבניין נשמרו.');
      load();
    } catch (err) { setError(err.message); }
  }

  async function addTariff(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await api('/api/tariffs', {
        method: 'POST',
        body: JSON.stringify({ ...tariff, price: Number(tariff.price) }),
      });
      setMessage('התעריף נוסף. חיובים היסטוריים נשארו ללא שינוי.');
      setTariff({ ...tariff, price: '' });
      load();
    } catch (err) { setError(err.message); }
  }

  async function changePassword(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await api('/api/auth/password', { method: 'POST', body: JSON.stringify(password) });
      setPassword({ currentPassword: '', newPassword: '' });
      setMessage('הסיסמה הוחלפה בהצלחה.');
    } catch (err) { setError(err.message); }
  }

  if (!settings) return error ? <Alert>{error}</Alert> : <p>טוען הגדרות...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">הגדרות</h1>
        <p className="text-sm text-slate-500">פרטי הבניין, תעריפי השירותים ואבטחת החשבון.</p>
      </div>
      <Alert>{error}</Alert>
      {message && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="פרטי הבניין">
          <form className="space-y-4" onSubmit={saveBuilding}>
            <Field label="שם הבניין"><TextInput value={building.name} onChange={(e) => setBuilding({ ...building, name: e.target.value })} required /></Field>
            <Field label="כתובת"><TextInput value={building.address} onChange={(e) => setBuilding({ ...building, address: e.target.value })} /></Field>
            <Field label="הערות"><TextArea value={building.notes} onChange={(e) => setBuilding({ ...building, notes: e.target.value })} /></Field>
            <Button>שמירת פרטים</Button>
          </form>
        </Card>
        <Card title="תעריפים נוכחיים">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-amber-50 p-4"><div className="text-sm text-slate-600">חשמל לקוט״ש</div><div className="mt-1 text-xl font-semibold">{formatMoney(settings.tariffs.electricity?.price)}</div><div className="text-xs text-slate-500">מ־{formatDate(settings.tariffs.electricity?.effectiveFrom)}</div></div>
            <div className="rounded-xl bg-sky-50 p-4"><div className="text-sm text-slate-600">מים למ״ק</div><div className="mt-1 text-xl font-semibold">{formatMoney(settings.tariffs.water?.price)}</div><div className="text-xs text-slate-500">מ־{formatDate(settings.tariffs.water?.effectiveFrom)}</div></div>
          </div>
          <form className="mt-5 grid gap-4 sm:grid-cols-3" onSubmit={addTariff}>
            <Field label="סוג"><Select value={tariff.meterType} onChange={(e) => setTariff({ ...tariff, meterType: e.target.value })}><option value="electricity">חשמל</option><option value="water">מים</option></Select></Field>
            <Field label="מחיר ליחידה"><TextInput dir="ltr" type="number" min="0" step="0.0001" value={tariff.price} onChange={(e) => setTariff({ ...tariff, price: e.target.value })} required /></Field>
            <Field label="בתוקף מתאריך"><TextInput dir="ltr" type="date" value={tariff.effectiveFrom} onChange={(e) => setTariff({ ...tariff, effectiveFrom: e.target.value })} required /></Field>
            <div className="sm:col-span-3"><Button>הוספת תעריף</Button></div>
          </form>
        </Card>
      </div>
      <Card title="היסטוריית תעריפים">
        <div className="overflow-auto">
          <table className="w-full text-right text-sm"><thead className="border-b text-slate-500"><tr><th className="p-3">סוג</th><th className="p-3">מחיר</th><th className="p-3">בתוקף מתאריך</th></tr></thead><tbody>{settings.tariffHistory.map((row) => <tr key={row.id} className="border-b border-slate-100"><td className="p-3">{row.meterType === 'electricity' ? 'חשמל' : 'מים'}</td><td className="p-3">{formatMoney(row.price)}</td><td className="p-3">{formatDate(row.effectiveFrom)}</td></tr>)}</tbody></table>
        </div>
      </Card>
      <Card title="החלפת סיסמת מנהל">
        <form className="grid max-w-2xl gap-4 sm:grid-cols-2" onSubmit={changePassword}>
          <Field label="סיסמה נוכחית"><TextInput dir="ltr" type="password" value={password.currentPassword} onChange={(e) => setPassword({ ...password, currentPassword: e.target.value })} required /></Field>
          <Field label="סיסמה חדשה"><TextInput dir="ltr" type="password" minLength="8" value={password.newPassword} onChange={(e) => setPassword({ ...password, newPassword: e.target.value })} required /></Field>
          <div className="sm:col-span-2"><Button>החלפת סיסמה</Button></div>
        </form>
      </Card>
    </div>
  );
}
