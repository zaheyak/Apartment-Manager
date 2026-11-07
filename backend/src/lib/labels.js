export const METHOD_LABELS = {
  cash: 'מזומן',
  bank_transfer: 'העברה בנקאית',
  check: "צ'ק",
  other: 'אחר',
};

export const CATEGORY_LABELS = {
  rent: 'שכר דירה',
  electricity: 'חשמל',
  water: 'מים',
  multiple: 'מספר חיובים',
};

export const STATUS_LABELS = {
  unpaid: 'לא שולם',
  partial: 'שולם חלקית',
  paid: 'שולם',
  occupied: 'מאוכלסת',
  vacant: 'פנויה',
};

export const MONTHS_HE = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
];

export function monthLabel(year, month) {
  return `${MONTHS_HE[month - 1]} ${year}`;
}

export function formatDate(iso) {
  if (!iso) return '';
  const [year, month, day] = String(iso).slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

export function formatMoney(value) {
  const amount = Number(value || 0).toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `₪${amount}`;
}

export function formatQty(value, unit) {
  const amount = Number(value || 0).toLocaleString('he-IL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
  return unit ? `${amount} ${unit}` : amount;
}
