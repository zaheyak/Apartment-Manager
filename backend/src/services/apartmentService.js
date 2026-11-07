import { AppError } from '../lib/errors.js';
import { pool } from '../db/pool.js';

const APARTMENT_LIST_SQL = `
  SELECT
    a.id,
    a.number,
    a.floor,
    a.status,
    a.notes,
    a.created_at,
    t.full_name AS tenant_name,
    t.phone AS tenant_phone,
    t.notes AS tenant_notes,
    l.id AS lease_id,
    l.monthly_rent,
    l.start_date AS lease_start,
    l.end_date AS lease_end,
    l.notes AS lease_notes,
    COALESCE(ch.total_due, 0) AS total_due,
    COALESCE(ch.total_paid, 0) AS total_paid,
    COALESCE(ch.total_due, 0) - COALESCE(ch.total_paid, 0) AS outstanding,
    COALESCE(ch.rent_outstanding, 0) AS rent_outstanding,
    COALESCE(ch.electricity_outstanding, 0) AS electricity_outstanding,
    COALESCE(ch.water_outstanding, 0) AS water_outstanding
  FROM apartments a
  LEFT JOIN leases l ON l.apartment_id = a.id AND l.status = 'active'
  LEFT JOIN tenants t ON t.id = l.tenant_id
  LEFT JOIN LATERAL (
    SELECT
      SUM(c.amount_due) AS total_due,
      SUM(COALESCE(paid.amount, 0)) AS total_paid,
      SUM(c.amount_due - COALESCE(paid.amount, 0)) FILTER (WHERE c.category = 'rent') AS rent_outstanding,
      SUM(c.amount_due - COALESCE(paid.amount, 0)) FILTER (WHERE c.category = 'electricity') AS electricity_outstanding,
      SUM(c.amount_due - COALESCE(paid.amount, 0)) FILTER (WHERE c.category = 'water') AS water_outstanding
    FROM monthly_charges c
    LEFT JOIN (
      SELECT monthly_charge_id, SUM(amount) AS amount
      FROM payment_allocations
      GROUP BY monthly_charge_id
    ) paid ON paid.monthly_charge_id = c.id
    WHERE c.apartment_id = a.id
  ) ch ON true
`;

function mapApartment(row) {
  return {
    id: row.id,
    number: row.number,
    floor: row.floor,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    tenantName: row.tenant_name,
    tenantPhone: row.tenant_phone,
    tenantNotes: row.tenant_notes,
    leaseId: row.lease_id,
    monthlyRent: row.monthly_rent == null ? null : Number(row.monthly_rent).toFixed(2),
    leaseStart: row.lease_start,
    leaseEnd: row.lease_end,
    leaseNotes: row.lease_notes,
    totalDue: Number(row.total_due).toFixed(2),
    totalPaid: Number(row.total_paid).toFixed(2),
    outstanding: Number(row.outstanding).toFixed(2),
    rentOutstanding: Number(row.rent_outstanding).toFixed(2),
    electricityOutstanding: Number(row.electricity_outstanding).toFixed(2),
    waterOutstanding: Number(row.water_outstanding).toFixed(2),
  };
}

async function writeAudit(db, { adminId, apartmentId, entityType, entityId, action, beforeData, afterData }) {
  await db.query(
    `INSERT INTO audit_logs (admin_id, apartment_id, entity_type, entity_id, action, before_data, after_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [adminId, apartmentId, entityType, entityId, action, beforeData ?? null, afterData ?? null],
  );
}

async function getBuildingId(db) {
  const { rows } = await db.query('SELECT id FROM buildings ORDER BY created_at LIMIT 1');
  if (!rows[0]) throw new AppError(500, 'לא הוגדר בניין');
  return rows[0].id;
}

export async function listApartments() {
  const { rows } = await pool.query(
    `${APARTMENT_LIST_SQL}
     ORDER BY CASE WHEN a.number ~ '^[0-9]+$' THEN a.number::int ELSE 999999 END, a.number`,
  );
  return rows.map(mapApartment);
}

export async function getApartment(id) {
  const { rows } = await pool.query(`${APARTMENT_LIST_SQL} WHERE a.id = $1`, [id]);
  if (!rows[0]) throw new AppError(404, 'הדירה לא נמצאה');
  return mapApartment(rows[0]);
}

async function insertLease(client, apartmentId, tenant) {
  const tenantResult = await client.query(
    `INSERT INTO tenants (full_name, phone, notes) VALUES ($1, $2, $3) RETURNING id`,
    [tenant.fullName, tenant.phone || '', tenant.notes || ''],
  );
  await client.query(
    `INSERT INTO leases (apartment_id, tenant_id, monthly_rent, start_date, end_date, notes)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      apartmentId,
      tenantResult.rows[0].id,
      tenant.monthlyRent,
      tenant.startDate,
      tenant.endDate || null,
      tenant.notes || '',
    ],
  );
  await client.query(`UPDATE apartments SET status = 'occupied' WHERE id = $1`, [apartmentId]);
}

export async function createApartment(input, adminId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const buildingId = await getBuildingId(client);
    const duplicate = await client.query(
      'SELECT id FROM apartments WHERE building_id = $1 AND number = $2',
      [buildingId, input.number],
    );
    if (duplicate.rows[0]) throw new AppError(409, 'מספר דירה כבר קיים');

    const created = await client.query(
      `INSERT INTO apartments (building_id, number, floor, notes, status)
       VALUES ($1, $2, $3, $4, 'vacant') RETURNING id`,
      [buildingId, input.number, input.floor || '', input.notes || ''],
    );
    const apartmentId = created.rows[0].id;
    await client.query(
      `INSERT INTO meters (apartment_id, meter_type) VALUES ($1, 'electricity'), ($1, 'water')`,
      [apartmentId],
    );
    if (input.tenant) await insertLease(client, apartmentId, input.tenant);
    await writeAudit(client, {
      adminId,
      apartmentId,
      entityType: 'apartment',
      entityId: apartmentId,
      action: 'create_apartment',
      afterData: input,
    });
    await client.query('COMMIT');
    return getApartment(apartmentId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateApartment(id, input, adminId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await getApartment(id);
    const buildingId = await getBuildingId(client);
    const duplicate = await client.query(
      'SELECT id FROM apartments WHERE building_id = $1 AND number = $2 AND id <> $3',
      [buildingId, input.number, id],
    );
    if (duplicate.rows[0]) throw new AppError(409, 'מספר דירה כבר קיים');
    await client.query(
      `UPDATE apartments SET number = $1, floor = $2, notes = $3 WHERE id = $4`,
      [input.number, input.floor || '', input.notes || '', id],
    );
    await writeAudit(client, {
      adminId,
      apartmentId: id,
      entityType: 'apartment',
      entityId: id,
      action: 'update_apartment',
      beforeData: { number: current.number, floor: current.floor, notes: current.notes },
      afterData: input,
    });
    await client.query('COMMIT');
    return getApartment(id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function assignLease(apartmentId, input, adminId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const apartment = await client.query('SELECT id FROM apartments WHERE id = $1 FOR UPDATE', [apartmentId]);
    if (!apartment.rows[0]) throw new AppError(404, 'הדירה לא נמצאה');
    const active = await client.query(
      `SELECT id FROM leases WHERE apartment_id = $1 AND status = 'active'`,
      [apartmentId],
    );
    if (active.rows[0]) {
      throw new AppError(409, 'כבר קיים דייר פעיל. יש לסיים את השכירות הנוכחית תחילה');
    }
    await insertLease(client, apartmentId, input);
    await writeAudit(client, {
      adminId,
      apartmentId,
      entityType: 'lease',
      entityId: apartmentId,
      action: 'create_lease',
      afterData: input,
    });
    await client.query('COMMIT');
    return getApartment(apartmentId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateActiveLease(apartmentId, input, adminId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT l.id, l.tenant_id, l.monthly_rent, l.start_date, l.end_date, t.full_name, t.phone
       FROM leases l
       JOIN tenants t ON t.id = l.tenant_id
       WHERE l.apartment_id = $1 AND l.status = 'active'
       FOR UPDATE`,
      [apartmentId],
    );
    if (!rows[0]) throw new AppError(404, 'אין דייר פעיל לדירה זו');
    const current = rows[0];
    await client.query(
      `UPDATE tenants SET full_name = $1, phone = $2, notes = $3 WHERE id = $4`,
      [input.fullName, input.phone || '', input.notes || '', current.tenant_id],
    );
    await client.query(
      `UPDATE leases
       SET monthly_rent = $1, start_date = $2, end_date = $3, notes = $4
       WHERE id = $5`,
      [input.monthlyRent, input.startDate, input.endDate || null, input.notes || '', current.id],
    );
    await writeAudit(client, {
      adminId,
      apartmentId,
      entityType: 'lease',
      entityId: current.id,
      action: 'update_lease',
      beforeData: {
        fullName: current.full_name,
        phone: current.phone,
        monthlyRent: Number(current.monthly_rent),
        startDate: current.start_date,
        endDate: current.end_date,
      },
      afterData: input,
    });
    await client.query('COMMIT');
    return getApartment(apartmentId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function endLease(apartmentId, adminId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, end_date FROM leases WHERE apartment_id = $1 AND status = 'active' FOR UPDATE`,
      [apartmentId],
    );
    if (!rows[0]) throw new AppError(404, 'אין שכירות פעילה');
    await client.query(
      `UPDATE leases
       SET status = 'ended', end_date = COALESCE(end_date, CURRENT_DATE)
       WHERE id = $1`,
      [rows[0].id],
    );
    await client.query(`UPDATE apartments SET status = 'vacant' WHERE id = $1`, [apartmentId]);
    await writeAudit(client, {
      adminId,
      apartmentId,
      entityType: 'lease',
      entityId: rows[0].id,
      action: 'end_lease',
      beforeData: { status: 'active' },
      afterData: { status: 'ended' },
    });
    await client.query('COMMIT');
    return getApartment(apartmentId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listAudit(apartmentId) {
  await getApartment(apartmentId);
  const { rows } = await pool.query(
    `SELECT id, action, entity_type, before_data, after_data, created_at
     FROM audit_logs
     WHERE apartment_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [apartmentId],
  );
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    beforeData: row.before_data,
    afterData: row.after_data,
    createdAt: row.created_at,
  }));
}
