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
const ACCENT = '#0f766e';
const ACCENT_DARK = '#115e59';
const ACCENT_LIGHT = '#e8f5f2';
const BORDER = '#9ccbc4';

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
  if (emphasis) doc.rect(48, y, 499, rowHeight).fill(ACCENT_LIGHT);
  doc.rect(48, y, 499, rowHeight).lineWidth(0.7).strokeColor(BORDER).stroke();
  doc.moveTo(300, y).lineTo(300, y + rowHeight).strokeColor(BORDER).stroke();
  doc.font('bold').fontSize(10.5).fillColor('#000000');
  doc.text(visual(label), 310, y + 8, { width: 227, align: 'right', lineBreak: false });
  doc.font(emphasis ? 'bold' : 'regular').fontSize(10.5).fillColor('#000000');
  doc.text(visual(value), 58, y + 8, { width: 232, align: 'left', lineBreak: false });
  return y + rowHeight;
}

function createDocument(options = {}) {
  const doc = new PDFDocument({ size: 'A4', margin: 48, ...options });
  doc.registerFont('regular', path.join(fontsDir, 'NotoSansHebrew-Regular.ttf'));
  doc.registerFont('bold', path.join(fontsDir, 'NotoSansHebrew-Bold.ttf'));
  return doc;
}

function collectPdf(doc) {
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  return { done, finish: () => doc.end() };
}

function drawProfessionalHeader(doc, title, subtitle) {
  const contentWidth = doc.page.width - 96;
  doc.rect(48, 30, contentWidth, 5).fill(ACCENT);
  doc.font('bold').fontSize(23).fillColor(ACCENT_DARK);
  doc.text(visual(title), 230, 50, { width: doc.page.width - 278, align: 'right' });
  doc.font('regular').fontSize(10.5).fillColor('#000000');
  doc.text(visual(subtitle), 230, 82, { width: doc.page.width - 278, align: 'right' });
  doc.font('bold').fontSize(11).fillColor(ACCENT_DARK);
  doc.text(visual('מערכת ניהול דירות'), 48, 55, { width: 160, align: 'left' });
  doc.font('regular').fontSize(9).fillColor('#000000');
  doc.text(visual(formatDate(new Date().toISOString())), 48, 78, { width: 160, align: 'left' });
  doc.moveTo(48, 108).lineTo(doc.page.width - 48, 108).lineWidth(0.8).strokeColor(BORDER).stroke();
}

function drawClientBox(doc, y, { name, phone, apartment, period, documentNumber }) {
  const contentWidth = doc.page.width - 96;
  const rightX = doc.page.width - 295;
  doc.roundedRect(48, y, contentWidth, 76, 7).fillAndStroke(ACCENT_LIGHT, BORDER);
  doc.font('bold').fontSize(9).fillColor(ACCENT_DARK);
  doc.text(visual('לכבוד'), rightX, y + 12, { width: 227, align: 'right' });
  doc.font('bold').fontSize(14).fillColor('#000000');
  doc.text(visual(name || 'לא משויך דייר'), rightX, y + 30, { width: 227, align: 'right' });
  doc.font('regular').fontSize(9.5).fillColor('#000000');
  if (phone) doc.text(visual(phone), rightX, y + 53, { width: 227, align: 'right' });
  const details = [
    apartment ? ['דירה', apartment] : null,
    period ? ['תקופה', period] : null,
    documentNumber ? ['מסמך', documentNumber] : null,
  ].filter(Boolean);
  doc.font('regular').fontSize(9.5).fillColor('#000000');
  details.forEach(([label, value], index) => {
    const lineY = y + 13 + (index * 19);
    doc.font('bold').text(visual(label), 185, lineY, { width: 91, align: 'right' });
    doc.font('regular').text(visual(value), 66, lineY, { width: 109, align: 'left' });
  });
  return y + 94;
}

function drawTableHeader(doc, y, columns) {
  const height = 30;
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
  doc.rect(48, y, tableWidth, height).fillAndStroke(ACCENT, ACCENT_DARK);
  let x = 48;
  for (const column of columns) {
    if (x > 48) doc.moveTo(x, y).lineTo(x, y + height).strokeColor('#d7efeb').stroke();
    doc.font('bold').fontSize(9.5).fillColor('#ffffff');
    doc.text(visual(column.label), x + 7, y + 9, {
      width: column.width - 14,
      align: column.align || 'right',
      lineBreak: false,
    });
    x += column.width;
  }
  return y + height;
}

function drawTableRow(doc, y, columns, values, { height = 38, bold = false, fill } = {}) {
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
  if (fill) doc.rect(48, y, tableWidth, height).fill(fill);
  doc.rect(48, y, tableWidth, height).lineWidth(0.5).strokeColor(BORDER).stroke();
  let x = 48;
  columns.forEach((column, index) => {
    if (x > 48) doc.moveTo(x, y).lineTo(x, y + height).strokeColor(BORDER).stroke();
    doc.font(bold ? 'bold' : 'regular').fontSize(9.5).fillColor('#000000');
    doc.text(visual(values[index] ?? '—'), x + 7, y + 10, {
      width: column.width - 14,
      align: column.align || 'right',
      lineBreak: false,
    });
    x += column.width;
  });
  return y + height;
}

function drawTotalBox(doc, y, label, value) {
  doc.roundedRect(287, y, 260, 62, 6).fillAndStroke(ACCENT_LIGHT, ACCENT);
  doc.font('regular').fontSize(10).fillColor(ACCENT_DARK);
  doc.text(visual(label), 307, y + 12, { width: 220, align: 'right' });
  doc.font('bold').fontSize(20).fillColor(ACCENT_DARK);
  doc.text(visual(value), 307, y + 31, { width: 220, align: 'right' });
}

export function renderReceiptPdf(snapshot) {
  if (!fs.existsSync(path.join(fontsDir, 'NotoSansHebrew-Regular.ttf'))) {
    throw new Error('Hebrew font is missing');
  }
  const doc = createDocument();
  const pdf = collectPdf(doc);
  const remainingAfter = snapshot.accountRemainingAfter
    ?? snapshot.statement?.cumulativeRemaining
    ?? snapshot.remainingAfter;
  const balanceBefore = Number(remainingAfter || 0) + Number(snapshot.paidNow || 0);

  drawProfessionalHeader(doc, 'אישור תשלום', 'פרטי התשלום והיתרה לאחר התשלום');
  let y = drawClientBox(doc, 126, {
    name: snapshot.tenantName,
    phone: snapshot.tenantPhone,
    apartment: snapshot.apartmentNumber,
    period: pdfMonthLabel(snapshot.billingYear, snapshot.billingMonth),
    documentNumber: snapshot.receiptNumber,
  });

  const columns = [
    { label: 'ערך', width: 190, align: 'left' },
    { label: 'פרטי התשלום', width: 309, align: 'right' },
  ];
  y = drawTableHeader(doc, y, columns);
  const rows = [
    ['תאריך התשלום', formatDate(snapshot.paymentDate)],
    ['סכום ששולם', formatMoney(snapshot.paidNow)],
    ['אמצעי תשלום', METHOD_LABELS[snapshot.method] || snapshot.method],
    ['עבור', CATEGORY_LABELS[snapshot.category] || snapshot.category],
    ...(snapshot.referenceNumber ? [['אסמכתא', snapshot.referenceNumber]] : []),
  ];
  for (const [label, value] of rows) {
    y = drawTableRow(doc, y, columns, [value, label]);
  }
  y += 22;
  const balanceColumns = [
    { label: 'יתרה לאחר התשלום', width: 166, align: 'center' },
    { label: 'שולם כעת', width: 166, align: 'center' },
    { label: 'יתרה לפני התשלום', width: 167, align: 'center' },
  ];
  y = drawTableHeader(doc, y, balanceColumns);
  drawTableRow(doc, y, balanceColumns, [
    formatMoney(remainingAfter),
    formatMoney(snapshot.paidNow),
    formatMoney(balanceBefore),
  ], { height: 48, bold: true, fill: ACCENT_LIGHT });
  pdf.finish();
  return pdf.done;
}

export function renderMonthChargePdf(apartment, month) {
  const doc = createDocument();
  const pdf = collectPdf(doc);
  drawProfessionalHeader(doc, 'סיכום חיוב חודשי', 'פירוט שכר דירה חשמל ומים לחודש הנבחר');
  let y = drawClientBox(doc, 126, {
    name: apartment.tenantName,
    phone: apartment.tenantPhone,
    apartment: apartment.number,
    period: pdfMonthLabel(month.year, month.month),
  });
  const columns = [
    { label: 'סכום', width: 85, align: 'center' },
    { label: 'תעריף', width: 80, align: 'center' },
    { label: 'צריכה', width: 80, align: 'center' },
    { label: 'נוכחית', width: 80, align: 'center' },
    { label: 'קודמת', width: 80, align: 'center' },
    { label: 'סוג חיוב', width: 94, align: 'right' },
  ];
  y = drawTableHeader(doc, y, columns);
  const chargeRows = [
    [
      formatMoney(month.rent?.amountDue),
      '—',
      '—',
      '—',
      '—',
      'שכר דירה',
    ],
    [
      formatMoney(month.electricity?.amountDue),
      formatMoney(month.electricity?.tariffPrice),
      formatQty(month.electricity?.consumption),
      formatQty(month.electricity?.currentReading),
      formatQty(month.electricity?.previousReading),
      'חשמל',
    ],
    [
      formatMoney(month.water?.amountDue),
      formatMoney(month.water?.tariffPrice),
      formatQty(month.water?.consumption),
      formatQty(month.water?.currentReading),
      formatQty(month.water?.previousReading),
      'מים',
    ],
  ];
  for (const row of chargeRows) y = drawTableRow(doc, y, columns, row, { height: 44 });
  drawTotalBox(doc, y + 28, 'סך כל החיוב לחודש', formatMoney(month.totalDue));
  pdf.finish();
  return pdf.done;
}

function historyPageHeader(doc, report, subtitle) {
  drawProfessionalHeader(doc, 'דוח כספי מלא', subtitle);
  return drawClientBox(doc, 126, {
    name: report.apartment.tenantName,
    phone: report.apartment.tenantPhone,
    apartment: report.apartment.number,
  });
}

export function renderApartmentHistoryPdf(report) {
  const doc = createDocument({ layout: 'landscape' });
  const pdf = collectPdf(doc);
  const monthColumns = [
    { label: 'יתרה', width: 95, align: 'left' },
    { label: 'שולם', width: 95, align: 'left' },
    { label: 'סה״כ', width: 95, align: 'left' },
    { label: 'מים', width: 90, align: 'left' },
    { label: 'חשמל', width: 90, align: 'left' },
    { label: 'שכר דירה', width: 105, align: 'left' },
    { label: 'חודש', width: 176, align: 'right' },
  ];
  let y = historyPageHeader(doc, report, 'פירוט כל החודשים החיובים התשלומים והיתרות');
  y = drawTableHeader(doc, y, monthColumns);
  for (const month of report.months) {
    if (y + 34 > 530) {
      doc.addPage();
      y = historyPageHeader(doc, report, 'המשך פירוט החיובים לפי חודש');
      y = drawTableHeader(doc, y, monthColumns);
    }
    y = drawTableRow(doc, y, monthColumns, [
      formatMoney(month.remaining),
      formatMoney(month.totalPaid),
      formatMoney(month.totalDue),
      formatMoney(month.water?.amountDue),
      formatMoney(month.electricity?.amountDue),
      formatMoney(month.rent?.amountDue),
      pdfMonthLabel(month.year, month.month),
    ], { height: 34 });
  }

  const paymentColumns = [
    { label: 'אסמכתא', width: 110, align: 'left' },
    { label: 'סכום', width: 110, align: 'left' },
    { label: 'אמצעי תשלום', width: 150, align: 'right' },
    { label: 'עבור חודש', width: 176, align: 'right' },
    { label: 'תאריך', width: 200, align: 'right' },
  ];
  if (y + 100 > 530) {
    doc.addPage();
    y = historyPageHeader(doc, report, 'פירוט כל התשלומים');
  } else {
    y += 28;
    doc.font('bold').fontSize(15).fillColor('#000000');
    doc.text(visual('כל התשלומים'), 48, y, { width: 746, align: 'right' });
    y += 28;
  }
  y = drawTableHeader(doc, y, paymentColumns);
  if (!report.payments.length) {
    y = drawTableRow(doc, y, paymentColumns, ['', '', 'לא נרשמו תשלומים', '', '']);
  } else {
    for (const payment of report.payments) {
      if (y + 34 > 530) {
        doc.addPage();
        y = historyPageHeader(doc, report, 'המשך פירוט התשלומים');
        y = drawTableHeader(doc, y, paymentColumns);
      }
      y = drawTableRow(doc, y, paymentColumns, [
        payment.referenceNumber || '—',
        formatMoney(payment.amount),
        METHOD_LABELS[payment.method] || payment.method,
        pdfMonthLabel(payment.billingYear, payment.billingMonth),
        formatDate(payment.paymentDate),
      ], { height: 34 });
    }
  }
  const totalDue = report.months.reduce((sum, month) => sum + Number(month.totalDue), 0);
  const totalPaid = report.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const finalRemaining = report.months.at(-1)?.cumulativeRemaining
    ?? report.apartment.outstanding
    ?? 0;
  if (y + 96 > 530) {
    doc.addPage();
    y = historyPageHeader(doc, report, 'סיכום כספי סופי');
  } else {
    y += 28;
  }
  const totalsColumns = [
    { label: 'יתרה סופית', width: 249, align: 'center' },
    { label: 'סך התשלומים', width: 249, align: 'center' },
    { label: 'סך החיובים', width: 248, align: 'center' },
  ];
  y = drawTableHeader(doc, y, totalsColumns);
  drawTableRow(doc, y, totalsColumns, [
    formatMoney(finalRemaining),
    formatMoney(totalPaid),
    formatMoney(totalDue),
  ], { height: 52, bold: true, fill: ACCENT_LIGHT });
  pdf.finish();
  return pdf.done;
}

export function renderSummaryPdf({ title, subtitle, rows }) {
  const doc = createDocument();
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  doc.rect(48, 30, 499, 5).fill(ACCENT);
  doc.fillColor(ACCENT_DARK).font('bold').fontSize(22);
  doc.text(visual(title), 48, 42, { width: 499, align: 'right' });
  doc.font('regular').fontSize(11).fillColor('#000000');
  doc.text(visual(subtitle), 48, 73, { width: 499, align: 'right' });
  doc.moveTo(48, 98).lineTo(547, 98).lineWidth(1.2).strokeColor(BORDER).stroke();

  let y = 116;
  for (const row of rows) {
    const neededHeight = row.kind === 'heading' ? 38 : 30;
    if (y + neededHeight > 752) {
      doc.addPage();
      doc.fillColor(ACCENT_DARK).font('bold').fontSize(13);
      doc.text(visual(title), 48, 38, { width: 499, align: 'right' });
      doc.moveTo(48, 62).lineTo(547, 62).lineWidth(0.8).strokeColor(BORDER).stroke();
      y = 78;
    }
    if (row.kind === 'heading') {
      y += 8;
      doc.rect(48, y, 499, 30).fillAndStroke(ACCENT_LIGHT, BORDER);
      doc.font('bold').fontSize(12).fillColor(ACCENT_DARK);
      doc.text(visual(row.text), 58, y + 8, { width: 479, align: 'right', lineBreak: false });
      y += 30;
      continue;
    }
    y = drawPair(doc, y, row.label, row.value, row.emphasis);
  }
  doc.end();
  return done;
}
