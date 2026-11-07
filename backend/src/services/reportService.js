import { chargeStatus, money } from '../lib/money.js';
import { pool } from '../db/pool.js';
import { getApartment, listApartments } from './apartmentService.js';
import { getMonths } from './billingService.js';
import { listPayments, listReceipts } from './paymentService.js';

export async function dashboard() {
  const apartments = await listApartments();
  const payments = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM payments`,
  );
  const recentPayments = await pool.query(
    `SELECT p.id, p.payment_date, p.amount, p.method, p.category, p.billing_year, p.billing_month,
            a.id AS apartment_id, a.number AS apartment_number, p.tenant_name
     FROM payments p
     JOIN apartments a ON a.id = p.apartment_id
     ORDER BY p.payment_date DESC, p.created_at DESC
     LIMIT 8`,
  );
  const recentReceipts = await pool.query(
    `SELECT r.id, r.receipt_number, r.created_at, r.snapshot, a.number AS apartment_number, a.id AS apartment_id
     FROM payment_receipts r
     JOIN apartments a ON a.id = r.apartment_id
     ORDER BY r.created_at DESC
     LIMIT 8`,
  );
  const monthlyRent = apartments.reduce((sum, apartment) => sum + Number(apartment.monthlyRent || 0), 0);
  const outstanding = apartments.reduce((sum, apartment) => sum + Number(apartment.outstanding || 0), 0);
  const open = (field) => apartments
    .filter((apartment) => Number(apartment[field]) > 0)
    .map((apartment) => ({
      id: apartment.id,
      number: apartment.number,
      tenantName: apartment.tenantName,
      amount: apartment[field],
    }));

  return {
    totals: {
      apartments: apartments.length,
      occupied: apartments.filter((apartment) => apartment.status === 'occupied').length,
      vacant: apartments.filter((apartment) => apartment.status === 'vacant').length,
      monthlyRent: money(monthlyRent),
      paymentsReceived: money(payments.rows[0].total),
      outstanding: money(outstanding),
    },
    unpaidRent: open('rentOutstanding'),
    unpaidElectricity: open('electricityOutstanding'),
    unpaidWater: open('waterOutstanding'),
    recentPayments: recentPayments.rows.map((row) => ({
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
    })),
    recentReceipts: recentReceipts.rows.map((row) => ({
      id: row.id,
      apartmentId: row.apartment_id,
      apartmentNumber: row.apartment_number,
      receiptNumber: row.receipt_number,
      amount: row.snapshot.paidNow,
      paymentDate: row.snapshot.paymentDate,
      createdAt: row.created_at,
    })),
  };
}

export async function buildingReport() {
  const apartments = await listApartments();
  const charges = await pool.query(
    `SELECT category, COALESCE(SUM(amount_due), 0) AS due FROM monthly_charges GROUP BY category`,
  );
  const dueByCategory = Object.fromEntries(charges.rows.map((row) => [row.category, Number(row.due)]));
  const payments = await pool.query(`SELECT COALESCE(SUM(amount), 0) AS total FROM payments`);
  const outstanding = apartments.reduce((sum, apartment) => sum + Number(apartment.outstanding), 0);
  return {
    totals: {
      rentCharges: money(dueByCategory.rent || 0),
      electricityCharges: money(dueByCategory.electricity || 0),
      waterCharges: money(dueByCategory.water || 0),
      paymentsReceived: money(payments.rows[0].total),
      outstanding: money(outstanding),
      monthlyRent: money(apartments.reduce((sum, apartment) => sum + Number(apartment.monthlyRent || 0), 0)),
    },
    apartments,
    unpaid: apartments.filter((apartment) => Number(apartment.outstanding) > 0),
  };
}

export async function apartmentReport(apartmentId) {
  const apartment = await getApartment(apartmentId);
  const months = await getMonths(apartmentId);
  const payments = await listPayments(apartmentId);
  const receipts = await listReceipts(apartmentId);
  const years = [...new Set(months.map((month) => month.year))];
  const annual = years.map((year) => {
    const rows = months.filter((month) => month.year === year);
    const sum = (picker) => rows.reduce((total, month) => total + Number(picker(month) || 0), 0);
    return {
      year,
      rent: money(sum((month) => month.rent?.amountDue)),
      electricity: money(sum((month) => month.electricity?.amountDue)),
      water: money(sum((month) => month.water?.amountDue)),
      totalDue: money(sum((month) => month.totalDue)),
      totalPaid: money(sum((month) => month.totalPaid)),
      remaining: money(sum((month) => month.remaining)),
      status: chargeStatus(sum((month) => month.totalDue), sum((month) => month.totalPaid)),
    };
  });
  return { apartment, months, payments, receipts, annual };
}
