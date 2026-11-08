import ExcelJS from 'exceljs';

const base = process.env.API_URL || 'http://localhost:4000/api';
const testYear = 2099;

async function request(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status} ${data?.error || text}`);
  }
  return data;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const login = await request('/auth/login', {
  method: 'POST',
  body: { username: 'Rani', password: 'zezeee' },
});
const token = login.token;
const auth = { token };

const apartment = await request('/apartments', {
  method: 'POST',
  ...auth,
  body: {
    number: `בדיקה-${Date.now() % 100000}`,
    floor: '2',
    notes: 'דירת בדיקה',
    tenant: {
      fullName: 'ישראל ישראלי',
      phone: '050-0000000',
      monthlyRent: 3300,
      startDate: `${testYear}-01-01`,
      endDate: `${testYear}-12-31`,
    },
  },
});

await request('/tariffs', {
  method: 'POST',
  ...auth,
  body: { meterType: 'electricity', price: 1.6, effectiveFrom: `${testYear}-01-01` },
});
await request('/tariffs', {
  method: 'POST',
  ...auth,
  body: { meterType: 'water', price: 7.5, effectiveFrom: `${testYear}-01-01` },
});

const months = await request(`/apartments/${apartment.id}/months`, {
  method: 'POST',
  ...auth,
  body: {
    year: testYear,
    month: 1,
    electricity: { previous: 1000, current: 1220 },
    water: { previous: 100, current: 120.74 },
  },
});
const january = months.find((month) => month.year === testYear && month.month === 1);
assert(january.rent.amountDue === '3300.00', `rent ${january.rent.amountDue}`);
assert(january.electricity.consumption === '220.000', `kwh ${january.electricity.consumption}`);
assert(january.electricity.amountDue === '352.00', `elec ${january.electricity.amountDue}`);
assert(january.water.consumption === '20.740', `water use ${january.water.consumption}`);
assert(january.water.amountDue === '155.55', `water ${january.water.amountDue}`);
assert(january.totalDue === '3807.55', `total ${january.totalDue}`);

let failed = false;
try {
  await request(`/apartments/${apartment.id}/months`, {
    method: 'POST',
    ...auth,
    body: {
      year: testYear,
      month: 1,
      electricity: { current: 1300 },
      water: { current: 130 },
    },
  });
} catch (error) {
  failed = error.message.includes('409');
}
assert(failed, 'duplicate month should fail');

failed = false;
try {
  await request(`/apartments/${apartment.id}/months`, {
    method: 'POST',
    ...auth,
    body: {
      year: testYear,
      month: 2,
      electricity: { current: 1200 },
      water: { current: 130 },
    },
  });
} catch (error) {
  failed = error.message.includes('400');
}
assert(failed, 'lower meter reading should fail');

const partial = await request(`/apartments/${apartment.id}/payments`, {
  method: 'POST',
  ...auth,
  body: {
    paymentDate: `${testYear}-01-10`,
    amount: 2000,
    method: 'bank_transfer',
    category: 'multiple',
    billingYear: testYear,
    billingMonth: 1,
    referenceNumber: 'TR-100',
    notes: 'הערת בדיקה עבור אישור התשלום',
  },
});
assert(partial.snapshot.totalDue === '3807.55', 'receipt total');
assert(partial.snapshot.paidNow === '2000.00', 'paid now');
assert(partial.snapshot.remainingAfter === '1807.55', `remaining ${partial.snapshot.remainingAfter}`);
assert(partial.snapshot.status === 'partial', 'partial status');
assert(partial.snapshot.lines[0].paidNow === '2000.00', 'allocated to rent first');
assert(partial.snapshot.disclaimer.includes('אינו חשבונית מס'), 'disclaimer');
assert(partial.snapshot.statement.totalDue === '3807.55', 'receipt monthly statement total');
assert(partial.snapshot.statement.electricity.previousReading === '1000.000', 'receipt electricity reading');
assert(partial.snapshot.statement.water.currentReading === '120.740', 'receipt water reading');
assert(partial.snapshot.statement.cumulativeRemaining === '1807.55', 'receipt accumulated balance');
assert(partial.snapshot.accountRemainingAfter === '1807.55', 'payment receipt remaining balance');
assert(partial.snapshot.notes === 'הערת בדיקה עבור אישור התשלום', 'receipt payment note');

const rest = await request(`/apartments/${apartment.id}/payments`, {
  method: 'POST',
  ...auth,
  body: {
    paymentDate: `${testYear}-01-20`,
    amount: 1807.55,
    method: 'cash',
    category: 'multiple',
    billingYear: testYear,
    billingMonth: 1,
  },
});
assert(rest.snapshot.remainingAfter === '0.00', 'balance cleared');
assert(rest.snapshot.status === 'paid', 'paid status');

await request('/tariffs', {
  method: 'POST',
  ...auth,
  body: { meterType: 'electricity', price: 1.6, effectiveFrom: `${testYear}-03-01` },
});
const updatedTariffMonths = await request(`/apartments/${apartment.id}/months`, {
  method: 'POST',
  ...auth,
  body: {
    year: testYear,
    month: 3,
    electricity: { current: 1320 },
    water: { current: 130.74 },
  },
});
await request('/tariffs', {
  method: 'POST',
  ...auth,
  body: { meterType: 'electricity', price: 9, effectiveFrom: `${testYear}-03-01` },
});
const march = updatedTariffMonths.find((month) => month.month === 3);
assert(march.electricity.tariffPrice === '1.6000', `historical tariff ${march.electricity.tariffPrice}`);
assert(january.electricity.tariffPrice === '1.6000', 'january tariff preserved in memory');

const afterTariff = await request(`/apartments/${apartment.id}/months?year=${testYear}`, { ...auth });
const januaryAfter = afterTariff.find((month) => month.month === 1);
assert(januaryAfter.rent.amountPaid === '3300.00', 'rent paid amount');
assert(januaryAfter.rent.paymentDetails.some((payment) => payment.method === 'bank_transfer'), 'rent bank transfer details');
assert(januaryAfter.rent.paymentDetails.some((payment) => payment.method === 'cash'), 'rent cash details');
assert(januaryAfter.electricity.amountPaid === '352.00', 'electricity paid amount');
assert(januaryAfter.electricity.paymentDetails[0].method === 'cash', 'electricity payment method');
assert(januaryAfter.water.amountPaid === '155.55', 'water paid amount');
assert(januaryAfter.water.paymentDetails[0].method === 'cash', 'water payment method');
const april = await request(`/apartments/${apartment.id}/months`, {
  method: 'POST',
  ...auth,
  body: {
    year: testYear,
    month: 4,
    electricity: { current: 1420 },
    water: { current: 140.74 },
  },
});
const aprilRow = april.find((month) => month.month === 4);
assert(januaryAfter.electricity.tariffPrice === '1.6000', 'old bill kept its tariff');
assert(aprilRow.electricity.tariffPrice === '9.0000', `new tariff ${aprilRow.electricity.tariffPrice}`);
assert(aprilRow.electricity.amountDue === '900.00', `april charge ${aprilRow.electricity.amountDue}`);

const customMultiplier = await request(`/apartments/${apartment.id}/months/${testYear}/4`, {
  method: 'PATCH',
  ...auth,
  body: {
    electricity: { tariffPrice: 2.5 },
    water: { tariffPrice: 8 },
  },
});
const customApril = customMultiplier.find((month) => month.month === 4);
assert(customApril.electricity.tariffPrice === '2.5000', 'editable electricity multiplier');
assert(customApril.electricity.amountDue === '250.00', 'electricity recalculated');
assert(customApril.water.tariffPrice === '8.0000', 'editable water multiplier');
assert(customApril.water.amountDue === '80.00', 'water recalculated');
assert(customApril.totalDue === '3630.00', `custom monthly total ${customApril.totalDue}`);
assert(customApril.openingBalance === '3535.00', `carried opening balance ${customApril.openingBalance}`);
assert(customApril.cumulativeRemaining === '7165.00', `accumulated debt ${customApril.cumulativeRemaining}`);

const cumulativePayment = await request(`/apartments/${apartment.id}/payments`, {
  method: 'POST',
  ...auth,
  body: {
    paymentDate: `${testYear}-04-20`,
    amount: 3600,
    method: 'bank_transfer',
    category: 'multiple',
    applyToOldest: true,
    billingYear: testYear,
    billingMonth: 4,
    referenceNumber: 'DEBT-100',
  },
});
assert(cumulativePayment.snapshot.applyToOldest === true, 'cumulative payment receipt');
assert(cumulativePayment.snapshot.remainingAfter === '3565.00', 'cumulative remaining after payment');
assert(cumulativePayment.snapshot.statement.cumulativeRemaining === '3565.00', 'statement cumulative balance');
const afterCumulativePayment = await request(
  `/apartments/${apartment.id}/months?year=${testYear}`,
  auth,
);
const paidMarch = afterCumulativePayment.find((month) => month.month === 3);
const partlyPaidApril = afterCumulativePayment.find((month) => month.month === 4);
assert(paidMarch.remaining === '0.00', 'oldest month paid first');
assert(partlyPaidApril.rent.amountPaid === '65.00', 'remainder continued into next month');
assert(partlyPaidApril.cumulativeRemaining === '3565.00', 'updated accumulated balance');

const importWorkbook = new ExcelJS.Workbook();
const importSheet = importWorkbook.addWorksheet('ייבוא');
importSheet.addRow([
  'חודש',
  'דמי שכירות',
  'קריאת חשמל קודמת',
  'קריאת חשמל נוכחית',
  'מחיר חשמל להכפלה',
  'קריאת מים קודמת',
  'קריאת מים נוכחית',
  'מחיר מים להכפלה',
]);
importSheet.addRow([
  `מאי ${testYear}`,
  3300,
  1420,
  1520,
  0.75,
  140.74,
  150.74,
  8.5,
]);
importSheet.addRow([
  `יוני ${testYear}`,
  3300,
  null,
  null,
  null,
  null,
  null,
  null,
]);
importSheet.addRow([
  `יולי ${testYear}`,
  null,
  1520,
  1600,
  0.8,
  null,
  null,
  null,
]);
const importBuffer = await importWorkbook.xlsx.writeBuffer();
const importForm = new FormData();
importForm.append('file', new Blob([importBuffer]), 'apartment-import.xlsx');
importForm.append('defaultYear', String(testYear));
const importPreviewResponse = await fetch(`${base}/apartments/${apartment.id}/import/preview`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: importForm,
});
const importPreview = await importPreviewResponse.json();
assert(importPreviewResponse.ok, `import preview ${importPreview.error || ''}`);
assert(importPreview.importableCount === 3, 'three importable Excel rows');
const importResult = await request(`/apartments/${apartment.id}/import/commit`, {
  method: 'POST',
  ...auth,
  body: {
    rows: importPreview.rows.filter((row) => row.canImport).map((row) => ({
      year: row.year,
      month: row.month,
      rentAmount: row.rentAmount,
      ...(row.electricity ? { electricity: row.electricity } : {}),
      ...(row.water ? { water: row.water } : {}),
    })),
  },
});
assert(importResult.imported === 3, 'Excel months imported');
const importedMay = importResult.months.find((month) => month.month === 5);
assert(importedMay.electricity.amountDue === '75.00', 'imported electricity calculated');
assert(importedMay.water.amountDue === '85.00', 'imported water calculated');
const importedJune = importResult.months.find((month) => month.month === 6);
assert(importedJune.rent.amountDue === '3300.00', 'rent-only Excel month imported');
assert(importedJune.electricity === null && importedJune.water === null, 'rent-only month has no meters');
const importedJuly = importResult.months.find((month) => month.month === 7);
assert(importedJuly.rent === null && importedJuly.water === null, 'electricity-only month has no unrelated charges');
assert(importedJuly.electricity.amountDue === '64.00', 'electricity-only Excel month imported');

const pdf = await fetch(`${base}/receipts/${partial.id}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
const bytes = Buffer.from(await pdf.arrayBuffer());
assert(pdf.ok && bytes.subarray(0, 4).toString() === '%PDF', 'receipt pdf');

const summaryPdf = await fetch(
  `${base}/apartments/${apartment.id}/months/${testYear}/1/summary.pdf`,
  { headers: { Authorization: `Bearer ${token}` } },
);
const summaryBytes = Buffer.from(await summaryPdf.arrayBuffer());
assert(summaryPdf.ok && summaryBytes.subarray(0, 4).toString() === '%PDF', 'detailed monthly pdf');

const cumulativePdf = await fetch(
  `${base}/receipts/${cumulativePayment.id}/pdf`,
  { headers: { Authorization: `Bearer ${token}` } },
);
const cumulativePdfBytes = Buffer.from(await cumulativePdf.arrayBuffer());
assert(cumulativePdf.ok && cumulativePdfBytes.subarray(0, 4).toString() === '%PDF', 'cumulative payment pdf');

const historyPdf = await fetch(
  `${base}/apartments/${apartment.id}/history.pdf`,
  { headers: { Authorization: `Bearer ${token}` } },
);
const historyPdfBytes = Buffer.from(await historyPdf.arrayBuffer());
assert(historyPdf.ok && historyPdfBytes.subarray(0, 4).toString() === '%PDF', 'full history pdf');

const xlsx = await fetch(`${base}/apartments/${apartment.id}/history.xlsx`, {
  headers: { Authorization: `Bearer ${token}` },
});
const sheet = Buffer.from(await xlsx.arrayBuffer());
assert(xlsx.ok && sheet.subarray(0, 2).toString() === 'PK', 'excel export');

console.log('Verification passed');
console.log(`Apartment ${apartment.number}: January total ₪3,807.55, partial ₪2,000, then paid in full.`);
