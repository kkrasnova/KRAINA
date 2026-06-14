import { pool } from '../db/pool.js';
import { HttpError } from '../errors/HttpError.js';

export async function grantSubscriptionByEmail(params: {
  email: string;
  plan_type: 'free' | 'explorer' | 'pro' | 'family';
  duration_days: number;
  lifetime?: boolean;
  adminId: string;
}): Promise<{ user_id: string; plan_type: string; expires_at: string | null }> {
  const email = params.email.trim().toLowerCase();
  const u = await pool.query(`SELECT id FROM users WHERE lower(email) = lower($1)`, [email]);
  if (!u.rowCount) {
    throw new HttpError(404, 'user_not_found');
  }
  const userId = (u.rows[0] as { id: string }).id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE subscriptions SET is_active = false WHERE user_id = $1`, [userId]);

    let expiresAt: string | null = null;
    if (params.plan_type !== 'free') {
      if (params.lifetime) {
        expiresAt = null;
      } else {
        const r = await client.query(
          `SELECT (now() + ($1::integer * interval '1 day')) AS t`,
          [params.duration_days],
        );
        expiresAt = (r.rows[0] as { t: Date }).t.toISOString();
      }
    }

    await client.query(
      `INSERT INTO subscriptions (user_id, plan_type, billing_period, price_usd, starts_at, expires_at, is_active, payment_provider, external_id)
       VALUES ($1, $2, $3, NULL, now(), $4, true, 'admin', $5)`,
      [
        userId,
        params.plan_type,
        params.plan_type === 'free' ? null : 'monthly',
        expiresAt,
        `grant:${params.adminId}:${Date.now()}`,
      ],
    );

    await client.query(
      `INSERT INTO admin_actions (admin_id, action_type, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        params.adminId,
        'grant_subscription',
        'user',
        userId,
        JSON.stringify({
          email,
          plan_type: params.plan_type,
          duration_days: params.duration_days,
          lifetime: !!params.lifetime,
          expires_at: expiresAt,
        }),
      ],
    );

    await client.query('COMMIT');
    return { user_id: userId, plan_type: params.plan_type, expires_at: expiresAt };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
