import ExcelJS from 'exceljs';
import {
  CATEGORY_LABELS,
  METHOD_LABELS,
  STATUS_LABELS,
  formatDate,
  monthLabel,
} from '../lib/labels.js';

function styleWorkbook(workbook, sheet) {
  workbook.views = [{ rightToLeft: true }];
  sheet.views = [{ rightToLeft: true, state: 'frozen', ySplit: 1 }];
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2744' } };
  sheet.columns.forEach((column) => {
    column.alignment = { horizontal: 'right' };
  });
}

export async function apartmentHistoryWorkbook(apartment, months) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ניהול דירות';
  const sheet = workbook.addWorksheet('היסטוריה חודשית');
  sheet.columns = [
    { header: 'חודש', key: 'month', width: 18 },
    { header: 'יתרת פתיחה', key: 'openingBalance', width: 16 },
    { header: 'שכר דירה', key: 'rent', width: 14 },
    { header: 'חשמל קודם', key: 'ePrev', width: 14 },
    { header: 'חשמל נוכחי', key: 'eCurr', width: 14 },
    { header: 'צריכת חשמל', key: 'eUse', width: 14 },
    { header: 'מחיר חשמל להכפלה', key: 'eTariff', width: 18 },
    { header: 'חיוב חשמל', key: 'eCharge', width: 14 },
    { header: 'מים קודם', key: 'wPrev', width: 14 },
    { header: 'מים נוכחי', key: 'wCurr', width: 14 },
    { header: 'צריכת מים', key: 'wUse', width: 14 },
    { header: 'מחיר מים להכפלה', key: 'wTariff', width: 18 },
    { header: 'חיוב מים', key: 'wCharge', width: 14 },
    { header: 'סך חיובים', key: 'total', width: 14 },
    { header: 'סך ששולם', key: 'paid', width: 14 },
    { header: 'יתרה', key: 'remaining', width: 14 },
    { header: 'יתרה מצטברת', key: 'cumulativeRemaining', width: 16 },
  ];
  for (const month of months) {
    sheet.addRow({
      month: monthLabel(month.year, month.month),
      openingBalance: Number(month.openingBalance),
      rent: month.rent ? Number(month.rent.amountDue) : null,
      ePrev: month.electricity ? Number(month.electricity.previousReading) : null,
      eCurr: month.electricity ? Number(month.electricity.currentReading) : null,
      eUse: month.electricity ? Number(month.electricity.consumption) : null,
      eTariff: month.electricity ? Number(month.electricity.tariffPrice) : null,
      eCharge: month.electricity ? Number(month.electricity.amountDue) : null,
      wPrev: month.water ? Number(month.water.previousReading) : null,
      wCurr: month.water ? Number(month.water.currentReading) : null,
      wUse: month.water ? Number(month.water.consumption) : null,
      wTariff: month.water ? Number(month.water.tariffPrice) : null,
      wCharge: month.water ? Number(month.water.amountDue) : null,
      total: Number(month.totalDue),
      paid: Number(month.totalPaid),
      remaining: Number(month.remaining),
      cumulativeRemaining: Number(month.cumulativeRemaining),
    });
  }
  const totals = months.reduce(
    (sum, month) => {
      sum.rent += Number(month.rent?.amountDue || 0);
      sum.eUse += Number(month.electricity?.consumption || 0);
      sum.eCharge += Number(month.electricity?.amountDue || 0);
      sum.wUse += Number(month.water?.consumption || 0);
      sum.wCharge += Number(month.water?.amountDue || 0);
      sum.total += Number(month.totalDue);
      sum.paid += Number(month.totalPaid);
      sum.remaining += Number(month.remaining);
      return sum;
    },
    { rent: 0, eUse: 0, eCharge: 0, wUse: 0, wCharge: 0, total: 0, paid: 0, remaining: 0 },
  );
  const totalRow = sheet.addRow({
    month: 'סה"כ',
    rent: totals.rent,
    eUse: totals.eUse,
    eCharge: totals.eCharge,
    wUse: totals.wUse,
    wCharge: totals.wCharge,
    total: totals.total,
    paid: totals.paid,
    remaining: totals.remaining,
  });
  totalRow.font = { bold: true };
  styleWorkbook(workbook, sheet);
  const payments = workbook.addWorksheet('תשלומים');
  payments.columns = [
    { header: 'תאריך', key: 'date', width: 16 },
    { header: 'סכום', key: 'amount', width: 14 },
    { header: 'אמצעי', key: 'method', width: 18 },
    { header: 'קטגוריה', key: 'category', width: 18 },
    { header: 'חודש', key: 'month', width: 18 },
    { header: 'אסמכתא', key: 'reference', width: 18 },
    { header: 'הערות', key: 'notes', width: 30 },
  ];
  styleWorkbook(workbook, payments);
  return workbook;
}

export function addPaymentRows(workbook, payments) {
  const sheet = workbook.getWorksheet('תשלומים');
  for (const payment of payments) {
    sheet.addRow({
      date: formatDate(payment.paymentDate),
      amount: Number(payment.amount),
      method: METHOD_LABELS[payment.method],
      category: CATEGORY_LABELS[payment.category],
      month: monthLabel(payment.billingYear, payment.billingMonth),
      reference: payment.referenceNumber || '',
      notes: payment.notes || '',
    });
  }
}

export async function buildingWorkbook(report) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('בניין');
  sheet.columns = [
    { header: 'דירה', key: 'number', width: 12 },
    { header: 'קומה', key: 'floor', width: 12 },
    { header: 'סטטוס', key: 'status', width: 14 },
    { header: 'דייר', key: 'tenant', width: 22 },
    { header: 'טלפון', key: 'phone', width: 16 },
    { header: 'שכר דירה חודשי', key: 'rent', width: 18 },
    { header: 'יתרת שכר דירה', key: 'rentDue', width: 18 },
    { header: 'יתרת חשמל', key: 'electricity', width: 16 },
    { header: 'יתרת מים', key: 'water', width: 16 },
    { header: 'שולם', key: 'paid', width: 14 },
    { header: 'יתרה כוללת', key: 'outstanding', width: 16 },
  ];
  for (const apartment of report.apartments) {
    sheet.addRow({
      number: apartment.number,
      floor: apartment.floor,
      status: STATUS_LABELS[apartment.status],
      tenant: apartment.tenantName || '',
      phone: apartment.tenantPhone || '',
      rent: Number(apartment.monthlyRent || 0),
      rentDue: Number(apartment.rentOutstanding),
      electricity: Number(apartment.electricityOutstanding),
      water: Number(apartment.waterOutstanding),
      paid: Number(apartment.totalPaid),
      outstanding: Number(apartment.outstanding),
    });
  }
  sheet.addRow({
    number: 'סה"כ',
    rent: Number(report.totals.monthlyRent),
    paid: Number(report.totals.paymentsReceived),
    outstanding: Number(report.totals.outstanding),
    electricity: report.apartments.reduce((sum, apartment) => sum + Number(apartment.electricityOutstanding), 0),
    water: report.apartments.reduce((sum, apartment) => sum + Number(apartment.waterOutstanding), 0),
    rentDue: report.apartments.reduce((sum, apartment) => sum + Number(apartment.rentOutstanding), 0),
  });
  styleWorkbook(workbook, sheet);
  return workbook;
}

export async function workbookBuffer(workbook) {
  return workbook.xlsx.writeBuffer();
}
