import { randomUUID } from 'node:crypto';
import { HttpError } from '../errors/HttpError.js';
import { pool } from '../db/pool.js';
import { getStorageProvider } from '../storage/index.js';
import { computeExplorerLevel } from '../utils/level.js';
import { currentPeriodMonth } from '../utils/period.js';
function sanitizeLikeFragment(s) {
    return String(s || '')
        .replace(/%/g, '')
        .replace(/_/g, '')
        .trim();
}
export async function searchProfilesForViewer(viewerId, q, limit = 24) {
    const raw = sanitizeLikeFragment(String(q || '').replace(/^@/, '')).slice(0, 80);
    const lim = Math.min(40, Math.max(1, limit));
    // Empty query → "browse people": return real, recently-joined public profiles
    // so Discover is populated with actual registered users (not Firestore-only).
    if (raw.length < 1) {
        const browse = await pool.query(`SELECT p.user_id::text AS user_id,
              p.username,
              p.display_name,
              p.avatar_url,
              p.bio,
              p.is_public,
              EXISTS (
                SELECT 1 FROM follows f
                WHERE f.follower_id = $1::uuid AND f.following_id = p.user_id
              ) AS is_following
       FROM profiles p
       JOIN users u ON u.id = p.user_id
       WHERE u.status <> 'deleted'
         AND ($1::uuid IS NULL OR p.user_id <> $1::uuid)
         AND p.username IS NOT NULL AND trim(p.username) <> ''
         AND COALESCE(p.is_public, true) = true
       ORDER BY u.created_at DESC NULLS LAST, p.username ASC
       LIMIT $2`, [viewerId, lim]);
        return browse.rows.map((row) => ({
            user_id: String(row.user_id),
            username: String(row.username),
            display_name: row.display_name == null || String(row.display_name).trim() === ''
                ? null
                : String(row.display_name).trim(),
            avatar_url: row.avatar_url == null ? null : String(row.avatar_url),
            bio: row.bio == null ? null : String(row.bio),
            is_following: Boolean(row.is_following),
            is_public: row.is_public == null ? true : Boolean(row.is_public),
        }));
    }
    const namePattern = `%${raw}%`;
    const r = await pool.query(`SELECT p.user_id::text AS user_id,
            p.username,
            p.display_name,
            p.avatar_url,
            p.bio,
            p.is_public,
            EXISTS (
              SELECT 1 FROM follows f
              WHERE f.follower_id = $1::uuid AND f.following_id = p.user_id
            ) AS is_following
     FROM profiles p
     JOIN users u ON u.id = p.user_id
     WHERE u.status <> 'deleted'
       AND ($1::uuid IS NULL OR p.user_id <> $1::uuid)
       AND (
         (p.display_name IS NOT NULL AND trim(p.display_name) <> '' AND p.display_name ILIKE $2)
         OR (p.username IS NOT NULL AND trim(p.username) <> '' AND p.username ILIKE $2)
         OR (p.bio IS NOT NULL AND trim(p.bio) <> '' AND p.bio ILIKE $2)
         -- email arm removed: searching by email fragment exposes PII to any
         -- authenticated user. Email is not a public field.
       )
     ORDER BY
       CASE
         WHEN p.display_name IS NOT NULL AND trim(p.display_name) <> '' AND p.display_name ILIKE $2 THEN 0
         WHEN p.username IS NOT NULL AND trim(p.username) <> '' AND p.username ILIKE $2 THEN 1
         WHEN p.bio IS NOT NULL AND trim(p.bio) <> '' AND p.bio ILIKE $2 THEN 2
         ELSE 3
       END,
       p.username ASC
     LIMIT $3`, [viewerId, namePattern, lim]);
    return r.rows.map((row) => ({
        user_id: String(row.user_id),
        username: String(row.username),
        display_name: row.display_name == null || String(row.display_name).trim() === ''
            ? null
            : String(row.display_name).trim(),
        avatar_url: row.avatar_url == null ? null : String(row.avatar_url),
        bio: row.bio == null ? null : String(row.bio),
        is_following: Boolean(row.is_following),
        is_public: row.is_public == null ? true : Boolean(row.is_public),
    }));
}
async function loadActiveSubscription(userId) {
    const r = await pool.query(`SELECT plan_type, billing_period, is_active, expires_at, payment_provider
     FROM subscriptions
     WHERE user_id = $1 AND is_active = true
       AND (expires_at IS NULL OR expires_at > now())
     ORDER BY starts_at DESC
     LIMIT 1`, [userId]);
    if (!r.rowCount) {
        return {
            plan_type: 'free',
            billing_period: null,
            is_active: true,
            expires_at: null,
            payment_provider: null,
        };
    }
    const row = r.rows[0];
    return {
        plan_type: row.plan_type,
        billing_period: row.billing_period,
        is_active: row.is_active,
        expires_at: row.expires_at,
        payment_provider: row.payment_provider,
    };
}
async function loadUsage(userId) {
    const month = currentPeriodMonth();
    const r = await pool.query(`SELECT period_month, ar_scans_used, routes_created, locations_viewed
     FROM usage_limits WHERE user_id = $1 AND period_month = $2`, [userId, month]);
    if (!r.rowCount) {
        return {
            period_month: month,
            ar_scans_used: 0,
            routes_created: 0,
            locations_viewed: 0,
        };
    }
    const row = r.rows[0];
    return row;
}
function pgDateToIso(rowVal) {
    if (rowVal == null)
        return null;
    if (typeof rowVal === 'string')
        return rowVal.slice(0, 10);
    if (rowVal instanceof Date)
        return rowVal.toISOString().slice(0, 10);
    return String(rowVal).slice(0, 10);
}
function normalizeSavedRoutePlans(rowVal) {
    if (Array.isArray(rowVal))
        return rowVal;
    if (rowVal == null)
        return [];
    if (typeof rowVal === 'string') {
        try {
            const p = JSON.parse(rowVal);
            return Array.isArray(p) ? p : [];
        }
        catch {
            return [];
        }
    }
    return [];
}
/** Лічильники з таблиці `follows` — не з кешованих колонок profiles (уникає розсинхрону). */
async function loadLiveSocialCounts(userId) {
    const r = await pool.query(`SELECT
       (SELECT COUNT(*)::int FROM follows WHERE following_id = $1::uuid) AS followers_count,
       (SELECT COUNT(*)::int FROM follows WHERE follower_id = $1::uuid) AS following_count`, [userId]);
    const row = r.rows[0];
    return {
        followers_count: Number(row?.followers_count || 0),
        following_count: Number(row?.following_count || 0),
    };
}
function mapProfileRow(row) {
    return {
        id: String(row.id),
        user_id: String(row.user_id),
        username: String(row.username),
        avatar_url: row.avatar_url == null ? null : String(row.avatar_url),
        bio: row.bio == null ? null : String(row.bio),
        language: String(row.language),
        display_name: row.display_name == null || String(row.display_name).trim() === '' ? null : String(row.display_name),
        birth_date: pgDateToIso(row.birth_date),
        birth_date_public: Boolean(row.birth_date_public),
        location_label: row.location_label == null || String(row.location_label).trim() === ''
            ? null
            : String(row.location_label),
        xp_points: Number(row.xp_points),
        level: Number(row.level),
        is_public: Boolean(row.is_public),
        locations_visited: Number(row.locations_visited),
        routes_created: Number(row.routes_created),
        followers_count: Number(row.followers_count),
        following_count: Number(row.following_count),
        created_at: new Date(row.created_at).toISOString(),
        updated_at: new Date(row.updated_at).toISOString(),
        saved_route_plans: normalizeSavedRoutePlans(row.saved_route_plans),
    };
}
function assertBirthDateAllowed(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const today = new Date();
    const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    if (dt > todayUtc) {
        throw new HttpError(400, 'invalid_birth_date');
    }
    const min = new Date(Date.UTC(today.getUTCFullYear() - 120, today.getUTCMonth(), today.getUTCDate()));
    if (dt < min) {
        throw new HttpError(400, 'invalid_birth_date');
    }
}
export async function getProfileMe(userId) {
    const pr = await pool.query(`SELECT * FROM profiles WHERE user_id = $1`, [userId]);
    if (!pr.rowCount) {
        throw new HttpError(404, 'profile_not_found');
    }
    const profileBase = mapProfileRow(pr.rows[0]);
    const liveCounts = await loadLiveSocialCounts(userId);
    const profile = { ...profileBase, ...liveCounts };
    const subscription = await loadActiveSubscription(userId);
    const usage = await loadUsage(userId);
    return { profile, subscription, usage };
}
export async function patchProfileMe(userId, patch) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const cur = await client.query(`SELECT * FROM profiles WHERE user_id = $1 FOR UPDATE`, [userId]);
        if (!cur.rowCount) {
            await client.query('ROLLBACK');
            throw new HttpError(404, 'profile_not_found');
        }
        const row = cur.rows[0];
        const normalizedUsername = patch.username !== undefined
            ? patch.username
                .trim()
                .replace(/^@/, '')
                .toLowerCase()
            : undefined;
        if (normalizedUsername !== undefined && normalizedUsername !== row.username) {
            if (row.username_changed_at) {
                const changed = new Date(String(row.username_changed_at)).getTime();
                if ((Date.now() - changed) / 86_400_000 < 30) {
                    await client.query('ROLLBACK');
                    throw new HttpError(429, 'rate_limited');
                }
            }
            const taken = await client.query(`SELECT 1 FROM profiles WHERE lower(username) = lower($1) AND user_id <> $2`, [
                normalizedUsername,
                userId,
            ]);
            if (taken.rowCount) {
                await client.query('ROLLBACK');
                throw new HttpError(400, 'username_taken');
            }
        }
        if (patch.bio !== undefined && patch.bio != null && patch.bio.length > 300) {
            await client.query('ROLLBACK');
            throw new HttpError(400, 'bio_too_long');
        }
        if (patch.display_name !== undefined && patch.display_name != null && patch.display_name.length > 80) {
            await client.query('ROLLBACK');
            throw new HttpError(400, 'display_name_too_long');
        }
        if (patch.location_label !== undefined && patch.location_label != null && patch.location_label.length > 200) {
            await client.query('ROLLBACK');
            throw new HttpError(400, 'location_label_too_long');
        }
        if (patch.birth_date !== undefined && patch.birth_date != null) {
            assertBirthDateAllowed(patch.birth_date);
        }
        const updates = [];
        const vals = [];
        let n = 1;
        if (normalizedUsername !== undefined) {
            updates.push(`username = $${n++}`);
            vals.push(normalizedUsername);
            updates.push('username_changed_at = now()');
        }
        if (patch.bio !== undefined) {
            updates.push(`bio = $${n++}`);
            vals.push(patch.bio);
        }
        if (patch.language !== undefined) {
            updates.push(`language = $${n++}`);
            vals.push(patch.language);
        }
        if (patch.is_public !== undefined) {
            updates.push(`is_public = $${n++}`);
            vals.push(patch.is_public);
        }
        if (patch.display_name !== undefined) {
            updates.push(`display_name = $${n++}`);
            vals.push(patch.display_name);
        }
        if (patch.birth_date !== undefined) {
            updates.push(`birth_date = $${n++}`);
            vals.push(patch.birth_date);
        }
        if (patch.birth_date_public !== undefined) {
            updates.push(`birth_date_public = $${n++}`);
            vals.push(patch.birth_date_public);
        }
        if (patch.location_label !== undefined) {
            updates.push(`location_label = $${n++}`);
            vals.push(patch.location_label);
        }
        if (patch.saved_route_plans !== undefined) {
            const payload = JSON.stringify(patch.saved_route_plans);
            if (payload.length > 480_000) {
                await client.query('ROLLBACK');
                throw new HttpError(400, 'saved_routes_too_large');
            }
            updates.push(`saved_route_plans = $${n++}::jsonb`);
            vals.push(payload);
        }
        if (patch.firebase_uid !== undefined) {
            const v = patch.firebase_uid;
            if (v != null && String(v).trim() !== '') {
                const uid = String(v).trim();
                const taken = await client.query(`SELECT 1 FROM profiles WHERE firebase_uid = $1 AND user_id <> $2::uuid`, [uid, userId]);
                if (taken.rowCount) {
                    await client.query('ROLLBACK');
                    throw new HttpError(400, 'firebase_uid_taken');
                }
                updates.push(`firebase_uid = $${n++}`);
                vals.push(uid);
            }
            else {
                updates.push(`firebase_uid = $${n++}`);
                vals.push(null);
            }
        }
        if (!updates.length) {
            await client.query('ROLLBACK');
            return mapProfileRow(row);
        }
        updates.push('updated_at = now()');
        vals.push(userId);
        const sql = `UPDATE profiles SET ${updates.join(', ')} WHERE user_id = $${n} RETURNING *`;
        const up = await client.query(sql, vals);
        await client.query('COMMIT');
        let updated = mapProfileRow(up.rows[0]);
        const lvl = computeExplorerLevel({
            locations_visited: updated.locations_visited,
            routes_created: updated.routes_created,
            followers_count: updated.followers_count,
        });
        if (lvl !== updated.level) {
            const lr = await pool.query(`UPDATE profiles SET level = $1, updated_at = now() WHERE user_id = $2 RETURNING *`, [lvl, userId]);
            updated = mapProfileRow(lr.rows[0]);
        }
        return updated;
    }
    catch (e) {
        await client.query('ROLLBACK').catch(() => { });
        throw e;
    }
    finally {
        client.release();
    }
}
export async function saveAvatar(userId, file) {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowed.has(file.mimetype)) {
        throw new HttpError(400, 'invalid_format');
    }
    const ext = file.mimetype === 'image/jpeg' ? 'jpg' : file.mimetype === 'image/png' ? 'png' : 'webp';
    const name = `${randomUUID()}.${ext}`;
    const key = `avatars/${name}`;
    const url = await getStorageProvider().upload(key, file.buffer, file.mimetype);
    await pool.query(`UPDATE profiles SET avatar_url = $1, updated_at = now() WHERE user_id = $2`, [url, userId]);
    return url;
}
export async function clearAvatar(userId) {
    const r = await pool.query(`SELECT avatar_url FROM profiles WHERE user_id = $1::uuid`, [userId]);
    const prev = r.rows[0]?.avatar_url;
    await pool.query(`UPDATE profiles SET avatar_url = NULL, updated_at = now() WHERE user_id = $1::uuid`, [
        userId,
    ]);
    if (prev == null || typeof prev !== 'string')
        return;
    await getStorageProvider().delete(prev).catch(() => { });
}
export async function getPublicProfileByUsername(username, viewerUserId) {
    const normalizedUsername = String(username || '')
        .trim()
        .replace(/^@/, '')
        .toLowerCase();
    const r = await pool.query(`SELECT p.*, u.status AS user_status FROM profiles p
     JOIN users u ON u.id = p.user_id
     WHERE lower(p.username) = lower($1)`, [normalizedUsername]);
    if (!r.rowCount) {
        throw new HttpError(404, 'profile_not_found');
    }
    const row = r.rows[0];
    if (String(row.user_status) === 'deleted') {
        throw new HttpError(404, 'profile_not_found');
    }
    const ownerId = String(row.user_id);
    const isPublic = Boolean(row.is_public);
    if (!isPublic) {
        if (!viewerUserId || viewerUserId !== ownerId) {
            if (!viewerUserId) {
                throw new HttpError(403, 'profile_private');
            }
            const f = await pool.query(`SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2`, [viewerUserId, ownerId]);
            if (!f.rowCount) {
                throw new HttpError(403, 'profile_private');
            }
        }
    }
    let isFollowing = null;
    if (viewerUserId && viewerUserId !== ownerId) {
        const fr = await pool.query(`SELECT 1 FROM follows WHERE follower_id = $1::uuid AND following_id = $2::uuid`, [viewerUserId, ownerId]);
        isFollowing = !!fr.rowCount;
    }
    const birthDate = pgDateToIso(row.birth_date);
    const isOwnerViewer = Boolean(viewerUserId && viewerUserId === ownerId);
    const showBirthToViewer = isOwnerViewer || Boolean(row.birth_date_public);
    const liveCounts = await loadLiveSocialCounts(ownerId);
    return {
        username: String(row.username),
        avatar_url: row.avatar_url == null ? null : String(row.avatar_url),
        bio: row.bio == null ? null : String(row.bio),
        language: String(row.language),
        display_name: row.display_name == null || String(row.display_name).trim() === '' ? null : String(row.display_name),
        location_label: row.location_label == null || String(row.location_label).trim() === ''
            ? null
            : String(row.location_label),
        birth_date: showBirthToViewer && birthDate ? birthDate : null,
        level: Number(row.level),
        xp_points: Number.isFinite(Number(row.xp_points)) ? Number(row.xp_points) : 0,
        locations_visited: Number(row.locations_visited),
        routes_created: Number(row.routes_created),
        followers_count: liveCounts.followers_count,
        following_count: liveCounts.following_count,
        user_id: ownerId,
        is_following: isFollowing,
        is_public: isPublic,
    };
}
function mapPublicProfilePersonRow(row) {
    return {
        user_id: String(row.user_id),
        username: String(row.username),
        display_name: row.display_name == null || String(row.display_name).trim() === ''
            ? null
            : String(row.display_name).trim(),
        avatar_url: row.avatar_url == null ? null : String(row.avatar_url),
    };
}
export async function getPublicProfileFullByUsername(username, viewerUserId, limit = 80) {
    const profile = await getPublicProfileByUsername(username, viewerUserId);
    const ownerId = String(profile.user_id || '');
    const lim = Math.min(120, Math.max(1, Number(limit) || 80));
    const [followersR, followingR, friendsR] = await Promise.all([
        pool.query(`SELECT p.user_id::text AS user_id, p.username, p.display_name, p.avatar_url
       FROM follows f
       JOIN users u ON u.id = f.follower_id AND u.status = 'active'
       JOIN profiles p ON p.user_id = f.follower_id
       WHERE f.following_id = $1::uuid
       ORDER BY f.followed_at DESC
       LIMIT $2`, [ownerId, lim]),
        pool.query(`SELECT p.user_id::text AS user_id, p.username, p.display_name, p.avatar_url
       FROM follows f
       JOIN users u ON u.id = f.following_id AND u.status = 'active'
       JOIN profiles p ON p.user_id = f.following_id
       WHERE f.follower_id = $1::uuid
       ORDER BY f.followed_at DESC
       LIMIT $2`, [ownerId, lim]),
        pool.query(`SELECT p.user_id::text AS user_id, p.username, p.display_name, p.avatar_url
       FROM follows f1
       JOIN follows f2
         ON f2.follower_id = f1.following_id
        AND f2.following_id = f1.follower_id
       JOIN users u ON u.id = f1.following_id AND u.status = 'active'
       JOIN profiles p ON p.user_id = f1.following_id
       WHERE f1.follower_id = $1::uuid
       ORDER BY p.username ASC
       LIMIT $2`, [ownerId, lim]),
    ]);
    return {
        profile,
        followers: followersR.rows.map((row) => mapPublicProfilePersonRow(row)),
        following: followingR.rows.map((row) => mapPublicProfilePersonRow(row)),
        friends: friendsR.rows.map((row) => mapPublicProfilePersonRow(row)),
    };
}
//# sourceMappingURL=profileService.js.map