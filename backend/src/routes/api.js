import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.js';
import { asyncRoute, AppError } from '../lib/errors.js';
import { requireAuth, signAdmin } from '../middleware/auth.js';
import {
  apartmentSchema,
  apartmentUpdateSchema,
  buildingSchema,
  leaseSchema,
  loginSchema,
  monthSchema,
  monthUpdateSchema,
  passwordSchema,
  paymentSchema,
  parseBody,
  tariffSchema,
} from '../validation/schemas.js';
import {
  assignLease,
  createApartment,
  endLease,
  getApartment,
  listApartments,
  listAudit,
  updateActiveLease,
  updateApartment,
} from '../services/apartmentService.js';
import { createMonth, getMonths, readingPreview, updateMonth } from '../services/billingService.js';
import { getReceipt, listPayments, listReceipts, recordPayment } from '../services/paymentService.js';
import { apartmentReport, buildingReport, dashboard } from '../services/reportService.js';
import { addTariff, getSettings, updateBuilding } from '../services/settingsService.js';
import {
  apartmentHistoryRows,
  monthChargeRows,
  renderReceiptPdf,
  renderSummaryPdf,
} from '../services/pdfService.js';
import {
  addPaymentRows,
  apartmentHistoryWorkbook,
  buildingWorkbook,
  workbookBuffer,
} from '../services/excelService.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'יותר מדי ניסיונות התחברות. נסו שוב מאוחר יותר.' },
});

function sendPdf(res, buffer, filename) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', contentDisposition(filename));
  res.send(buffer);
}

function sendExcel(res, buffer, filename) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', contentDisposition(filename));
  res.send(Buffer.from(buffer));
}

function contentDisposition(filename) {
  const fallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

router.get('/health', (_req, res) => {
  res.json({ ok: true });
});

router.post('/auth/login', loginLimiter, asyncRoute(async (req, res) => {
  const { username, password } = parseBody(loginSchema, req.body);
  const { rows } = await pool.query(
    'SELECT id, username, password_hash, full_name FROM administrators WHERE lower(username) = lower($1)',
    [username],
  );
  const admin = rows[0];
  const matches = admin ? await bcrypt.compare(password, admin.password_hash) : false;
  if (!admin || !matches) throw new AppError(401, 'שם המשתמש או הסיסמה שגויים');
  res.json({
    token: signAdmin(admin),
    admin: { id: admin.id, username: admin.username, fullName: admin.full_name },
  });
}));

router.get('/auth/me', requireAuth, asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, username, full_name FROM administrators WHERE id = $1',
    [req.user.sub],
  );
  if (!rows[0]) throw new AppError(401, 'נדרשת התחברות');
  res.json({ id: rows[0].id, username: rows[0].username, fullName: rows[0].full_name });
}));

router.post('/auth/password', requireAuth, asyncRoute(async (req, res) => {
  const input = parseBody(passwordSchema, req.body);
  const { rows } = await pool.query('SELECT password_hash FROM administrators WHERE id = $1', [req.user.sub]);
  if (!rows[0] || !(await bcrypt.compare(input.currentPassword, rows[0].password_hash))) {
    throw new AppError(400, 'הסיסמה הנוכחית שגויה');
  }
  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  await pool.query('UPDATE administrators SET password_hash = $1 WHERE id = $2', [passwordHash, req.user.sub]);
  res.json({ ok: true });
}));

router.use(requireAuth);

router.get('/dashboard', asyncRoute(async (_req, res) => {
  res.json(await dashboard());
}));

router.get('/settings', asyncRoute(async (_req, res) => {
  res.json(await getSettings());
}));

router.put('/settings/building', asyncRoute(async (req, res) => {
  res.json(await updateBuilding(parseBody(buildingSchema, req.body)));
}));

router.post('/tariffs', asyncRoute(async (req, res) => {
  res.status(201).json(await addTariff(parseBody(tariffSchema, req.body)));
}));

router.get('/apartments', asyncRoute(async (_req, res) => {
  res.json(await listApartments());
}));

router.post('/apartments', asyncRoute(async (req, res) => {
  const apartment = await createApartment(parseBody(apartmentSchema, req.body), req.user.sub);
  res.status(201).json(apartment);
}));

router.get('/apartments/:id', asyncRoute(async (req, res) => {
  res.json(await getApartment(req.params.id));
}));

router.put('/apartments/:id', asyncRoute(async (req, res) => {
  res.json(await updateApartment(req.params.id, parseBody(apartmentUpdateSchema, req.body), req.user.sub));
}));

router.post('/apartments/:id/lease', asyncRoute(async (req, res) => {
  res.status(201).json(await assignLease(req.params.id, parseBody(leaseSchema, req.body), req.user.sub));
}));

router.put('/apartments/:id/lease', asyncRoute(async (req, res) => {
  res.json(await updateActiveLease(req.params.id, parseBody(leaseSchema, req.body), req.user.sub));
}));

router.post('/apartments/:id/lease/end', asyncRoute(async (req, res) => {
  res.json(await endLease(req.params.id, req.user.sub));
}));

router.get('/apartments/:id/audit', asyncRoute(async (req, res) => {
  res.json(await listAudit(req.params.id));
}));

router.get('/apartments/:id/reading-preview', asyncRoute(async (req, res) => {
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  if (!year || !month || month < 1 || month > 12) throw new AppError(400, 'חודש לא תקין');
  res.json(await readingPreview(req.params.id, year, month));
}));

router.get('/apartments/:id/months', asyncRoute(async (req, res) => {
  const year = req.query.year ? Number(req.query.year) : undefined;
  res.json(await getMonths(req.params.id, year));
}));

router.post('/apartments/:id/months', asyncRoute(async (req, res) => {
  const months = await createMonth(req.params.id, parseBody(monthSchema, req.body), req.user.sub);
  res.status(201).json(months);
}));

router.patch('/apartments/:id/months/:year/:month', asyncRoute(async (req, res) => {
  const months = await updateMonth(
    req.params.id,
    Number(req.params.year),
    Number(req.params.month),
    parseBody(monthUpdateSchema, req.body),
    req.user.sub,
  );
  res.json(months);
}));

router.get('/apartments/:id/payments', asyncRoute(async (req, res) => {
  res.json(await listPayments(req.params.id));
}));

router.post('/apartments/:id/payments', asyncRoute(async (req, res) => {
  const receipt = await recordPayment(req.params.id, parseBody(paymentSchema, req.body), req.user.sub);
  res.status(201).json(receipt);
}));

router.get('/apartments/:id/receipts', asyncRoute(async (req, res) => {
  res.json(await listReceipts(req.params.id));
}));

router.get('/receipts/:id', asyncRoute(async (req, res) => {
  res.json(await getReceipt(req.params.id));
}));

router.get('/receipts/:id/pdf', asyncRoute(async (req, res) => {
  const receipt = await getReceipt(req.params.id);
  const buffer = await renderReceiptPdf(receipt.snapshot);
  sendPdf(res, buffer, `${receipt.receiptNumber}.pdf`);
}));

router.get('/apartments/:id/months/:year/:month/summary.pdf', asyncRoute(async (req, res) => {
  const report = await apartmentReport(req.params.id);
  const year = Number(req.params.year);
  const month = Number(req.params.month);
  const record = report.months.find((item) => item.year === year && item.month === month);
  if (!record) throw new AppError(404, 'החודש לא נמצא');
  const buffer = await renderSummaryPdf({
    title: 'סיכום חיוב חודשי',
    subtitle: 'שכר דירה וקריאות חשמל ומים לחודש זה בלבד',
    rows: monthChargeRows(report.apartment, record),
  });
  sendPdf(res, buffer, `monthly-charge-${report.apartment.number}-${year}-${month}.pdf`);
}));

router.get('/reports/building', asyncRoute(async (_req, res) => {
  res.json(await buildingReport());
}));

router.get('/reports/building.xlsx', asyncRoute(async (_req, res) => {
  const report = await buildingReport();
  const workbook = await buildingWorkbook(report);
  sendExcel(res, await workbookBuffer(workbook), 'building-report.xlsx');
}));

router.get('/reports/building.pdf', asyncRoute(async (_req, res) => {
  const report = await buildingReport();
  const rows = [
    { label: 'שכר דירה חודשי פעיל', value: `${report.totals.monthlyRent} ₪` },
    { label: 'חיוב שכר דירה', value: `${report.totals.rentCharges} ₪` },
    { label: 'חיוב חשמל', value: `${report.totals.electricityCharges} ₪` },
    { label: 'חיוב מים', value: `${report.totals.waterCharges} ₪` },
    { label: 'תשלומים שהתקבלו', value: `${report.totals.paymentsReceived} ₪` },
    { label: 'יתרה פתוחה', value: `${report.totals.outstanding} ₪` },
    { kind: 'heading', text: 'דירות עם יתרה' },
    ...report.unpaid.map((apartment) => ({
      label: `דירה ${apartment.number}`,
      value: `${apartment.outstanding} ₪`,
    })),
  ];
  const buffer = await renderSummaryPdf({
    title: 'דוח בניין',
    subtitle: 'סיכום כספי לכל הדירות',
    rows,
  });
  sendPdf(res, buffer, 'building-report.pdf');
}));

router.get('/apartments/:id/report', asyncRoute(async (req, res) => {
  res.json(await apartmentReport(req.params.id));
}));

router.get('/apartments/:id/history.xlsx', asyncRoute(async (req, res) => {
  const report = await apartmentReport(req.params.id);
  const workbook = await apartmentHistoryWorkbook(report.apartment, report.months);
  addPaymentRows(workbook, report.payments);
  sendExcel(res, await workbookBuffer(workbook), `apartment-${report.apartment.number}.xlsx`);
}));

router.get('/apartments/:id/history.pdf', asyncRoute(async (req, res) => {
  const report = await apartmentReport(req.params.id);
  const buffer = await renderSummaryPdf({
    title: 'דוח מלא לכל החודשים והתשלומים',
    subtitle: 'פירוט החיובים, התשלומים והיתרה הסופית',
    rows: apartmentHistoryRows(report),
  });
  sendPdf(res, buffer, `full-history-${report.apartment.number}.pdf`);
}));

export default router;
