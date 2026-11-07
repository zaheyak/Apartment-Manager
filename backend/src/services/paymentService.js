import { AppError } from '../lib/errors.js';
import { chargeStatus, fromCents, money, toCents } from '../lib/money.js';
import { pool } from '../db/pool.js';
import { getApartment } from './apartmentService.js';

const CATEGORY_ORDER = ['rent', 'electricity', 'water'];

function presentPayment(row) {
  return {
    id: row.id,
    apartmentId: row.apartment_id,
    apartmentNumber: row.apartment_number,
    tenantName: row.tenant_name,
    paymentDate: row.payment_date,
    amount: money(row.amount),
    method: row.method,
    category: row.category,
    billingYear: row.billing_year,
    billingMonth: row.billing_month,
    notes: row.notes,
    referenceNumber: row.reference_number,
    applyToOldest: row.apply_to_oldest === 'true',
    receiptId: row.receipt_id,
    receiptNumber: row.receipt_number,
    createdAt: row.created_at,
  };
}

export async function listPayments(apartmentId) {
  await getApartment(apartmentId);
  const { rows } = await pool.query(
    `SELECT p.*, a.number AS apartment_number, r.id AS receipt_id, r.receipt_number,
            r.snapshot->>'applyToOldest' AS apply_to_oldest
     FROM payments p
     JOIN apartments a ON a.id = p.apartment_id
     LEFT JOIN payment_receipts r ON r.payment_id = p.id
     WHERE p.apartment_id = $1
     ORDER BY p.payment_date DESC, p.created_at DESC`,
    [apartmentId],
  );
  return rows.map(presentPayment);
}

export async function listReceipts(apartmentId) {
  await getApartment(apartmentId);
  const { rows } = await pool.query(
    `SELECT id, receipt_number, payment_id, snapshot, created_at
     FROM payment_receipts
     WHERE apartment_id = $1
     ORDER BY created_at DESC`,
    [apartmentId],
  );
  return rows.map((row) => ({
    id: row.id,
    receiptNumber: row.receipt_number,
    paymentId: row.payment_id,
    snapshot: row.snapshot,
    createdAt: row.created_at,
  }));
}

export async function getReceipt(id) {
  const { rows } = await pool.query(
    `SELECT id, receipt_number, payment_id, apartment_id, snapshot, created_at
     FROM payment_receipts WHERE id = $1`,
    [id],
  );
  if (!rows[0]) throw new AppError(404, 'אישור התשלום לא נמצא');
  return {
    id: rows[0].id,
    receiptNumber: rows[0].receipt_number,
    paymentId: rows[0].payment_id,
    apartmentId: rows[0].apartment_id,
    snapshot: rows[0].snapshot,
    createdAt: rows[0].created_at,
  };
}

export async function recordPayment(apartmentId, input, adminId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const apartment = await client.query(
      'SELECT id, number FROM apartments WHERE id = $1 FOR UPDATE',
      [apartmentId],
    );
    if (!apartment.rows[0]) throw new AppError(404, 'הדירה לא נמצאה');

    const periodCondition = input.applyToOldest
      ? `(charge_year < $2 OR (charge_year = $2 AND charge_month <= $3))`
      : `charge_year = $2 AND charge_month = $3`;
    const { rows: charges } = await client.query(
      `SELECT * FROM monthly_charges
       WHERE apartment_id = $1 AND ${periodCondition}
       ORDER BY charge_year, charge_month,
         CASE category WHEN 'rent' THEN 1 WHEN 'electricity' THEN 2 ELSE 3 END
       FOR UPDATE`,
      [apartmentId, input.billingYear, input.billingMonth],
    );
    if (!charges.length) throw new AppError(404, 'לא נמצאו חיובים לתקופה שנבחרה');

    const paidResult = await client.query(
      `SELECT monthly_charge_id, COALESCE(SUM(amount), 0) AS paid
       FROM payment_allocations
       WHERE monthly_charge_id = ANY($1::uuid[])
       GROUP BY monthly_charge_id`,
      [charges.map((charge) => charge.id)],
    );
    const paidById = new Map(paidResult.rows.map((row) => [row.monthly_charge_id, Number(row.paid)]));
    const enriched = charges.map((charge) => ({ ...charge, paid: paidById.get(charge.id) || 0 }));

    const wanted = input.category === 'multiple'
      ? CATEGORY_ORDER
      : [input.category];
    const targets = enriched.filter((charge) => wanted.includes(charge.category));

    let left = toCents(input.amount);
    const allocations = [];
    for (const target of targets) {
      if (left <= 0) break;
      const remaining = toCents(target.amount_due) - toCents(target.paid);
      if (remaining <= 0) continue;
      const take = Math.min(left, remaining);
      allocations.push({
        charge: target,
        cents: take,
        paidBefore: toCents(target.paid),
      });
      left -= take;
    }
    if (left > 0) {
      throw new AppError(
        400,
        input.applyToOldest
          ? 'הסכום גבוה מכל היתרה המצטברת עד החודש שנבחר'
          : 'הסכום גבוה מהיתרה הפתוחה לחודש זה',
      );
    }
    if (!allocations.length) throw new AppError(400, 'אין יתרה פתוחה לתשלום');

    const lease = await client.query(
      `SELECT t.full_name
       FROM leases l
       JOIN tenants t ON t.id = l.tenant_id
       WHERE l.apartment_id = $1 AND l.status = 'active'`,
      [apartmentId],
    );

    const payment = await client.query(
      `INSERT INTO payments (
        apartment_id, tenant_name, payment_date, amount, method, category,
        billing_year, billing_month, notes, reference_number
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id`,
      [
        apartmentId,
        lease.rows[0]?.full_name || null,
        input.paymentDate,
        fromCents(toCents(input.amount)),
        input.method,
        input.category,
        input.billingYear,
        input.billingMonth,
        input.notes || '',
        input.referenceNumber || null,
      ],
    );

    for (const allocation of allocations) {
      await client.query(
        `INSERT INTO payment_allocations (payment_id, monthly_charge_id, amount) VALUES ($1, $2, $3)`,
        [payment.rows[0].id, allocation.charge.id, fromCents(allocation.cents)],
      );
    }

    const lineCharges = input.applyToOldest ? targets : enriched;
    const lines = lineCharges.map((charge) => {
      const allocation = allocations.find((item) => item.charge.id === charge.id);
      const due = toCents(charge.amount_due);
      const paidBefore = toCents(charge.paid);
      const paidNow = allocation?.cents || 0;
      return {
        category: charge.category,
        billingYear: charge.charge_year,
        billingMonth: charge.charge_month,
        amountDue: fromCents(due),
        paidBefore: fromCents(paidBefore),
        paidNow: fromCents(paidNow),
        remainingAfter: fromCents(due - paidBefore - paidNow),
      };
    });
    const totalDue = lines.reduce((sum, line) => sum + toCents(line.amountDue), 0);
    const paidBefore = lines.reduce((sum, line) => sum + toCents(line.paidBefore), 0);
    const paidNow = toCents(input.amount);
    const remainingAfter = totalDue - paidBefore - paidNow;

    const sequence = await client.query(`SELECT nextval('receipt_seq') AS n`);
    const receiptNumber = `RC-${input.paymentDate.slice(0, 4)}-${String(sequence.rows[0].n).padStart(4, '0')}`;
    const snapshot = {
      receiptNumber,
      apartmentNumber: apartment.rows[0].number,
      tenantName: lease.rows[0]?.full_name || '',
      paymentDate: input.paymentDate,
      method: input.method,
      category: input.category,
      billingYear: input.billingYear,
      billingMonth: input.billingMonth,
      applyToOldest: input.applyToOldest,
      lines,
      totalDue: fromCents(totalDue),
      paidBefore: fromCents(paidBefore),
      paidNow: fromCents(paidNow),
      remainingAfter: fromCents(remainingAfter),
      status: chargeStatus(totalDue / 100, (paidBefore + paidNow) / 100),
      referenceNumber: input.referenceNumber || '',
      notes: input.notes || '',
      disclaimer: 'מסמך זה הוא אישור תשלום פנימי ואינו חשבונית מס או קבלה כדין.',
    };

    const receipt = await client.query(
      `INSERT INTO payment_receipts (receipt_number, payment_id, apartment_id, snapshot)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [receiptNumber, payment.rows[0].id, apartmentId, snapshot],
    );
    await client.query(
      `INSERT INTO documents (apartment_id, doc_type, title, receipt_id)
       VALUES ($1, 'payment_receipt', $2, $3)`,
      [apartmentId, `אישור תשלום ${receiptNumber}`, receipt.rows[0].id],
    );
    await client.query(
      `INSERT INTO audit_logs (admin_id, apartment_id, entity_type, entity_id, action, after_data)
       VALUES ($1, $2, 'payment', $3, 'create_payment', $4)`,
      [adminId, apartmentId, payment.rows[0].id, snapshot],
    );
    await client.query('COMMIT');
    return getReceipt(receipt.rows[0].id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
