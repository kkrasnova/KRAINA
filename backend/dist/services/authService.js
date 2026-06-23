import { createHash, randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { HttpError } from '../errors/HttpError.js';
import { pool } from '../db/pool.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { hashRefreshToken, randomOpaqueToken, signAccessToken, } from '../utils/tokens.js';
import { currentPeriodMonth } from '../utils/period.js';
import { verifyGoogleIdToken } from '../oauth/googleVerify.js';
import { verifyAppleIdentityToken } from '../oauth/appleVerify.js';
import { verifyFacebookAccessToken } from '../oauth/facebookVerify.js';
import { getAdminAuth } from './firebaseAdmin.js';
async function ensureUniqueUsername(c, base) {
    let candidate = base
        .slice(0, 28)
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/^_|_$/g, '');
    if (!candidate)
        candidate = 'user';
    for (let i = 0; i < 80; i += 1) {
        const suffix = i === 0 ? '' : `_${randomBytes(3).toString('hex')}`;
        const u = `${candidate}${suffix}`.slice(0, 32);
        const r = await c.query('SELECT 1 FROM profiles WHERE username = $1', [u]);
        if (r.rowCount === 0)
            return u;
    }
    throw new HttpError(500, 'username_generation_failed');
}
/** Послідовний нік за замовчуванням: user000001, user000002, … */
async function allocateSequentialUsername(c) {
    const r = await c.query(`SELECT COALESCE(MAX(
       CASE
         WHEN username ~ '^user[0-9]+$'
         THEN NULLIF(substring(username from 5), '')::integer
         ELSE 0
       END
     ), 0) AS max_num
     FROM profiles`);
    let n = Number(r.rows[0]?.max_num ?? 0) + 1;
    for (let attempt = 0; attempt < 200; attempt += 1) {
        const u = `user${String(n).padStart(6, '0')}`;
        const taken = await c.query('SELECT 1 FROM profiles WHERE lower(username) = lower($1)', [u]);
        if (!taken.rowCount)
            return u;
        n += 1;
    }
    throw new HttpError(500, 'username_generation_failed');
}
async function insertFreeSubscriptionAndUsage(c, userId) {
    await c.query(`INSERT INTO subscriptions (user_id, plan_type, is_active, billing_period, price_usd)
     VALUES ($1, 'free', true, NULL, NULL)`, [userId]);
    await c.query(`INSERT INTO usage_limits (user_id, period_month, ar_scans_used, routes_created, locations_viewed)
     VALUES ($1, $2, 0, 0, 0)
     ON CONFLICT (user_id, period_month) DO NOTHING`, [userId, currentPeriodMonth()]);
}
async function issueSessionWithClient(c, userId, email, role) {
    const rawRefresh = randomOpaqueToken();
    const h = hashRefreshToken(rawRefresh);
    const expires = new Date();
    expires.setDate(expires.getDate() + config.refreshTokenTtlDays);
    await c.query(`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`, [userId, h, expires.toISOString()]);
    return {
        access_token: signAccessToken(userId, email, role),
        refresh_token: rawRefresh,
    };
}
function rowToUserDTO(row) {
    return {
        id: row.id,
        email: row.email,
        role: row.role,
        status: row.status,
    };
}
export async function registerUser(input) {
    const email = input.email.trim().toLowerCase();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const dup = await client.query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [email]);
        if (dup.rowCount) {
            await client.query('ROLLBACK');
            throw new HttpError(400, 'email_taken');
        }
        let username = String(input.username || '')
            .trim()
            .replace(/^@/, '')
            .toLowerCase();
        if (!username || username.length < 3 || !/^[a-z0-9_]+$/.test(username)) {
            username = await allocateSequentialUsername(client);
        }
        else {
            const uTaken = await client.query('SELECT 1 FROM profiles WHERE lower(username) = lower($1)', [username]);
            if (uTaken.rowCount) {
                await client.query('ROLLBACK');
                throw new HttpError(400, 'username_taken');
            }
        }
        const password_hash = await hashPassword(input.password);
        const ins = await client.query(`INSERT INTO users (email, password_hash, auth_provider, role, status)
       VALUES ($1, $2, 'email', 'user', 'active')
       RETURNING id, email, role, status`, [email, password_hash]);
        const u = ins.rows[0];
        const displayName = String(input.display_name || '')
            .trim()
            .slice(0, 120) ||
            email.split('@')[0]?.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim() ||
            null;
        await client.query(`INSERT INTO profiles (user_id, username, display_name, language, level)
       VALUES ($1, $2, $3, 'uk', 1)`, [u.id, username, displayName]);
        await insertFreeSubscriptionAndUsage(client, u.id);
        const tokens = await issueSessionWithClient(client, u.id, u.email, u.role);
        await client.query('COMMIT');
        return { user: rowToUserDTO(u), ...tokens };
    }
    catch (e) {
        await client.query('ROLLBACK').catch(() => { });
        throw e;
    }
    finally {
        client.release();
    }
}
export async function loginWithPassword(emailRaw, password) {
    const email = emailRaw.trim().toLowerCase();
    const r = await pool.query(`SELECT id, email, password_hash, role, status FROM users WHERE lower(email) = lower($1)`, [email]);
    if (!r.rowCount) {
        throw new HttpError(401, 'invalid_credentials');
    }
    const row = r.rows[0];
    if (row.status === 'banned') {
        throw new HttpError(403, 'account_banned');
    }
    if (row.status === 'deleted' || !row.password_hash) {
        throw new HttpError(401, 'invalid_credentials');
    }
    const ok = await verifyPassword(password, row.password_hash);
    if (!ok) {
        throw new HttpError(401, 'invalid_credentials');
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const tokens = await issueSessionWithClient(client, row.id, row.email, row.role);
        await client.query('COMMIT');
        return { user: rowToUserDTO(row), ...tokens };
    }
    catch (e) {
        await client.query('ROLLBACK').catch(() => { });
        throw e;
    }
    finally {
        client.release();
    }
}
export async function loginOrRegisterGoogle(idToken) {
    const g = await verifyGoogleIdToken(idToken);
    const r = await pool.query(`SELECT id, email, role, status FROM users WHERE lower(email) = lower($1)`, [
        g.email,
    ]);
    if (r.rowCount) {
        const row = r.rows[0];
        if (row.status === 'banned')
            throw new HttpError(403, 'account_banned');
        if (row.status === 'deleted')
            throw new HttpError(401, 'invalid_credentials');
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const tokens = await issueSessionWithClient(client, row.id, row.email, row.role);
            await client.query('COMMIT');
            return { user: rowToUserDTO(row), ...tokens };
        }
        catch (e) {
            await client.query('ROLLBACK').catch(() => { });
            throw e;
        }
        finally {
            client.release();
        }
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const base = g.email.split('@')[0] ?? 'user';
        const username = await ensureUniqueUsername(client, base);
        const googleDisplayName = base.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim() || null;
        const ins = await client.query(`INSERT INTO users (email, password_hash, auth_provider, role, status)
       VALUES ($1, NULL, 'google', 'user', 'active')
       RETURNING id, email, role, status`, [g.email]);
        const u = ins.rows[0];
        await client.query(`INSERT INTO profiles (user_id, username, display_name, language, level)
       VALUES ($1, $2, $3, 'uk', 1)`, [u.id, username, googleDisplayName]);
        await insertFreeSubscriptionAndUsage(client, u.id);
        const tokens = await issueSessionWithClient(client, u.id, u.email, u.role);
        await client.query('COMMIT');
        return { user: rowToUserDTO(u), ...tokens };
    }
    catch (e) {
        await client.query('ROLLBACK').catch(() => { });
        throw e;
    }
    finally {
        client.release();
    }
}
export async function loginOrRegisterFacebook(accessToken) {
    const fb = await verifyFacebookAccessToken(accessToken);
    const r = await pool.query(`SELECT id, email, role, status FROM users WHERE lower(email) = lower($1)`, [
        fb.email,
    ]);
    if (r.rowCount) {
        const row = r.rows[0];
        if (row.status === 'banned')
            throw new HttpError(403, 'account_banned');
        if (row.status === 'deleted')
            throw new HttpError(401, 'invalid_credentials');
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const tokens = await issueSessionWithClient(client, row.id, row.email, row.role);
            await client.query('COMMIT');
            return { user: rowToUserDTO(row), ...tokens };
        }
        catch (e) {
            await client.query('ROLLBACK').catch(() => { });
            throw e;
        }
        finally {
            client.release();
        }
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const base = fb.name.replace(/\s+/g, '_').slice(0, 24) || 'user';
        const username = await ensureUniqueUsername(client, base);
        const ins = await client.query(`INSERT INTO users (email, password_hash, auth_provider, role, status)
       VALUES ($1, NULL, 'facebook', 'user', 'active')
       RETURNING id, email, role, status`, [fb.email]);
        const u = ins.rows[0];
        await client.query(`INSERT INTO profiles (user_id, username, display_name, language, level)
       VALUES ($1, $2, $3, 'uk', 1)`, [u.id, username, fb.name]);
        await insertFreeSubscriptionAndUsage(client, u.id);
        const tokens = await issueSessionWithClient(client, u.id, u.email, u.role);
        await client.query('COMMIT');
        return { user: rowToUserDTO(u), ...tokens };
    }
    catch (e) {
        await client.query('ROLLBACK').catch(() => { });
        throw e;
    }
    finally {
        client.release();
    }
}
export async function loginOrRegisterApple(identityToken, displayName) {
    const a = await verifyAppleIdentityToken(identityToken);
    const r = await pool.query(`SELECT id, email, role, status FROM users WHERE lower(email) = lower($1)`, [
        a.email,
    ]);
    if (r.rowCount) {
        const row = r.rows[0];
        if (row.status === 'banned')
            throw new HttpError(403, 'account_banned');
        if (row.status === 'deleted')
            throw new HttpError(401, 'invalid_credentials');
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const tokens = await issueSessionWithClient(client, row.id, row.email, row.role);
            await client.query('COMMIT');
            return { user: rowToUserDTO(row), ...tokens };
        }
        catch (e) {
            await client.query('ROLLBACK').catch(() => { });
            throw e;
        }
        finally {
            client.release();
        }
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const base = displayName?.replace(/\s+/g, '_') || a.email.split('@')[0] || 'user';
        const username = await ensureUniqueUsername(client, base);
        const appleDisplayName = displayName || a.email.split('@')[0]?.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim() || null;
        const ins = await client.query(`INSERT INTO users (email, password_hash, auth_provider, role, status)
       VALUES ($1, NULL, 'apple', 'user', 'active')
       RETURNING id, email, role, status`, [a.email]);
        const u = ins.rows[0];
        await client.query(`INSERT INTO profiles (user_id, username, display_name, language, level)
       VALUES ($1, $2, $3, 'uk', 1)`, [u.id, username, appleDisplayName]);
        await insertFreeSubscriptionAndUsage(client, u.id);
        const tokens = await issueSessionWithClient(client, u.id, u.email, u.role);
        await client.query('COMMIT');
        return { user: rowToUserDTO(u), ...tokens };
    }
    catch (e) {
        await client.query('ROLLBACK').catch(() => { });
        throw e;
    }
    finally {
        client.release();
    }
}
/** Вхід/реєстрація за Firebase ID token (email/Google/Apple через Firebase Auth на клієнті). */
export async function loginOrRegisterFirebaseIdToken(idToken) {
    const adminAuth = getAdminAuth();
    if (!adminAuth)
        throw new HttpError(503, 'firebase_not_configured');
    let firebaseUid = '';
    let email = '';
    try {
        const decoded = await adminAuth.verifyIdToken(idToken);
        firebaseUid = String(decoded.uid || '').trim();
        email = String(decoded.email || '').trim().toLowerCase();
    }
    catch {
        throw new HttpError(401, 'invalid_token');
    }
    if (!firebaseUid)
        throw new HttpError(401, 'invalid_token');
    if (!email)
        throw new HttpError(400, 'email_required');
    const byUid = await pool.query(`SELECT u.id, u.email, u.role, u.status
     FROM users u
     JOIN profiles p ON p.user_id = u.id
     WHERE p.firebase_uid = $1`, [firebaseUid]);
    let row = byUid.rowCount ? byUid.rows[0] : null;
    if (!row) {
        const byEmail = await pool.query(`SELECT id, email, role, status FROM users WHERE lower(email) = lower($1)`, [email]);
        row = byEmail.rowCount ? byEmail.rows[0] : null;
    }
    if (row) {
        if (row.status === 'banned')
            throw new HttpError(403, 'account_banned');
        if (row.status === 'deleted')
            throw new HttpError(401, 'invalid_credentials');
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(`UPDATE profiles
         SET firebase_uid = $1, updated_at = now()
         WHERE user_id = $2::uuid
           AND (firebase_uid IS NULL OR btrim(firebase_uid) = '' OR firebase_uid = $1)`, [firebaseUid, row.id]);
            const tokens = await issueSessionWithClient(client, row.id, row.email, row.role);
            await client.query('COMMIT');
            return { user: rowToUserDTO(row), ...tokens };
        }
        catch (e) {
            await client.query('ROLLBACK').catch(() => { });
            throw e;
        }
        finally {
            client.release();
        }
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const base = email.split('@')[0] ?? 'user';
        const username = await ensureUniqueUsername(client, base);
        const displayName = base.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim() || null;
        const ins = await client.query(`INSERT INTO users (email, password_hash, auth_provider, role, status)
       VALUES ($1, NULL, 'firebase', 'user', 'active')
       RETURNING id, email, role, status`, [email]);
        const u = ins.rows[0];
        await client.query(`INSERT INTO profiles (user_id, username, display_name, language, level, firebase_uid)
       VALUES ($1, $2, $3, 'uk', 1, $4)`, [u.id, username, displayName, firebaseUid]);
        await insertFreeSubscriptionAndUsage(client, u.id);
        const tokens = await issueSessionWithClient(client, u.id, u.email, u.role);
        await client.query('COMMIT');
        return { user: rowToUserDTO(u), ...tokens };
    }
    catch (e) {
        await client.query('ROLLBACK').catch(() => { });
        throw e;
    }
    finally {
        client.release();
    }
}
export async function rotateRefreshToken(rawRefresh) {
    const hash = hashRefreshToken(rawRefresh);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const find = await client.query(`SELECT rt.id, rt.user_id, rt.replaced_at, rt.expires_at, u.email, u.role
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1
       FOR UPDATE OF rt`, [hash]);
        if (!find.rowCount) {
            await client.query('ROLLBACK');
            throw new HttpError(401, 'token_invalid');
        }
        const row = find.rows[0];
        if (new Date(row.expires_at) < new Date()) {
            await client.query('DELETE FROM refresh_tokens WHERE id = $1', [row.id]);
            await client.query('COMMIT');
            throw new HttpError(401, 'token_expired');
        }
        if (row.replaced_at) {
            await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [row.user_id]);
            await client.query('COMMIT');
            throw new HttpError(401, 'token_invalid');
        }
        const newRaw = randomOpaqueToken();
        const newHash = hashRefreshToken(newRaw);
        const expires = new Date();
        expires.setDate(expires.getDate() + config.refreshTokenTtlDays);
        await client.query(`UPDATE refresh_tokens SET replaced_at = now() WHERE id = $1`, [row.id]);
        await client.query(`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`, [row.user_id, newHash, expires.toISOString()]);
        await client.query('COMMIT');
        return {
            access_token: signAccessToken(row.user_id, row.email, row.role),
            refresh_token: newRaw,
            user_id: row.user_id,
        };
    }
    catch (e) {
        await client.query('ROLLBACK').catch(() => { });
        throw e;
    }
    finally {
        client.release();
    }
}
export async function logoutAllRefreshTokens(userId) {
    await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
}
export async function requestPasswordReset(emailRaw) {
    const email = emailRaw.trim().toLowerCase();
    const r = await pool.query(`SELECT id FROM users WHERE lower(email) = lower($1)`, [email]);
    if (!r.rowCount) {
        return;
    }
    const userId = r.rows[0].id;
    const raw = randomOpaqueToken();
    const h = hashRefreshToken(raw);
    const expires = new Date();
    expires.setMinutes(expires.getMinutes() + config.passwordResetTtlMin);
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);
    await pool.query(`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`, [userId, h, expires.toISOString()]);
    const { logger } = await import('../logger.js');
    if (config.nodeEnv !== 'production') {
        logger.debug('password_reset_token_issued', { email, dev_reset_token: raw });
    }
    else {
        logger.info('password_reset_token_issued', { email });
    }
}
function appOtpHash(email, code) {
    const emailLower = email.trim().toLowerCase();
    const codeDigits = String(code).replace(/\s/g, '');
    return createHash('sha256').update(`kraina_pw_otp_v1|${emailLower}|${codeDigits}`).digest('hex');
}
export async function userEmailExists(emailRaw) {
    const email = emailRaw.trim().toLowerCase();
    // Same lookup as registerUser duplicate check — avoid "email taken" vs "no profile" mismatch.
    const r = await pool.query(`SELECT 1 FROM users WHERE lower(email) = lower($1) LIMIT 1`, [email]);
    return (r.rowCount ?? 0) > 0;
}
/** OTP з додатку (Resend) — той самий hash, що в app/db.js otpHashForCode. */
export async function storeAppPasswordResetOtp(emailRaw, code, expiresAtMs) {
    const email = emailRaw.trim().toLowerCase();
    const ur = await pool.query(`SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`, [email]);
    if (!ur.rowCount)
        return;
    const userId = ur.rows[0].id;
    const h = appOtpHash(email, code);
    const expires = new Date(expiresAtMs);
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);
    await pool.query(`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`, [userId, h, expires.toISOString()]);
}
export async function resetPasswordWithAppOtp(emailRaw, code, newPassword) {
    const email = emailRaw.trim().toLowerCase();
    const h = appOtpHash(email, code);
    const r = await pool.query(`SELECT prt.id, prt.user_id
     FROM password_reset_tokens prt
     JOIN users u ON u.id = prt.user_id
     WHERE lower(u.email) = lower($1)
       AND prt.token_hash = $2
       AND prt.expires_at > now()
     LIMIT 1`, [email, h]);
    if (!r.rowCount) {
        throw new HttpError(400, 'token_invalid');
    }
    const row = r.rows[0];
    const password_hash = await hashPassword(newPassword);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`, [
            password_hash,
            row.user_id,
        ]);
        await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [row.user_id]);
        await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [row.user_id]);
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
export async function resetPasswordWithToken(rawToken, newPassword) {
    const h = hashRefreshToken(rawToken);
    const r = await pool.query(`SELECT id, user_id FROM password_reset_tokens WHERE token_hash = $1 AND expires_at > now()`, [h]);
    if (!r.rowCount) {
        throw new HttpError(400, 'token_invalid');
    }
    const row = r.rows[0];
    const password_hash = await hashPassword(newPassword);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`, [
            password_hash,
            row.user_id,
        ]);
        await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [row.user_id]);
        await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [row.user_id]);
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
//# sourceMappingURL=authService.js.map