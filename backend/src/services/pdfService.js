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

function drawPair(doc, y, label, value, emphasis = false) {
  const rowHeight = 30;
  if (emphasis) doc.rect(48, y, 499, rowHeight).fill('#e8e8e8');
  doc.rect(48, y, 499, rowHeight).lineWidth(0.7).strokeColor('#111111').stroke();
  doc.moveTo(300, y).lineTo(300, y + rowHeight).strokeColor('#111111').stroke();
  doc.font('bold').fontSize(10.5).fillColor('#000000');
  doc.text(visual(label), 310, y + 8, { width: 227, align: 'right', lineBreak: false });
  doc.font(emphasis ? 'bold' : 'regular').fontSize(10.5).fillColor('#000000');
  doc.text(visual(value), 58, y + 8, { width: 232, align: 'left', lineBreak: false });
  return y + rowHeight;
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
  doc.fillColor('#000000').font('bold').fontSize(22);
  doc.text(visual(title), 48, 42, { width: 499, align: 'right' });
  doc.font('regular').fontSize(11).fillColor('#000000');
  doc.text(visual(subtitle), 48, 73, { width: 499, align: 'right' });
  doc.moveTo(48, 98).lineTo(547, 98).lineWidth(1.2).strokeColor('#000000').stroke();

  let y = 116;
  for (const row of rows) {
    const neededHeight = row.kind === 'heading' ? 38 : 30;
    if (y + neededHeight > 752) {
      doc.addPage();
      doc.fillColor('#000000').font('bold').fontSize(13);
      doc.text(visual(title), 48, 38, { width: 499, align: 'right' });
      doc.moveTo(48, 62).lineTo(547, 62).lineWidth(0.8).strokeColor('#000000').stroke();
      y = 78;
    }
    if (row.kind === 'heading') {
      y += 8;
      doc.rect(48, y, 499, 30).fillAndStroke('#f1f1f1', '#111111');
      doc.font('bold').fontSize(12).fillColor('#000000');
      doc.text(visual(row.text), 58, y + 8, { width: 479, align: 'right', lineBreak: false });
      y += 30;
      continue;
    }
    y = drawPair(doc, y, row.label, row.value, row.emphasis);
  }
  doc.font('regular').fontSize(9).fillColor('#000000');
  doc.text(visual('המסמך הוא מסמך ניהולי ואינו חשבונית מס או קבלה כדין.'), 48, 790, {
    width: 499,
    align: 'right',
  });
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
    { label: 'יתרה לאחר התשלום', value: formatMoney(remainingAfter), emphasis: true },
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
    { label: 'סך כל החיוב לחודש זה', value: formatMoney(month.totalDue), emphasis: true },
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
    { label: 'הסכום שנשאר לתשלום', value: formatMoney(finalRemaining), emphasis: true },
  ];
}
