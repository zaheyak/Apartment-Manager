import ExcelJS from 'exceljs';
import { AppError } from '../lib/errors.js';
import { chargeAmount, roundQty } from '../lib/money.js';
import { pool } from '../db/pool.js';

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

const FIELD_ALIASES = {
  month: ['חודש', 'חודש חיוב', 'חודש ושנה', 'תקופה', 'תאריך חיוב'],
  year: ['שנה', 'שנת חיוב'],
  rentAmount: ['דמי שכירות', 'שכר דירה', 'שכירות', 'חיוב שכר דירה'],
  electricityPrevious: ['קריאת חשמל קודמת', 'חשמל קודם', 'קריאה קודמת חשמל'],
  electricityCurrent: ['קריאת חשמל נוכחית', 'חשמל נוכחי', 'קריאה נוכחית חשמל'],
  electricityConsumption: ['צריכת חשמל', 'צריכת חשמל קוטש', 'צריכת חשמל קוט״ש'],
  electricityTariff: ['תעריף חשמל', 'מחיר חשמל להכפלה', 'מחיר לקוטש', 'מחיר לקוט״ש'],
  electricityCharge: ['חיוב חשמל', 'עלות חשמל לתשלום', 'עלות חשמל'],
  waterPrevious: ['קריאת מים קודמת', 'מים קודם', 'קריאה קודמת מים'],
  waterCurrent: ['קריאת מים נוכחית', 'מים נוכחי', 'קריאה נוכחית מים'],
  waterConsumption: ['צריכת מים', 'צריכת מים קוב', 'צריכת מים מ״ק'],
  waterTariff: ['תעריף מים', 'מחיר מים להכפלה', 'מחיר לקוב', 'מחיר למ״ק'],
  waterCharge: ['חיוב מים', 'עלות מים לתשלום', 'עלות מים'],
};

function scalar(value) {
  if (value == null) return '';
  if (value instanceof Date) return value;
  if (typeof value !== 'object') return value;
  if ('result' in value) return value.result ?? '';
  if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('');
  if ('text' in value) return value.text;
  return String(value);
}

function normalize(value) {
  return String(scalar(value) ?? '')
    .normalize('NFKC')
    .replace(/[\u0591-\u05C7]/g, '')
    .replace(/[״"'׳()[\]{}:.,+\-_/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const NORMALIZED_ALIASES = Object.fromEntries(
  Object.entries(FIELD_ALIASES).map(([field, aliases]) => [field, aliases.map(normalize)]),
);

function fieldForHeader(value) {
  const header = normalize(value);
  if (!header) return null;
  for (const [field, aliases] of Object.entries(NORMALIZED_ALIASES)) {
    if (aliases.some((alias) => header === alias || (alias.length >= 8 && header.includes(alias)))) {
      return field;
    }
  }
  return null;
}

function detectTable(workbook) {
  let best = null;
  for (const worksheet of workbook.worksheets) {
    const maxRows = Math.min(worksheet.actualRowCount || worksheet.rowCount, 30);
    const maxColumns = Math.min(worksheet.actualColumnCount || worksheet.columnCount, 80);
    for (let rowNumber = 1; rowNumber <= maxRows; rowNumber += 1) {
      const fields = {};
      const rawHeaders = [];
      for (let column = 1; column <= maxColumns; column += 1) {
        const value = scalar(worksheet.getRow(rowNumber).getCell(column).value);
        const field = fieldForHeader(value);
        if (value !== '') rawHeaders.push(normalize(value));
        if (field && fields[field] == null) fields[field] = column;
      }
      const score = Object.keys(fields).length
        + (fields.month ? 4 : 0)
        + (fields.electricityCurrent ? 2 : 0)
        + (fields.waterCurrent ? 2 : 0);
      if (!best || score > best.score) {
        best = { worksheet, rowNumber, fields, rawHeaders, score };
      }
    }
  }
  if (!best || best.score < 6 || !best.fields.month) {
    throw new AppError(
      400,
      'לא נמצאה טבלה מתאימה. נדרשות לפחות עמודת חודש ועמודות קריאה נוכחית לחשמל ולמים.',
    );
  }
  return best;
}

function numeric(value) {
  const raw = scalar(value);
  if (raw === '' || raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const cleaned = String(raw)
    .replace(/[₪,\s]/g, '')
    .replace(/[^\d.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function excelSerialToDate(value) {
  if (typeof value !== 'number' || value < 20_000 || value > 80_000) return null;
  return new Date(Math.round((value - 25569) * 86400 * 1000));
}

function parsePeriod(monthValue, yearValue, defaultYear) {
  const raw = scalar(monthValue);
  const explicitYear = numeric(yearValue);
  const fallbackYear = explicitYear || Number(defaultYear);
  const date = raw instanceof Date ? raw : excelSerialToDate(raw);
  if (date && !Number.isNaN(date.getTime())) {
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
  }
  if (typeof raw === 'number' && raw >= 1 && raw <= 12 && fallbackYear) {
    return { year: fallbackYear, month: raw };
  }
  const text = normalize(raw);
  if (!text || /סה כ|סיכום|שולם עבור שנה/.test(text)) return null;
  let match = text.match(/\b(20\d{2})\D+(1[0-2]|0?[1-9])\b/);
  if (match) return { year: Number(match[1]), month: Number(match[2]) };
  match = text.match(/\b(1[0-2]|0?[1-9])\D+(20\d{2})\b/);
  if (match) return { year: Number(match[2]), month: Number(match[1]) };
  match = text.match(/\b(1[0-2]|0?[1-9])\b/);
  const monthNameIndex = HEBREW_MONTHS.findIndex((name) => text.includes(name));
  const yearMatch = text.match(/\b(20\d{2})\b/);
  const month = monthNameIndex >= 0 ? monthNameIndex + 1 : Number(match?.[1]);
  const year = Number(yearMatch?.[1] || fallbackYear);
  if (month >= 1 && month <= 12 && year >= 2000 && year <= 2100) return { year, month };
  return null;
}

function resolvedUtility(raw, label) {
  let previous = raw.previous;
  let current = raw.current;
  let consumption = raw.consumption;
  let tariffPrice = raw.tariffPrice;
  const amount = raw.amount;
  if (consumption == null && previous != null && current != null) {
    consumption = roundQty(current - previous);
  }
  if (current == null && previous != null && consumption != null) {
    current = roundQty(previous + consumption);
  }
  if (previous == null && current != null && consumption != null) {
    previous = roundQty(current - consumption);
  }
  if (tariffPrice == null && amount != null && consumption > 0) {
    tariffPrice = Number((amount / consumption).toFixed(4));
  }
  const errors = [];
  const warnings = [];
  if (current == null) errors.push(`חסרה קריאה נוכחית עבור ${label}`);
  if (previous != null && current != null && current < previous) {
    errors.push(`הקריאה הנוכחית של ${label} נמוכה מהקריאה הקודמת`);
  }
  if (consumption != null && consumption < 0) errors.push(`צריכת ${label} אינה תקינה`);
  if (tariffPrice != null && tariffPrice < 0) errors.push(`תעריף ${label} אינו תקין`);
  if (amount != null && tariffPrice != null && consumption != null) {
    const calculated = chargeAmount(consumption, tariffPrice);
    if (Math.abs(calculated - amount) > 0.02) {
      warnings.push(`חיוב ${label} יחושב מחדש לפי הצריכה והתעריף`);
    }
  }
  return {
    data: {
      ...(previous != null ? { previous: roundQty(previous) } : {}),
      ...(current != null ? { current: roundQty(current) } : {}),
      ...(tariffPrice != null ? { tariffPrice: Number(tariffPrice.toFixed(4)) } : {}),
    },
    consumption: consumption == null ? null : roundQty(consumption),
    errors,
    warnings,
  };
}

export async function previewApartmentExcel(apartmentId, buffer, defaultYear) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new AppError(400, 'לא ניתן לקרוא את הקובץ. יש להעלות קובץ Excel מסוג XLSX.');
  }
  const table = detectTable(workbook);
  const { worksheet, rowNumber: headerRow, fields } = table;
  const existing = await pool.query(
    `SELECT DISTINCT charge_year, charge_month
     FROM monthly_charges
     WHERE apartment_id = $1`,
    [apartmentId],
  );
  const existingKeys = new Set(existing.rows.map((row) => `${row.charge_year}-${row.charge_month}`));
  const rows = [];
  const seen = new Set();

  for (let rowNumber = headerRow + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const value = (field) => (fields[field] ? scalar(row.getCell(fields[field]).value) : null);
    const period = parsePeriod(value('month'), value('year'), defaultYear);
    const hasData = Object.values(fields).some((column) => normalize(row.getCell(column).value));
    if (!hasData) continue;
    if (!period) {
      const monthText = normalize(value('month'));
      if (/סה כ|סיכום|שולם עבור שנה/.test(monthText)) continue;
      rows.push({
        sourceRow: rowNumber,
        errors: ['לא ניתן לזהות חודש ושנה בשורה'],
        warnings: [],
        duplicate: false,
        canImport: false,
      });
      continue;
    }

    const electricity = resolvedUtility({
      previous: numeric(value('electricityPrevious')),
      current: numeric(value('electricityCurrent')),
      consumption: numeric(value('electricityConsumption')),
      tariffPrice: numeric(value('electricityTariff')),
      amount: numeric(value('electricityCharge')),
    }, 'חשמל');
    const water = resolvedUtility({
      previous: numeric(value('waterPrevious')),
      current: numeric(value('waterCurrent')),
      consumption: numeric(value('waterConsumption')),
      tariffPrice: numeric(value('waterTariff')),
      amount: numeric(value('waterCharge')),
    }, 'מים');
    const key = `${period.year}-${period.month}`;
    const duplicate = existingKeys.has(key) || seen.has(key);
    seen.add(key);
    const errors = [...electricity.errors, ...water.errors];
    const warnings = [...electricity.warnings, ...water.warnings];
    if (existingKeys.has(key)) warnings.push('החודש כבר קיים במערכת וידולג');
    if (duplicate && !existingKeys.has(key)) errors.push('החודש מופיע יותר מפעם אחת בקובץ');
    const rentAmount = numeric(value('rentAmount'));
    rows.push({
      sourceRow: rowNumber,
      year: period.year,
      month: period.month,
      ...(rentAmount != null ? { rentAmount } : {}),
      electricity: electricity.data,
      water: water.data,
      electricityConsumption: electricity.consumption,
      waterConsumption: water.consumption,
      errors,
      warnings,
      duplicate,
      canImport: errors.length === 0 && !duplicate,
    });
  }

  if (!rows.length) throw new AppError(400, 'לא נמצאו שורות נתונים בקובץ.');
  const ignoredPaymentColumns = table.rawHeaders.some(
    (header) => header.includes('שולם') || header.includes('סטטוס') || header.includes('אמצעי תשלום'),
  );
  return {
    sheetName: worksheet.name,
    headerRow,
    rows,
    importableCount: rows.filter((row) => row.canImport).length,
    duplicateCount: rows.filter((row) => row.duplicate).length,
    errorCount: rows.filter((row) => row.errors.length > 0).length,
    notices: ignoredPaymentColumns
      ? ['עמודות סטטוס או „שולם עד” אינן יוצרות תשלום. תשלומים מיובאים רק כאשר קיימים סכום, תאריך ואמצעי תשלום מלאים.']
      : [],
  };
}
