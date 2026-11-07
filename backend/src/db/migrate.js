import fs from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { pool } from './pool.js';

const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql');

export async function migrate() {
  const sql = await fs.readFile(schemaPath, 'utf8');
  await pool.query(sql);

  const admins = await pool.query('SELECT id FROM administrators LIMIT 1');
  if (!admins.rows[0]) {
    if (!config.adminPassword) {
      throw new Error('Set ADMIN_PASSWORD before the first startup');
    }
    const passwordHash = await bcrypt.hash(config.adminPassword, 12);
    await pool.query(
      'INSERT INTO administrators (username, email, password_hash, full_name) VALUES ($1, $2, $3, $4)',
      [config.adminUsername, config.adminEmail.toLowerCase(), passwordHash, config.adminName],
    );
  }

  const buildings = await pool.query('SELECT id FROM buildings LIMIT 1');
  if (!buildings.rows[0]) {
    await pool.query(
      `INSERT INTO buildings (name, address, notes) VALUES ('הבניין', '', '')`,
    );
  }

  const tariffs = await pool.query('SELECT id FROM utility_tariffs LIMIT 1');
  if (!tariffs.rows[0]) {
    await pool.query(
      `INSERT INTO utility_tariffs (meter_type, price, effective_from) VALUES
        ('electricity', 0.6400, '2020-01-01'),
        ('water', 7.5000, '2020-01-01')`,
    );
  }
}
