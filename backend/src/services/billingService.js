import { AppError } from '../lib/errors.js';
import { chargeAmount, money, qty, roundQty, toCents } from '../lib/money.js';
import { pool } from '../db/pool.js';
import { groupCharges, loadCharges } from './chargeQueries.js';

async function audit(db, adminId, apartmentId, action, beforeData, afterData) {
  await db.query(
    `INSERT INTO audit_logs (admin_id, apartment_id, entity_type, entity_id, action, before_data, after_data)
     VALUES ($1, $2, 'monthly_charge', $3, $4, $5, $6)`,
    [adminId, apartmentId, apartmentId, action, beforeData ?? null, afterData ?? null],
  );
}

async function previousReading(db, apartmentId, category, year, month) {
  const { rows } = await db.query(
    `SELECT current_reading
     FROM monthly_charges
     WHERE apartment_id = $1
       AND category = $2
       AND (charge_year < $3 OR (charge_year = $3 AND charge_month < $4))
     ORDER BY charge_year DESC, charge_month DESC
     LIMIT 1`,
    [apartmentId, category, year, month],
  );
  return rows[0] ? Number(rows[0].current_reading) : null;
}

async function tariffFor(db, meterType, year, month) {
  const { rows } = await db.query(
    `SELECT price
     FROM utility_tariffs
     WHERE meter_type = $1 AND effective_from <= make_date($2, $3, 1)
     ORDER BY effective_from DESC, created_at DESC
     LIMIT 1`,
    [meterType, year, month],
  );
  if (!rows[0]) {
    throw new AppError(400, meterType === 'electricity' ? 'לא הוגדר תעריף חשמל' : 'לא הוגדר תעריף מים');
  }
  return Number(rows[0].price);
}

function resolveReading(categoryLabel, input, storedPrevious) {
  const previous = input.previous ?? storedPrevious;
  if (previous == null || Number.isNaN(Number(previous))) {
    throw new AppError(400, `יש להזין קריאה קודמת עבור ${categoryLabel}`);
  }
  const current = Number(input.current);
  if (current < Number(previous)) {
    throw new AppError(400, `קריאת ${categoryLabel} הנוכחית נמוכה מהקריאה הקודמת`);
  }
  const consumption = roundQty(current - Number(previous));
  return { previous: Number(previous), current, consumption };
}

async function activeLease(db, apartmentId) {
  const { rows } = await db.query(
    `SELECT id, monthly_rent FROM leases WHERE apartment_id = $1 AND status = 'active'`,
    [apartmentId],
  );
  return rows[0] || null;
}

export async function readingPreview(apartmentId, year, month) {
  const exists = await pool.query(
    `SELECT 1 FROM monthly_charges WHERE apartment_id = $1 AND charge_year = $2 AND charge_month = $3 LIMIT 1`,
    [apartmentId, year, month],
  );
  const lease = await activeLease(pool, apartmentId);
  const [electricityPrevious, waterPrevious, electricityTariff, waterTariff] = await Promise.all([
    previousReading(pool, apartmentId, 'electricity', year, month),
    previousReading(pool, apartmentId, 'water', year, month),
    tariffFor(pool, 'electricity', year, month),
    tariffFor(pool, 'water', year, month),
  ]);
  return {
    monthExists: Boolean(exists.rows[0]),
    rentSuggestion: money(lease ? lease.monthly_rent : 0),
    electricity: {
      previous: electricityPrevious == null ? null : qty(electricityPrevious),
      tariff: Number(electricityTariff).toFixed(4),
    },
    water: {
      previous: waterPrevious == null ? null : qty(waterPrevious),
      tariff: Number(waterTariff).toFixed(4),
    },
  };
}

async function insertUtility(client, { apartmentId, year, month, category, reading, tariff }) {
  const { rows: meters } = await client.query(
    `SELECT id FROM meters WHERE apartment_id = $1 AND meter_type = $2`,
    [apartmentId, category],
  );
  const meterReading = await client.query(
    `INSERT INTO meter_readings (meter_id, charge_year, charge_month, previous_value, current_value, consumption)
     VALUES ($1, $2, $3, $4::numeric(14,3), $5::numeric(14,3), $5::numeric(14,3) - $4::numeric(14,3))
     RETURNING id, consumption`,
    [meters[0].id, year, month, reading.previous, reading.current],
  );
  const consumption = Number(meterReading.rows[0].consumption);
  const amount = chargeAmount(consumption, tariff);
  await client.query(
    `INSERT INTO monthly_charges (
      apartment_id, meter_reading_id, charge_year, charge_month, category,
      amount_due, tariff_price, previous_reading, current_reading, consumption
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8::numeric(14,3),$9::numeric(14,3), $9::numeric(14,3) - $8::numeric(14,3)
    )`,
    [
      apartmentId,
      meterReading.rows[0].id,
      year,
      month,
      category,
      amount,
      tariff,
      reading.previous,
      reading.current,
    ],
  );
}

async function createMonthInTransaction(client, apartmentId, input, adminId, { skipExisting = false } = {}) {
  const existing = await client.query(
    `SELECT 1 FROM monthly_charges WHERE apartment_id = $1 AND charge_year = $2 AND charge_month = $3 LIMIT 1`,
    [apartmentId, input.year, input.month],
  );
  if (existing.rows[0]) {
    if (skipExisting) return false;
    throw new AppError(409, 'כבר קיים חיוב לחודש זה');
  }

  const lease = await activeLease(client, apartmentId);
  const rentAmount = input.rentAmount ?? (lease ? Number(lease.monthly_rent) : 0);
  const electricityTariff = input.electricity
    ? input.electricity.tariffPrice
      ?? await tariffFor(client, 'electricity', input.year, input.month)
    : null;
  const waterTariff = input.water
    ? input.water.tariffPrice
      ?? await tariffFor(client, 'water', input.year, input.month)
    : null;
  const electricity = input.electricity
    ? resolveReading(
      'חשמל',
      input.electricity,
      await previousReading(client, apartmentId, 'electricity', input.year, input.month),
    )
    : null;
  const water = input.water
    ? resolveReading(
      'מים',
      input.water,
      await previousReading(client, apartmentId, 'water', input.year, input.month),
    )
    : null;

  await client.query(
    `INSERT INTO monthly_charges (apartment_id, lease_id, charge_year, charge_month, category, amount_due)
     VALUES ($1, $2, $3, $4, 'rent', $5)`,
    [apartmentId, lease?.id ?? null, input.year, input.month, rentAmount],
  );
  if (electricity) {
    await insertUtility(client, {
      apartmentId,
      year: input.year,
      month: input.month,
      category: 'electricity',
      reading: electricity,
      tariff: electricityTariff,
    });
  }
  if (water) {
    await insertUtility(client, {
      apartmentId,
      year: input.year,
      month: input.month,
      category: 'water',
      reading: water,
      tariff: waterTariff,
    });
  }
  await audit(client, adminId, apartmentId, 'create_month', null, {
    year: input.year,
    month: input.month,
    rentAmount,
    electricity,
    water,
    electricityTariff,
    waterTariff,
    source: input.source || 'manual',
  });
  return true;
}

export async function createMonth(apartmentId, input, adminId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const apartment = await client.query('SELECT id FROM apartments WHERE id = $1 FOR UPDATE', [apartmentId]);
    if (!apartment.rows[0]) throw new AppError(404, 'הדירה לא נמצאה');
    await createMonthInTransaction(client, apartmentId, input, adminId);
    await client.query('COMMIT');
    return getMonths(apartmentId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function importMonthPartsInTransaction(client, apartmentId, input, adminId) {
  const existing = await client.query(
    `SELECT category FROM monthly_charges
     WHERE apartment_id = $1 AND charge_year = $2 AND charge_month = $3`,
    [apartmentId, input.year, input.month],
  );
  const existingCategories = new Set(existing.rows.map((row) => row.category));
  const importedCategories = [];

  if (input.rentAmount != null && !existingCategories.has('rent')) {
    const lease = await activeLease(client, apartmentId);
    await client.query(
      `INSERT INTO monthly_charges (apartment_id, lease_id, charge_year, charge_month, category, amount_due)
       VALUES ($1, $2, $3, $4, 'rent', $5)`,
      [apartmentId, lease?.id ?? null, input.year, input.month, input.rentAmount],
    );
    importedCategories.push('rent');
  }

  for (const [category, label] of [['electricity', 'חשמל'], ['water', 'מים']]) {
    const readingInput = input[category];
    if (!readingInput || existingCategories.has(category)) continue;
    const tariff = readingInput.tariffPrice
      ?? await tariffFor(client, category, input.year, input.month);
    const reading = resolveReading(
      label,
      readingInput,
      await previousReading(client, apartmentId, category, input.year, input.month),
    );
    await insertUtility(client, {
      apartmentId,
      year: input.year,
      month: input.month,
      category,
      reading,
      tariff,
    });
    importedCategories.push(category);
  }

  if (importedCategories.length) {
    await audit(client, adminId, apartmentId, 'create_month', null, {
      year: input.year,
      month: input.month,
      source: 'excel_import',
      importedCategories,
    });
  }
  return importedCategories.length > 0;
}

export async function importMonths(apartmentId, rows, adminId) {
  const client = await pool.connect();
  let imported = 0;
  let skipped = 0;
  try {
    await client.query('BEGIN');
    const apartment = await client.query('SELECT id FROM apartments WHERE id = $1 FOR UPDATE', [apartmentId]);
    if (!apartment.rows[0]) throw new AppError(404, 'הדירה לא נמצאה');
    const ordered = [...rows].sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month));
    for (const row of ordered) {
      const created = await importMonthPartsInTransaction(client, apartmentId, row, adminId);
      if (created) imported += 1;
      else skipped += 1;
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return {
    imported,
    skipped,
    months: await getMonths(apartmentId),
  };
}

async function allocatedCents(client, chargeId) {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(amount), 0) AS paid FROM payment_allocations WHERE monthly_charge_id = $1`,
    [chargeId],
  );
  return toCents(rows[0].paid);
}

async function updateUtilityCharge(client, charge, readingInput) {
  if (!readingInput) return null;
  const previous = readingInput.previous ?? Number(charge.previous_reading);
  const current = readingInput.current ?? Number(charge.current_reading);
  const tariffPrice = readingInput.tariffPrice ?? Number(charge.tariff_price);
  if (current < previous) {
    throw new AppError(400, 'קריאה נוכחית אינה יכולה להיות נמוכה מהקריאה הקודמת');
  }
  const estimate = chargeAmount(roundQty(current - previous), tariffPrice);
  const paid = await allocatedCents(client, charge.id);
  if (toCents(estimate) < paid) {
    throw new AppError(400, 'לא ניתן להקטין חיוב מתחת לסכום שכבר שולם');
  }
  const updated = await client.query(
    `UPDATE meter_readings
     SET previous_value = $1::numeric(14,3),
         current_value = $2::numeric(14,3),
         consumption = $2::numeric(14,3) - $1::numeric(14,3)
     WHERE id = $3
     RETURNING consumption`,
    [previous, current, charge.meter_reading_id],
  );
  const consumption = Number(updated.rows[0].consumption);
  const amount = chargeAmount(consumption, tariffPrice);
  await client.query(
    `UPDATE monthly_charges
     SET previous_reading = $1::numeric(14,3),
         current_reading = $2::numeric(14,3),
         consumption = $2::numeric(14,3) - $1::numeric(14,3),
         amount_due = $3,
         tariff_price = $4,
         updated_at = now()
     WHERE id = $5`,
    [previous, current, amount, tariffPrice, charge.id],
  );
  return { previous, current, consumption, tariffPrice, amount };
}

export async function updateMonth(apartmentId, year, month, input, adminId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM monthly_charges
       WHERE apartment_id = $1 AND charge_year = $2 AND charge_month = $3
       FOR UPDATE`,
      [apartmentId, year, month],
    );
    if (!rows.length) throw new AppError(404, 'החודש לא נמצא');
    const byCategory = Object.fromEntries(rows.map((row) => [row.category, row]));
    const before = rows.map((row) => ({
      category: row.category,
      amountDue: Number(row.amount_due),
      previous: row.previous_reading == null ? null : Number(row.previous_reading),
      current: row.current_reading == null ? null : Number(row.current_reading),
      tariffPrice: row.tariff_price == null ? null : Number(row.tariff_price),
    }));

    if (input.rentAmount != null) {
      const paid = await allocatedCents(client, byCategory.rent.id);
      if (toCents(input.rentAmount) < paid) {
        throw new AppError(400, 'לא ניתן להקטין את שכר הדירה מתחת לסכום שכבר שולם');
      }
      await client.query(
        `UPDATE monthly_charges SET amount_due = $1, updated_at = now() WHERE id = $2`,
        [input.rentAmount, byCategory.rent.id],
      );
    }
    const electricity = await updateUtilityCharge(client, byCategory.electricity, input.electricity);
    const water = await updateUtilityCharge(client, byCategory.water, input.water);
    await audit(client, adminId, apartmentId, 'update_month', { year, month, charges: before }, {
      year,
      month,
      rentAmount: input.rentAmount ?? null,
      electricity,
      water,
    });
    await client.query('COMMIT');
    return getMonths(apartmentId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getMonths(apartmentId, year) {
  const rows = await loadCharges(pool, apartmentId, year);
  return groupCharges(rows);
}
