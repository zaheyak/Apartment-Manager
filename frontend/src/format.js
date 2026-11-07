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

export const MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

export const AUDIT_LABELS = {
  create_apartment: 'יצירת דירה',
  update_apartment: 'עדכון דירה',
  create_lease: 'שיבוץ דייר',
  update_lease: 'עדכון שכירות',
  end_lease: 'סיום שכירות',
  create_month: 'פתיחת חודש',
  update_month: 'עדכון חודש',
  create_payment: 'רישום תשלום',
};

export function monthLabel(year, month) {
  return `${MONTHS[month - 1]} ${year}`;
}

export function formatDate(iso) {
  if (!iso) return '—';
  const [year, month, day] = String(iso).slice(0, 10).split('-');
  if (!day) return '—';
  return `${day}/${month}/${year}`;
}

export function formatMoney(value) {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

export function formatQty(value) {
  if (value == null || value === '') return '—';
  return new Intl.NumberFormat('he-IL', { maximumFractionDigits: 3 }).format(Number(value));
}

export function statusClass(status) {
  if (status === 'paid' || status === 'occupied') return 'bg-emerald-50 text-emerald-800';
  if (status === 'partial') return 'bg-amber-50 text-amber-800';
  if (status === 'unpaid') return 'bg-rose-50 text-rose-800';
  return 'bg-slate-100 text-slate-700';
}
