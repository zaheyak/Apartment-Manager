import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import {
  CATEGORY_LABELS,
  METHOD_LABELS,
  MONTHS_HE,
  formatDate,
  formatMoney,
  formatQty,
} from '../lib/labels.js';

const fontsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../assets/fonts');

function visual(value) {
  // PDFKit splits on ordinary spaces before shaping Hebrew. Keeping the phrase
  // in one RTL shaping run preserves word order, while numeric tokens remain
  // separate LTR runs so years, dates and amounts are not reversed.
  return String(value ?? '')
    .replace(/(?<=\p{Script=Hebrew}) (?=\p{Script=Hebrew})/gu, '\u00a0')
    .replace(/(?<=\p{Script=Hebrew})-(?=\d)/gu, ' - ');
}

function pdfMonthLabel(year, month) {
  return `${year} ${MONTHS_HE[month - 1]}`;
}

function drawPair(doc, y, label, value) {
  doc.font('regular').fontSize(11).fillColor('#475569');
  doc.text(visual(label), 310, y, { width: 240, align: 'right' });
  doc.font('bold').fontSize(11).fillColor('#0f172a');
  doc.text(visual(value), 48, y, { width: 250, align: 'left' });
  return y + 22;
}

function createDocument() {
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  doc.registerFont('regular', path.join(fontsDir, 'NotoSansHebrew-Regular.ttf'));
  doc.registerFont('bold', path.join(fontsDir, 'NotoSansHebrew-Bold.ttf'));
  return doc;
}

export function renderReceiptPdf(snapshot) {
  if (!fs.existsSync(path.join(fontsDir, 'NotoSansHebrew-Regular.ttf'))) {
    throw new Error('Hebrew font is missing');
  }
  return renderSummaryPdf({
    title: 'אישור תשלום',
    subtitle: 'פרטי התשלום והיתרה לאחר התשלום',
    rows: paymentReceiptRows(snapshot),
  });
}

export function renderSummaryPdf({ title, subtitle, rows }) {
  const doc = createDocument();
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  doc.rect(0, 0, doc.page.width, 78).fill('#0f2744');
  doc.fillColor('#ffffff').font('bold').fontSize(20);
  doc.text(visual(title), 48, 24, { width: 500, align: 'right' });
  doc.font('regular').fontSize(11);
  doc.text(visual(subtitle), 48, 50, { width: 500, align: 'right' });

  let y = 100;
  for (const row of rows) {
    if (y > 740) {
      doc.addPage();
      y = 56;
    }
    if (row.kind === 'heading') {
      y += 8;
      doc.font('bold').fontSize(13).fillColor('#0f2744');
      doc.text(visual(row.text), 48, y, { width: 499, align: 'right' });
      y += 24;
      continue;
    }
    y = drawPair(doc, y, row.label, row.value);
  }
  doc.font('regular').fontSize(9).fillColor('#64748b');
  doc.text(visual('המסמך הוא סיכום ניהולי ואינו חשבונית מס.'), 48, 780, { width: 499, align: 'right' });
  doc.end();
  return done;
}

function paymentReceiptRows(snapshot) {
  const remainingAfter = snapshot.accountRemainingAfter
    ?? snapshot.statement?.cumulativeRemaining
    ?? snapshot.remainingAfter;
  const balanceBefore = Number(remainingAfter || 0) + Number(snapshot.paidNow || 0);
  return [
    { label: 'לכבוד', value: snapshot.tenantName || 'לא משויך דייר' },
    ...(snapshot.tenantPhone ? [{ label: 'טלפון', value: snapshot.tenantPhone }] : []),
    { label: 'מספר מסמך', value: snapshot.receiptNumber },
    { label: 'דירה', value: snapshot.apartmentNumber },
    { label: 'עבור חודש', value: pdfMonthLabel(snapshot.billingYear, snapshot.billingMonth) },
    { kind: 'heading', text: 'פרטי התשלום' },
    { label: 'תאריך התשלום', value: formatDate(snapshot.paymentDate) },
    { label: 'סכום ששולם', value: formatMoney(snapshot.paidNow) },
    { label: 'אמצעי התשלום', value: METHOD_LABELS[snapshot.method] || snapshot.method },
    { label: 'עבור', value: CATEGORY_LABELS[snapshot.category] || snapshot.category },
    ...(snapshot.referenceNumber
      ? [{ label: 'אסמכתא', value: snapshot.referenceNumber }]
      : []),
    ...(snapshot.notes ? [{ label: 'הערות', value: snapshot.notes }] : []),
    { kind: 'heading', text: 'יתרה' },
    { label: 'יתרה לפני התשלום', value: formatMoney(balanceBefore) },
    { label: 'שולם בתשלום זה', value: formatMoney(snapshot.paidNow) },
    { label: 'יתרה לאחר התשלום', value: formatMoney(remainingAfter) },
  ];
}

export function monthChargeRows(apartment, month) {
  return [
    { label: 'לכבוד', value: apartment.tenantName || 'לא משויך דייר' },
    ...(apartment.tenantPhone ? [{ label: 'טלפון', value: apartment.tenantPhone }] : []),
    { label: 'דירה', value: apartment.number },
    { label: 'סיכום עבור חודש', value: pdfMonthLabel(month.year, month.month) },
    { kind: 'heading', text: 'שכר דירה' },
    { label: 'חיוב שכר דירה לחודש', value: formatMoney(month.rent?.amountDue) },
    { kind: 'heading', text: 'חשמל' },
    { label: 'קריאת חשמל קודמת', value: formatQty(month.electricity?.previousReading) },
    { label: 'קריאת חשמל נוכחית', value: formatQty(month.electricity?.currentReading) },
    { label: 'צריכת חשמל', value: formatQty(month.electricity?.consumption, 'קוט"ש') },
    { label: 'מחיר להכפלה', value: `${formatMoney(month.electricity?.tariffPrice)} לכל קוט"ש` },
    { label: 'חיוב חשמל לחודש', value: formatMoney(month.electricity?.amountDue) },
    { kind: 'heading', text: 'מים' },
    { label: 'קריאת מים קודמת', value: formatQty(month.water?.previousReading) },
    { label: 'קריאת מים נוכחית', value: formatQty(month.water?.currentReading) },
    { label: 'צריכת מים', value: formatQty(month.water?.consumption, 'מ"ק') },
    { label: 'מחיר להכפלה', value: `${formatMoney(month.water?.tariffPrice)} לכל מ"ק` },
    { label: 'חיוב מים לחודש', value: formatMoney(month.water?.amountDue) },
    { kind: 'heading', text: 'סיכום החיוב החודשי' },
    { label: 'שכר דירה', value: formatMoney(month.rent?.amountDue) },
    { label: 'חשמל', value: formatMoney(month.electricity?.amountDue) },
    { label: 'מים', value: formatMoney(month.water?.amountDue) },
    { label: 'סך כל החיוב לחודש זה', value: formatMoney(month.totalDue) },
  ];
}

export function apartmentHistoryRows(report) {
  const totalDue = report.months.reduce((sum, month) => sum + Number(month.totalDue), 0);
  const totalPaid = report.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const finalRemaining = report.months.at(-1)?.cumulativeRemaining
    ?? report.apartment.outstanding
    ?? 0;
  const monthRows = report.months.flatMap((month) => ([
    { kind: 'heading', text: pdfMonthLabel(month.year, month.month) },
    { label: 'חיוב שכר דירה', value: formatMoney(month.rent?.amountDue) },
    { label: 'חיוב חשמל', value: formatMoney(month.electricity?.amountDue) },
    { label: 'חיוב מים', value: formatMoney(month.water?.amountDue) },
    { label: 'סך חיוב החודש', value: formatMoney(month.totalDue) },
    { label: 'שולם עבור החודש', value: formatMoney(month.totalPaid) },
    { label: 'יתרת החודש', value: formatMoney(month.remaining) },
  ]));
  const paymentRows = report.payments.flatMap((payment, index) => ([
    { kind: 'heading', text: `תשלום ${index + 1}` },
    { label: 'תאריך', value: formatDate(payment.paymentDate) },
    { label: 'סכום', value: formatMoney(payment.amount) },
    { label: 'אמצעי תשלום', value: METHOD_LABELS[payment.method] || payment.method },
    { label: 'עבור חודש', value: pdfMonthLabel(payment.billingYear, payment.billingMonth) },
    ...(payment.referenceNumber ? [{ label: 'אסמכתא', value: payment.referenceNumber }] : []),
  ]));
  return [
    { label: 'לכבוד', value: report.apartment.tenantName || 'לא משויך דייר' },
    ...(report.apartment.tenantPhone
      ? [{ label: 'טלפון', value: report.apartment.tenantPhone }]
      : []),
    { label: 'דירה', value: report.apartment.number },
    { kind: 'heading', text: 'פירוט חיובים לפי חודש' },
    ...monthRows,
    { kind: 'heading', text: 'כל התשלומים' },
    ...(paymentRows.length ? paymentRows : [{ label: 'תשלומים', value: 'לא נרשמו תשלומים' }]),
    { kind: 'heading', text: 'סיכום סופי' },
    { label: 'סך כל החיובים', value: formatMoney(totalDue) },
    { label: 'סך כל התשלומים', value: formatMoney(totalPaid) },
    { label: 'הסכום שנשאר לתשלום', value: formatMoney(finalRemaining) },
  ];
}
