import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import bidiFactory from 'bidi-js';
import {
  CATEGORY_LABELS,
  METHOD_LABELS,
  STATUS_LABELS,
  formatDate,
  formatMoney,
  formatQty,
  monthLabel,
} from '../lib/labels.js';

const fontsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../assets/fonts');
const bidi = bidiFactory();

function visual(value) {
  const text = String(value ?? '');
  if (!text) return '';
  const levels = bidi.getEmbeddingLevels(text, 'rtl');
  return bidi.getReorderedString(text, levels);
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
  const doc = createDocument();
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  doc.rect(0, 0, doc.page.width, 92).fill('#0f2744');
  doc.fillColor('#ffffff').font('bold').fontSize(22);
  doc.text(visual('אישור תשלום'), 48, 28, { width: 500, align: 'right' });
  doc.font('regular').fontSize(11);
  doc.text(visual('מסמך פנימי לניהול הבניין'), 48, 58, { width: 500, align: 'right' });

  let y = 116;
  y = drawPair(doc, y, 'מספר מסמך', snapshot.receiptNumber);
  y = drawPair(doc, y, 'דירה', snapshot.apartmentNumber);
  y = drawPair(doc, y, 'דייר', snapshot.tenantName || 'לא משויך דייר');
  y = drawPair(doc, y, 'חודש חיוב', monthLabel(snapshot.billingYear, snapshot.billingMonth));
  y = drawPair(doc, y, 'תאריך תשלום', formatDate(snapshot.paymentDate));
  y = drawPair(doc, y, 'אמצעי תשלום', METHOD_LABELS[snapshot.method]);
  y = drawPair(doc, y, 'קטגוריה', CATEGORY_LABELS[snapshot.category]);
  if (snapshot.referenceNumber) y = drawPair(doc, y, 'אסמכתא', snapshot.referenceNumber);

  y += 8;
  doc.moveTo(48, y).lineTo(547, y).strokeColor('#cbd5e1').stroke();
  y += 16;
  doc.font('bold').fontSize(13).fillColor('#0f2744');
  doc.text(visual('פירוט החיובים'), 48, y, { width: 499, align: 'right' });
  y += 28;

  for (const line of snapshot.lines) {
    if (y > 640) {
      doc.addPage();
      y = 56;
    }
    doc.font('bold').fontSize(12).fillColor('#0f172a');
    const lineTitle = `${CATEGORY_LABELS[line.category]} · ${monthLabel(
      line.billingYear ?? snapshot.billingYear,
      line.billingMonth ?? snapshot.billingMonth,
    )}`;
    doc.text(visual(lineTitle), 48, y, { width: 499, align: 'right' });
    y += 18;
    y = drawPair(doc, y, 'סכום מקורי', formatMoney(line.amountDue));
    y = drawPair(doc, y, 'שולם קודם', formatMoney(line.paidBefore));
    y = drawPair(doc, y, 'שולם בתנועה זו', formatMoney(line.paidNow));
    y = drawPair(doc, y, 'יתרה אחרי התשלום', formatMoney(line.remainingAfter));
    y += 6;
  }

  if (y > 640) {
    doc.addPage();
    y = 56;
  }
  y += 4;
  doc.roundedRect(48, y, 499, 92, 8).fill('#f8fafc');
  y += 12;
  y = drawPair(
    doc,
    y,
    snapshot.applyToOldest ? 'סך החיובים המצטברים' : 'סך החיוב לחודש',
    formatMoney(snapshot.totalDue),
  );
  y = drawPair(doc, y, 'סכום שהתקבל כעת', formatMoney(snapshot.paidNow));
  y = drawPair(doc, y, 'יתרה כוללת', formatMoney(snapshot.remainingAfter));
  y = drawPair(doc, y, 'סטטוס', STATUS_LABELS[snapshot.status]);

  doc.font('regular').fontSize(9).fillColor('#64748b');
  doc.text(visual(snapshot.disclaimer), 48, 760, { width: 499, align: 'right' });
  doc.end();
  return done;
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

function paymentRows(charge) {
  if (!charge?.paymentDetails?.length) {
    return [{ label: 'אופן התשלום', value: 'לא נרשם תשלום' }];
  }
  return charge.paymentDetails.map((payment, index) => ({
    label: charge.paymentDetails.length > 1 ? `תשלום ${index + 1}` : 'פרטי התשלום',
    value: [
      formatMoney(payment.amount),
      METHOD_LABELS[payment.method] || payment.method,
      formatDate(payment.paymentDate),
      payment.referenceNumber ? `אסמכתא ${payment.referenceNumber}` : '',
    ].filter(Boolean).join(' · '),
  }));
}

export function monthSummaryRows(apartment, month) {
  return [
    { label: 'דירה', value: apartment.number },
    { label: 'דייר', value: apartment.tenantName || 'לא משויך דייר' },
    { label: 'חודש', value: monthLabel(month.year, month.month) },
    { label: 'יתרת פתיחה מחודשים קודמים', value: formatMoney(month.openingBalance) },
    { kind: 'heading', text: 'שכר דירה' },
    { label: 'סכום', value: formatMoney(month.rent?.amountDue) },
    { label: 'שולם', value: formatMoney(month.rent?.amountPaid) },
    { label: 'יתרה', value: formatMoney(month.rent?.remaining) },
    { label: 'סטטוס', value: STATUS_LABELS[month.rent?.status || 'unpaid'] },
    { label: 'שולם עד', value: formatDate(month.rent?.paidThroughDate) || '—' },
    ...paymentRows(month.rent),
    { kind: 'heading', text: 'חשמל' },
    { label: 'קריאה קודמת', value: formatQty(month.electricity?.previousReading) },
    { label: 'קריאה נוכחית', value: formatQty(month.electricity?.currentReading) },
    { label: 'צריכה', value: formatQty(month.electricity?.consumption, 'קוט"ש') },
    { label: 'תעריף', value: `${formatMoney(month.electricity?.tariffPrice)} / קוט"ש` },
    { label: 'חיוב', value: formatMoney(month.electricity?.amountDue) },
    { label: 'שולם', value: formatMoney(month.electricity?.amountPaid) },
    { label: 'יתרה', value: formatMoney(month.electricity?.remaining) },
    { label: 'סטטוס', value: STATUS_LABELS[month.electricity?.status || 'unpaid'] },
    ...paymentRows(month.electricity),
    { kind: 'heading', text: 'מים' },
    { label: 'קריאה קודמת', value: formatQty(month.water?.previousReading) },
    { label: 'קריאה נוכחית', value: formatQty(month.water?.currentReading) },
    { label: 'צריכה', value: formatQty(month.water?.consumption, 'מ"ק') },
    { label: 'תעריף', value: `${formatMoney(month.water?.tariffPrice)} / מ"ק` },
    { label: 'חיוב', value: formatMoney(month.water?.amountDue) },
    { label: 'שולם', value: formatMoney(month.water?.amountPaid) },
    { label: 'יתרה', value: formatMoney(month.water?.remaining) },
    { label: 'סטטוס', value: STATUS_LABELS[month.water?.status || 'unpaid'] },
    ...paymentRows(month.water),
    { kind: 'heading', text: 'סיכום' },
    { label: 'סך חיובים', value: formatMoney(month.totalDue) },
    { label: 'סך ששולם', value: formatMoney(month.totalPaid) },
    { label: 'יתרת החודש', value: formatMoney(month.remaining) },
    { label: 'יתרה מצטברת', value: formatMoney(month.cumulativeRemaining) },
    { label: 'סטטוס', value: STATUS_LABELS[month.status] },
  ];
}
