import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Alert, Card, Stat } from '../components/ui.jsx';
import { METHOD_LABELS, formatDate, formatMoney, monthLabel } from '../format.js';

function UnpaidList({ title, rows }) {
  return (
    <Card title={title}>
      {rows.length === 0 && <p className="text-sm text-slate-500">אין יתרות פתוחות.</p>}
      <div className="space-y-2">
        {rows.map((row) => (
          <Link key={row.id} to={`/apartments/${row.id}`} className="flex items-center justify-between rounded-xl px-2 py-2 hover:bg-slate-50">
            <span>דירה {row.number}{row.tenantName ? ` · ${row.tenantName}` : ''}</span>
            <span className="font-medium">{formatMoney(row.amount)}</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/dashboard').then(setData).catch((err) => setError(err.message));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <p>טוען את לוח הבקרה...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">לוח בקרה</h1>
        <p className="text-sm text-slate-500">תמונת מצב של כל הדירות והיתרות הפתוחות.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label="סך דירות" value={data.totals.apartments} />
        <Stat label="דירות מאוכלסות" value={data.totals.occupied} />
        <Stat label="דירות פנויות" value={data.totals.vacant} />
        <Stat label="שכר דירה חודשי" value={formatMoney(data.totals.monthlyRent)} />
        <Stat label="תשלומים שהתקבלו" value={formatMoney(data.totals.paymentsReceived)} />
        <Stat label="יתרות פתוחות" value={formatMoney(data.totals.outstanding)} />
      </div>
      <div>
        <UnpaidList title="דירות עם יתרה פתוחה" rows={data.unpaid} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="תשלומים אחרונים">
          {data.recentPayments.length === 0 && <p className="text-sm text-slate-500">עדיין אין תשלומים.</p>}
          <div className="space-y-3">
            {data.recentPayments.map((payment) => (
              <Link key={payment.id} to={`/apartments/${payment.apartmentId}`} className="block rounded-xl border border-slate-100 p-3 hover:border-teal-200">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">דירה {payment.apartmentNumber}</span>
                  <span>{formatMoney(payment.amount)}</span>
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  {formatDate(payment.paymentDate)} · {monthLabel(payment.billingYear, payment.billingMonth)} · {METHOD_LABELS[payment.method]}
                </div>
              </Link>
            ))}
          </div>
        </Card>
        <Card title="אישורי תשלום אחרונים">
          {data.recentReceipts.length === 0 && <p className="text-sm text-slate-500">עדיין אין מסמכים.</p>}
          <div className="space-y-3">
            {data.recentReceipts.map((receipt) => (
              <Link key={receipt.id} to={`/apartments/${receipt.apartmentId}`} className="block rounded-xl border border-slate-100 p-3 hover:border-teal-200">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{receipt.receiptNumber}</span>
                  <span>{formatMoney(receipt.amount)}</span>
                </div>
                <div className="mt-1 text-sm text-slate-500">דירה {receipt.apartmentNumber} · {formatDate(receipt.paymentDate)}</div>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
