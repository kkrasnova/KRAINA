

import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const BCRYPT_ROUNDS = 12;

function parseDatabaseSsl() {
  const v = (process.env.DATABASE_SSL ?? process.env.DB_SSL ?? '').trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes') {
    return { rejectUnauthorized: (process.env.DATABASE_SSL_REJECT_UNAUTHORIZED ?? '').toLowerCase() === 'true' };
  }
  const pgMode = (process.env.PGSSLMODE ?? '').trim().toLowerCase();
  if (['require', 'verify-ca', 'verify-full'].includes(pgMode)) {
    return { rejectUnauthorized: false };
  }
  return false;
}

function currentPeriodMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function ensureUniqueUsername(client, base) {
  let candidate = base
    .slice(0, 28)
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^_|_$/g, '');
  if (!candidate) candidate = 'admin';
  for (let i = 0; i < 80; i += 1) {
    const suffix = i === 0 ? '' : `_${randomBytes(3).toString('hex')}`;
    const u = `${candidate}${suffix}`.slice(0, 32);
    const r = await client.query('SELECT 1 FROM profiles WHERE username = $1', [u]);
    if (r.rowCount === 0) return u;
  }
  throw new Error('Could not generate unique username');
}

async function main() {
  const emailArg = (process.argv[2] || '').trim().toLowerCase();
  const passArg = (process.argv[3] || '').trim();
  const fromEnv = (process.env.ADMIN_PASSWORD || '').trim();

  if (!emailArg || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailArg)) {
    console.error('Usage: ADMIN_PASSWORD=… npm run create-admin');
    console.error('   or: node scripts/create-admin.mjs <email> <password>');
    process.exit(1);
  }

  const password = fromEnv || passArg;
  if (!password || password.length < 8) {
    console.error('Set ADMIN_PASSWORD in env (min 8 chars) or pass as second arg.');
    process.exit(1);
  }

  const databaseUrl = (process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) {
    console.error('Missing DATABASE_URL (load backend/.env or export it).');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: databaseUrl, ssl: parseDatabaseSsl() });
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT id, email FROM users WHERE lower(email) = lower($1)`,
      [emailArg],
    );

    if (existing.rowCount > 0) {
      const id = existing.rows[0].id;
      await client.query(
        `UPDATE users
         SET password_hash = $1, role = 'admin', status = 'active', updated_at = now()
         WHERE id = $2`,
        [passwordHash, id],
      );
      await client.query('COMMIT');
      console.log('Updated existing user to admin:', emailArg);
      return;
    }

    const ins = await client.query(
      `INSERT INTO users (email, password_hash, auth_provider, role, status)
       VALUES ($1, $2, 'email', 'admin', 'active')
       RETURNING id`,
      [emailArg, passwordHash],
    );
    const userId = ins.rows[0].id;

    const local = emailArg.split('@')[0] || 'admin';
    const username = await ensureUniqueUsername(client, `a_${local}`);

    const display = local.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim() || 'Admin';
    await client.query(
      `INSERT INTO profiles (user_id, username, display_name, language, level)
       VALUES ($1, $2, $3, 'uk', 1)`,
      [userId, username, display],
    );

    await client.query(
      `INSERT INTO subscriptions (user_id, plan_type, is_active, billing_period, price_usd)
       VALUES ($1, 'free', true, NULL, NULL)`,
      [userId],
    );
    await client.query(
      `INSERT INTO usage_limits (user_id, period_month, ar_scans_used, routes_created, locations_viewed)
       VALUES ($1, $2, 0, 0, 0)
       ON CONFLICT (user_id, period_month) DO NOTHING`,
      [userId, currentPeriodMonth()],
    );

    await client.query('COMMIT');
    console.log('Created admin user:', emailArg, '| username:', username);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
