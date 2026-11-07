export function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function money(value) {
  return roundMoney(value).toFixed(2);
}

export function toCents(value) {
  return Math.round(Number(value) * 100);
}

export function fromCents(cents) {
  return (cents / 100).toFixed(2);
}

export function roundQty(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
}

export function qty(value) {
  return roundQty(value).toFixed(3);
}

export function chargeAmount(consumption, tariff) {
  return money(roundQty(consumption) * Number(tariff));
}

export function chargeStatus(due, paid) {
  const dueCents = toCents(due);
  const paidCents = toCents(paid);
  if (paidCents <= 0) return dueCents === 0 ? 'paid' : 'unpaid';
  if (paidCents < dueCents) return 'partial';
  return 'paid';
}
