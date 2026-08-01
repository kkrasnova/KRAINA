import { randomBytes } from 'node:crypto';
import { pool } from '../db/pool.js';
import { HttpError } from '../errors/HttpError.js';
async function ensureUniqueUsername(client, base) {
    let candidate = base
        .slice(0, 28)
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/^_|_$/g, '');
    if (!candidate)
        candidate = 'admin';
    for (let i = 0; i < 80; i += 1) {
        const suffix = i === 0 ? '' : `_${randomBytes(3).toString('hex')}`;
        const u = `${candidate}${suffix}`.slice(0, 32);
        const r = await client.query('SELECT 1 FROM profiles WHERE username = $1', [u]);
        if (r.rowCount === 0)
            return u;
    }
    throw new HttpError(500, 'username_unavailable');
}
function currentPeriodMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export async function listAdminUsers() {
    const r = await pool.query(`SELECT u.id::text AS user_id,
            u.email,
            u.role::text AS role,
            u.status::text AS status,
            u.auth_provider::text AS auth_provider,
            p.username,
            p.display_name,
            u.created_at::text AS created_at
     FROM users u
     LEFT JOIN profiles p ON p.user_id = u.id
     WHERE u.role = 'admin'
       AND u.status <> 'deleted'
     ORDER BY lower(u.email) ASC`);
    return r.rows;
}
/**
 * Makes email an admin. Creates a stub user if missing so they can sign in
 * via Google (or email/password after setting a password elsewhere).
 */
export async function grantAdminByEmail(emailRaw) {
    const email = String(emailRaw || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new HttpError(400, 'invalid_email');
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const existing = await client.query(`SELECT id FROM users WHERE lower(email) = lower($1)`, [email]);
        let userId;
        if (existing.rowCount && existing.rows[0]) {
            userId = String(existing.rows[0].id);
            await client.query(`UPDATE users
         SET role = 'admin', status = 'active', updated_at = now()
         WHERE id = $1`, [userId]);
        }
        else {
            const ins = await client.query(`INSERT INTO users (email, password_hash, auth_provider, role, status)
         VALUES ($1, NULL, 'google', 'admin', 'active')
         RETURNING id`, [email]);
            userId = String(ins.rows[0].id);
            const local = email.split('@')[0] || 'admin';
            const username = await ensureUniqueUsername(client, `a_${local}`);
            const display = local.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim() || 'Admin';
            await client.query(`INSERT INTO profiles (user_id, username, display_name, language, level)
         VALUES ($1, $2, $3, 'uk', 1)`, [userId, username, display]);
            await client.query(`INSERT INTO subscriptions (user_id, plan_type, is_active, billing_period, price_usd)
         VALUES ($1, 'free', true, NULL, NULL)`, [userId]);
            await client.query(`INSERT INTO usage_limits (user_id, period_month, ar_scans_used, routes_created, locations_viewed)
         VALUES ($1, $2, 0, 0, 0)
         ON CONFLICT (user_id, period_month) DO NOTHING`, [userId, currentPeriodMonth()]);
        }
        await client.query('COMMIT');
        const out = await pool.query(`SELECT u.id::text AS user_id,
              u.email,
              u.role::text AS role,
              u.status::text AS status,
              u.auth_provider::text AS auth_provider,
              p.username,
              p.display_name,
              u.created_at::text AS created_at
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.id = $1`, [userId]);
        return out.rows[0];
    }
    catch (e) {
        await client.query('ROLLBACK').catch(() => { });
        throw e;
    }
    finally {
        client.release();
    }
}
export async function revokeAdminByEmail(emailRaw, actorUserId) {
    const email = String(emailRaw || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new HttpError(400, 'invalid_email');
    }
    const target = await pool.query(`SELECT id::text AS id, role::text AS role, status::text AS status
     FROM users WHERE lower(email) = lower($1)`, [email]);
    if (!target.rowCount || !target.rows[0]) {
        throw new HttpError(404, 'user_not_found');
    }
    const row = target.rows[0];
    if (row.id === String(actorUserId)) {
        throw new HttpError(400, 'cannot_revoke_self');
    }
    if (row.role !== 'admin') {
        throw new HttpError(400, 'not_admin');
    }
    const admins = await pool.query(`SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND status <> 'deleted'`);
    if ((admins.rows[0]?.n || 0) <= 1) {
        throw new HttpError(400, 'last_admin');
    }
    await pool.query(`UPDATE users SET role = 'user', updated_at = now() WHERE id = $1`, [row.id]);
    return { ok: true };
}
//# sourceMappingURL=adminUsersAdminService.js.map