import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadFile } from '../api.js';
import { Alert, Button, Card, Stat } from '../components/ui.jsx';
import { formatMoney } from '../format.js';

export default function ReportsPage() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/reports/building').then(setReport).catch((err) => setError(err.message));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!report) return <p>טוען דוחות...</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">דוחות הבניין</h1>
          <p className="text-sm text-slate-500">סיכום כספי של כל הדירות וייצוא בעברית.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => downloadFile('/api/reports/building.xlsx', 'building-report.xlsx')}>ייצוא Excel</Button>
          <Button variant="secondary" onClick={() => downloadFile('/api/reports/building.pdf', 'building-report.pdf')}>ייצוא PDF</Button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label="שכר דירה חודשי פעיל" value={formatMoney(report.totals.monthlyRent)} />
        <Stat label="חיובי שכר דירה" value={formatMoney(report.totals.rentCharges)} />
        <Stat label="חיובי חשמל" value={formatMoney(report.totals.electricityCharges)} />
        <Stat label="חיובי מים" value={formatMoney(report.totals.waterCharges)} />
        <Stat label="תשלומים שהתקבלו" value={formatMoney(report.totals.paymentsReceived)} />
        <Stat label="יתרה פתוחה" value={formatMoney(report.totals.outstanding)} />
      </div>
      <Card title="מצב כספי לפי דירה">
        <div className="overflow-auto">
          <table className="w-full min-w-[820px] text-right text-sm">
            <thead className="border-b text-slate-500">
              <tr><th className="p-3">דירה</th><th className="p-3">דייר</th><th className="p-3">שכ״ד חודשי</th><th className="p-3">יתרת שכ״ד</th><th className="p-3">יתרת חשמל</th><th className="p-3">יתרת מים</th><th className="p-3">שולם</th><th className="p-3">יתרה כוללת</th></tr>
            </thead>
            <tbody>
              {report.apartments.map((apartment) => (
                <tr key={apartment.id} className="border-b border-slate-100">
                  <td className="p-3"><Link className="font-medium text-teal-800" to={`/apartments/${apartment.id}`}>דירה {apartment.number}</Link></td>
                  <td className="p-3">{apartment.tenantName || '—'}</td>
                  <td className="p-3">{formatMoney(apartment.monthlyRent)}</td>
                  <td className="p-3">{formatMoney(apartment.rentOutstanding)}</td>
                  <td className="p-3">{formatMoney(apartment.electricityOutstanding)}</td>
                  <td className="p-3">{formatMoney(apartment.waterOutstanding)}</td>
                  <td className="p-3">{formatMoney(apartment.totalPaid)}</td>
                  <td className="p-3 font-semibold">{formatMoney(apartment.outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="דירות עם יתרה פתוחה">
        {report.unpaid.length === 0 && <p className="text-sm text-slate-500">אין יתרות פתוחות.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {report.unpaid.map((apartment) => (
            <Link key={apartment.id} to={`/apartments/${apartment.id}`} className="flex justify-between rounded-xl border border-slate-100 p-3 hover:border-teal-200">
              <span>דירה {apartment.number} · {apartment.tenantName || 'ללא דייר'}</span>
              <strong>{formatMoney(apartment.outstanding)}</strong>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
