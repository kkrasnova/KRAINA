import { pool } from '../db/pool.js';
export async function searchUsersByEmailFragment(q, limit = 25) {
    const term = q
        .trim()
        .slice(0, 200)
        .replace(/\\/g, '')
        .replace(/%/g, '')
        .replace(/_/g, '');
    if (term.length < 2)
        return [];
    const lim = Math.min(40, Math.max(1, limit));
    const candidateLimit = lim * 8;
    const r = await pool.query(`WITH matched_by_email AS (
       SELECT id
       FROM users
       WHERE status <> 'deleted'
         AND email ILIKE $1
       ORDER BY email ASC
       LIMIT $3
     ),
     matched_by_username AS (
       SELECT p.user_id AS id
       FROM profiles p
       JOIN users u ON u.id = p.user_id
       WHERE u.status <> 'deleted'
         AND p.username ILIKE $1
       ORDER BY p.username ASC
       LIMIT $3
     ),
     matched_users AS (
       SELECT DISTINCT id
       FROM (
         SELECT id FROM matched_by_email
         UNION ALL
         SELECT id FROM matched_by_username
       ) ids
     )
     SELECT u.id::text AS user_id,
            u.email,
            p.username,
            s.plan_type::text AS plan_type,
            s.expires_at,
            s.payment_provider::text AS payment_provider
     FROM matched_users m
     JOIN users u ON u.id = m.id
     LEFT JOIN profiles p ON p.user_id = u.id
     LEFT JOIN LATERAL (
       SELECT plan_type, expires_at, payment_provider
       FROM subscriptions
       WHERE user_id = u.id
         AND is_active = true
         AND (expires_at IS NULL OR expires_at > now())
       ORDER BY starts_at DESC
       LIMIT 1
     ) s ON true
     ORDER BY
       CASE
         WHEN lower(u.email) = lower($2) OR lower(COALESCE(p.username, '')) = lower($2) THEN 0
         WHEN lower(u.email) LIKE lower($2) || '%' OR lower(COALESCE(p.username, '')) LIKE lower($2) || '%' THEN 1
         ELSE 2
       END,
       u.email ASC
     LIMIT $4`, [`%${term}%`, term, candidateLimit, lim]);
    return r.rows;
}
//# sourceMappingURL=adminUsersSearchService.js.map