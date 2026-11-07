import { pool } from '../db/pool.js';

export async function getSettings() {
  const building = await pool.query(
    `SELECT id, name, address, notes FROM buildings ORDER BY created_at LIMIT 1`,
  );
  const history = await pool.query(
    `SELECT id, meter_type, price, effective_from, created_at
     FROM utility_tariffs
     ORDER BY effective_from DESC, created_at DESC`,
  );
  const current = {};
  for (const type of ['electricity', 'water']) {
    const row = history.rows.find((item) => item.meter_type === type && item.effective_from <= new Date().toISOString().slice(0, 10))
      || history.rows.find((item) => item.meter_type === type);
    current[type] = row
      ? { price: Number(row.price).toFixed(4), effectiveFrom: row.effective_from }
      : null;
  }
  return {
    building: building.rows[0],
    tariffs: current,
    tariffHistory: history.rows.map((row) => ({
      id: row.id,
      meterType: row.meter_type,
      price: Number(row.price).toFixed(4),
      effectiveFrom: row.effective_from,
      createdAt: row.created_at,
    })),
  };
}

export async function updateBuilding(input) {
  const { rows } = await pool.query(
    `UPDATE buildings
     SET name = $1, address = $2, notes = $3
     WHERE id = (SELECT id FROM buildings ORDER BY created_at LIMIT 1)
     RETURNING id, name, address, notes`,
    [input.name, input.address || '', input.notes || ''],
  );
  return rows[0];
}

export async function addTariff(input) {
  const { rows } = await pool.query(
    `INSERT INTO utility_tariffs (meter_type, price, effective_from)
     VALUES ($1, $2, $3)
     RETURNING id, meter_type, price, effective_from`,
    [input.meterType, input.price, input.effectiveFrom],
  );
  return {
    id: rows[0].id,
    meterType: rows[0].meter_type,
    price: Number(rows[0].price).toFixed(4),
    effectiveFrom: rows[0].effective_from,
  };
}
