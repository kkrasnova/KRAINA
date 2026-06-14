import { pool } from '../db/pool.js';
export async function recordCancelFeedbackAndDeactivateSubs(params) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`INSERT INTO subscription_cancel_feedback (user_id, user_email, previous_plan, reason_codes, comment, app_language)
       VALUES ($1::uuid, $2, $3, $4::jsonb, $5, $6)`, [
            params.userId,
            params.userEmail,
            params.previousPlan,
            JSON.stringify(params.reasonCodes),
            params.comment,
            params.appLanguage,
        ]);
        await client.query(`UPDATE subscriptions SET is_active = false WHERE user_id = $1::uuid`, [params.userId]);
        await client.query('COMMIT');
    }
    catch (e) {
        await client.query('ROLLBACK').catch(() => { });
        throw e;
    }
    finally {
        client.release();
    }
}
export async function listCancelFeedbackForAdmin(limit = 80) {
    const lim = Math.min(200, Math.max(1, limit));
    const r = await pool.query(`SELECT id, user_id::text AS user_id, user_email, previous_plan, reason_codes, comment, app_language, created_at
     FROM subscription_cancel_feedback
     ORDER BY created_at DESC
     LIMIT $1`, [lim]);
    return r.rows.map((row) => ({
        id: String(row.id),
        user_id: row.user_id == null ? null : String(row.user_id),
        user_email: row.user_email == null ? null : String(row.user_email),
        previous_plan: String(row.previous_plan),
        reason_codes: Array.isArray(row.reason_codes)
            ? row.reason_codes.map(String)
            : typeof row.reason_codes === 'string'
                ? JSON.parse(row.reason_codes)
                : [],
        comment: row.comment == null ? null : String(row.comment),
        app_language: row.app_language == null ? null : String(row.app_language),
        created_at: new Date(String(row.created_at)).toISOString(),
    }));
}
//# sourceMappingURL=subscriptionCancelFeedbackService.js.map