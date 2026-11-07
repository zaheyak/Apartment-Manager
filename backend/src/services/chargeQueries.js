import { chargeStatus, money, roundMoney } from '../lib/money.js';

const CHARGE_SELECT = `
  SELECT c.*,
    COALESCE(SUM(pa.amount), 0) AS amount_paid,
    MAX(p.payment_date) AS last_payment_date,
    COALESCE(
      jsonb_agg(
        DISTINCT jsonb_build_object(
          'paymentId', p.id,
          'paymentDate', p.payment_date,
          'method', p.method,
          'amount', pa.amount,
          'referenceNumber', p.reference_number
        )
      ) FILTER (WHERE p.id IS NOT NULL),
      '[]'::jsonb
    ) AS payment_details
  FROM monthly_charges c
  LEFT JOIN payment_allocations pa ON pa.monthly_charge_id = c.id
  LEFT JOIN payments p ON p.id = pa.payment_id
`;

export async function loadCharges(db, apartmentId, year) {
  const params = [apartmentId];
  let yearClause = '';
  if (year) {
    params.push(year);
    yearClause = ` AND c.charge_year = $${params.length}`;
  }
  const { rows } = await db.query(
    `${CHARGE_SELECT}
     WHERE c.apartment_id = $1 ${yearClause}
     GROUP BY c.id
     ORDER BY c.charge_year, c.charge_month, c.category`,
    params,
  );
  return rows;
}

export function presentCharge(row) {
  const due = Number(row.amount_due);
  const paid = Number(row.amount_paid);
  const status = chargeStatus(due, paid);
  return {
    id: row.id,
    amountDue: money(due),
    amountPaid: money(paid),
    remaining: money(due - paid),
    status,
    lastPaymentDate: row.last_payment_date,
    paidThroughDate: status === 'paid' ? row.last_payment_date : null,
    paymentDetails: (row.payment_details || [])
      .map((payment) => ({
        paymentId: payment.paymentId,
        paymentDate: payment.paymentDate,
        method: payment.method,
        amount: money(payment.amount),
        referenceNumber: payment.referenceNumber || '',
      }))
      .sort((a, b) => String(a.paymentDate).localeCompare(String(b.paymentDate))),
    tariffPrice: row.tariff_price == null ? null : Number(row.tariff_price).toFixed(4),
    previousReading: row.previous_reading == null ? null : Number(row.previous_reading).toFixed(3),
    currentReading: row.current_reading == null ? null : Number(row.current_reading).toFixed(3),
    consumption: row.consumption == null ? null : Number(row.consumption).toFixed(3),
  };
}

export function groupCharges(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = `${row.charge_year}-${row.charge_month}`;
    if (!map.has(key)) {
      map.set(key, {
        year: row.charge_year,
        month: row.charge_month,
        rent: null,
        electricity: null,
        water: null,
      });
    }
    map.get(key)[row.category] = presentCharge(row);
  }

  const months = [...map.values()]
    .map((month) => {
      const parts = [month.rent, month.electricity, month.water].filter(Boolean);
      const totalDue = parts.reduce((sum, part) => sum + Number(part.amountDue), 0);
      const totalPaid = parts.reduce((sum, part) => sum + Number(part.amountPaid), 0);
      return {
        ...month,
        totalDue: money(totalDue),
        totalPaid: money(totalPaid),
        remaining: money(roundMoney(totalDue - totalPaid)),
        status: chargeStatus(totalDue, totalPaid),
      };
    })
    .sort((a, b) => a.year - b.year || a.month - b.month);

  let cumulativeDue = 0;
  let cumulativePaid = 0;
  let carriedBalance = 0;
  return months.map((month) => {
    const openingBalance = carriedBalance;
    cumulativeDue += Number(month.totalDue);
    cumulativePaid += Number(month.totalPaid);
    carriedBalance += Number(month.remaining);
    return {
      ...month,
      openingBalance: money(openingBalance),
      cumulativeDue: money(cumulativeDue),
      cumulativePaid: money(cumulativePaid),
      cumulativeRemaining: money(carriedBalance),
    };
  });
}
