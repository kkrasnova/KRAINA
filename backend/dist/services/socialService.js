import { pool } from '../db/pool.js';
import { HttpError } from '../errors/HttpError.js';
import { verifyIncomingFirestoreFollowRequest } from './firestoreAdminService.js';
const PG_UUID_RE = /^[0-9a-f-]{36}$/i;
async function resolveFollowerPostgresIdForEdge(rawFollowerId) {
    const fp = String(rawFollowerId || '').trim();
    if (!fp)
        return null;
    if (PG_UUID_RE.test(fp)) {
        const r = await pool.query(`SELECT id::text FROM users WHERE id = $1::uuid AND status = 'active'`, [fp]);
        if (!r.rowCount)
            return null;
        return String(r.rows[0].id);
    }
    const r2 = await pool.query(`SELECT p.user_id::text AS id
     FROM profiles p
     INNER JOIN users u ON u.id = p.user_id AND u.status = 'active'
     WHERE p.firebase_uid = $1`, [fp]);
    if (!r2.rowCount)
        return null;
    return String(r2.rows[0].id);
}
export async function resolveUserIdByUsername(username) {
    const u = username.trim().replace(/^@/, '');
    if (!u)
        return null;
    const r = await pool.query(`SELECT p.user_id::text AS id
     FROM profiles p
     JOIN users u ON u.id = p.user_id
     WHERE lower(p.username) = lower($1) AND u.status = 'active'`, [u]);
    if (!r.rowCount)
        return null;
    return String(r.rows[0].id);
}
async function isProfilePrivate(userId) {
    const r = await pool.query(`SELECT is_public FROM profiles WHERE user_id = $1::uuid`, [userId]);
    if (!r.rowCount)
        return false;
    return r.rows[0].is_public === false;
}
export async function isMutualFollow(a, b) {
    if (a === b)
        return false;
    const r = await pool.query(`SELECT EXISTS (
       SELECT 1 FROM follows f1
       INNER JOIN follows f2
         ON f1.follower_id = $1::uuid AND f1.following_id = $2::uuid
        AND f2.follower_id = $2::uuid AND f2.following_id = $1::uuid
     ) AS ok`, [a, b]);
    return Boolean(r.rows[0].ok);
}
async function _isMutualFollowWithClient(client, a, b) {
    if (a === b)
        return false;
    const r = await client.query(`SELECT EXISTS (
       SELECT 1 FROM follows f1
       INNER JOIN follows f2
         ON f1.follower_id = $1::uuid AND f1.following_id = $2::uuid
        AND f2.follower_id = $2::uuid AND f2.following_id = $1::uuid
     ) AS ok`, [a, b]);
    return Boolean(r.rows[0].ok);
}
async function _clearPendingIfMutualWithClient(client, userA, userB) {
    const low = userA < userB ? userA : userB;
    const high = userA < userB ? userB : userA;
    const mutual = await _isMutualFollowWithClient(client, userA, userB);
    if (!mutual)
        return;
    await client.query(`UPDATE dm_threads SET pending_for_user_id = NULL, updated_at = now()
     WHERE user_low = $1::uuid AND user_high = $2::uuid`, [low, high]);
}
// Inner helper — must be called inside an active transaction.
// Returns true when a new edge was inserted, false when it already existed.
async function _insertConfirmedFollowEdgeWithClient(client, followerId, followingId) {
    if (followerId === followingId)
        throw new HttpError(400, 'cannot_follow_self');
    // ON CONFLICT DO NOTHING makes this idempotent: duplicate follow attempts
    // (e.g. concurrent requests, retries) never raise a PK violation.
    // Counter UPDATEs below only execute when a row was actually inserted,
    // preventing double-increment on replay.
    const ins = await client.query(`INSERT INTO follows (follower_id, following_id) VALUES ($1::uuid, $2::uuid)
     ON CONFLICT DO NOTHING
     RETURNING follower_id`, [followerId, followingId]);
    if (!ins.rowCount)
        return false; // edge already existed — counters are unchanged
    await client.query(`UPDATE profiles SET followers_count = followers_count + 1, updated_at = now() WHERE user_id = $1::uuid`, [followingId]);
    await client.query(`UPDATE profiles SET following_count = following_count + 1, updated_at = now() WHERE user_id = $1::uuid`, [followerId]);
    // Remove any pending follow_request for this pair — idempotent, safe even if
    // no request row exists (e.g. public-profile direct follow path).
    await client.query(`DELETE FROM follow_requests WHERE follower_id = $1::uuid AND followee_id = $2::uuid`, [followerId, followingId]);
    await _clearPendingIfMutualWithClient(client, followerId, followingId);
    return true;
}
// Public wrapper: provides the transaction for the four atomic writes inside
// _insertConfirmedFollowEdgeWithClient (INSERT follows, two counter UPDATEs,
// DELETE follow_request). If any write fails the whole set rolls back, keeping
// the follows edge and both profile counters consistent with each other.
async function insertConfirmedFollowEdge(followerId, followingId) {
    if (followerId === followingId)
        throw new HttpError(400, 'cannot_follow_self');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await _insertConfirmedFollowEdgeWithClient(client, followerId, followingId);
        await client.query('COMMIT');
        return result;
    }
    catch (e) {
        await client.query('ROLLBACK').catch(() => { });
        throw e;
    }
    finally {
        client.release();
    }
}
async function insertPendingFollowRequest(followerId, followeeId) {
    if (followerId === followeeId)
        throw new HttpError(400, 'cannot_follow_self');
    const existing = await pool.query(`SELECT 1 FROM follows WHERE follower_id = $1::uuid AND following_id = $2::uuid`, [followerId, followeeId]);
    if (existing.rowCount)
        return false;
    const ins = await pool.query(`INSERT INTO follow_requests (follower_id, followee_id) VALUES ($1::uuid, $2::uuid)
     ON CONFLICT DO NOTHING
     RETURNING follower_id`, [followerId, followeeId]);
    return Boolean(ins.rowCount);
}
async function deletePendingFollowRequest(followerId, followeeId) {
    const del = await pool.query(`DELETE FROM follow_requests
     WHERE follower_id = $1::uuid AND followee_id = $2::uuid
     RETURNING follower_id`, [followerId, followeeId]);
    return Boolean(del.rowCount);
}
export async function insertFollowEdgeByIds(followerId, followingId) {
    if (followerId === followingId)
        throw new HttpError(400, 'cannot_follow_self');
    const isPrivate = await isProfilePrivate(followingId);
    if (isPrivate) {
        await insertPendingFollowRequest(followerId, followingId);
        return { pending: true };
    }
    await insertConfirmedFollowEdge(followerId, followingId);
    return { pending: false };
}
export async function deleteFollowEdgeByIds(followerId, followingId) {
    // Cancel any pending follow_request first — idempotent and safe outside the
    // transaction because it is a best-effort cleanup with no counter side-effects.
    await deletePendingFollowRequest(followerId, followingId);
    // Atomic: DELETE follows edge + decrement both profile counters.
    // Without the transaction a crash between the DELETE and either UPDATE
    // leaves follower/following counts permanently out of sync.
    // GREATEST(0, ...) prevents counters going negative from pre-existing drift.
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const del = await client.query(`DELETE FROM follows WHERE follower_id = $1::uuid AND following_id = $2::uuid RETURNING follower_id`, [followerId, followingId]);
        if (!del.rowCount) {
            // Edge was not found (already unfollowed) — nothing to decrement.
            // .catch() ensures a broken-connection ROLLBACK failure doesn't surface
            // as a misleading error when the logical outcome is success.
            await client.query('ROLLBACK').catch(() => { });
            return;
        }
        await client.query(`UPDATE profiles SET followers_count = GREATEST(0, followers_count - 1), updated_at = now() WHERE user_id = $1::uuid`, [followingId]);
        await client.query(`UPDATE profiles SET following_count = GREATEST(0, following_count - 1), updated_at = now() WHERE user_id = $1::uuid`, [followerId]);
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
export async function followByUsername(followerId, targetUsername) {
    const targetId = await resolveUserIdByUsername(targetUsername);
    if (!targetId)
        throw new HttpError(404, 'user_not_found');
    if (targetId === followerId)
        throw new HttpError(400, 'cannot_follow_self');
    const out = await insertFollowEdgeByIds(followerId, targetId);
    return { ...out, user_id: targetId };
}
export async function followByUserId(followerId, targetUserId) {
    const targetId = String(targetUserId || '').trim();
    if (!PG_UUID_RE.test(targetId))
        throw new HttpError(400, 'invalid_user_id');
    const exists = await pool.query(`SELECT id FROM users WHERE id = $1::uuid AND status = 'active'`, [targetId]);
    if (!exists.rowCount)
        throw new HttpError(404, 'user_not_found');
    if (targetId === followerId)
        throw new HttpError(400, 'cannot_follow_self');
    const out = await insertFollowEdgeByIds(followerId, targetId);
    return { ...out, user_id: targetId };
}
export async function unfollowByUsername(followerId, targetUsername) {
    const targetId = await resolveUserIdByUsername(targetUsername);
    if (!targetId)
        throw new HttpError(404, 'user_not_found');
    if (targetId === followerId)
        throw new HttpError(400, 'cannot_unfollow_self');
    await deleteFollowEdgeByIds(followerId, targetId);
}
export async function unfollowByUserId(followerId, targetUserId) {
    const targetId = String(targetUserId || '').trim();
    if (!PG_UUID_RE.test(targetId))
        throw new HttpError(400, 'invalid_user_id');
    if (targetId === followerId)
        throw new HttpError(400, 'cannot_unfollow_self');
    await deleteFollowEdgeByIds(followerId, targetId);
}
export async function listIncomingRequests(userId) {
    const r = await pool.query(`SELECT u.id::text AS user_id, p.username, p.display_name, p.avatar_url, fr.requested_at
     FROM follow_requests fr
     JOIN users u ON u.id = fr.follower_id AND u.status = 'active'
     JOIN profiles p ON p.user_id = u.id
     WHERE fr.followee_id = $1::uuid
     ORDER BY fr.requested_at DESC`, [userId]);
    return r.rows.map((row) => ({
        user_id: String(row.user_id),
        username: String(row.username),
        display_name: row.display_name == null ? null : String(row.display_name),
        avatar_url: row.avatar_url == null ? null : String(row.avatar_url),
        requested_at: new Date(row.requested_at).toISOString(),
    }));
}
export async function listOutgoingRequests(userId) {
    const r = await pool.query(`SELECT u.id::text AS user_id, p.username, p.display_name, p.avatar_url, fr.requested_at
     FROM follow_requests fr
     JOIN users u ON u.id = fr.followee_id AND u.status = 'active'
     JOIN profiles p ON p.user_id = u.id
     WHERE fr.follower_id = $1::uuid
     ORDER BY fr.requested_at DESC`, [userId]);
    return r.rows.map((row) => ({
        user_id: String(row.user_id),
        username: String(row.username),
        display_name: row.display_name == null ? null : String(row.display_name),
        avatar_url: row.avatar_url == null ? null : String(row.avatar_url),
        requested_at: new Date(row.requested_at).toISOString(),
    }));
}
// export async function acceptFriendRequest(meId: string, requesterId: string): Promise<void> {
//   const target = String(requesterId || '').trim();
//   if (!PG_UUID_RE.test(target)) throw new HttpError(400, 'invalid_user_id');
//   if (target === meId) throw new HttpError(400, 'cannot_follow_self');
//   const rr = await pool.query(
//     `SELECT 1 FROM follow_requests WHERE follower_id = $1::uuid AND followee_id = $2::uuid`,
//     [target, meId],
//   );
//   if (!rr.rowCount) {
//     const already = await pool.query(
//       `SELECT 1 FROM follows WHERE follower_id = $1::uuid AND following_id = $2::uuid`,
//       [target, meId],
//     );
//     if (!already.rowCount) throw new HttpError(404, 'request_not_found');
//     await insertConfirmedFollowEdge(meId, target);
//     return;
//   }
//   await insertConfirmedFollowEdge(target, meId);
//   await insertConfirmedFollowEdge(meId, target);
// }
export async function acceptFriendRequest(meId, requesterId) {
    const target = String(requesterId || '').trim();
    if (!PG_UUID_RE.test(target))
        throw new HttpError(400, 'invalid_user_id');
    if (target === meId)
        throw new HttpError(400, 'cannot_follow_self');
    // Atomic: DELETE the pending follow_request + INSERT the confirmed follows edge
    // + increment both profile counters, all in one transaction.
    // If any step fails the request row is restored and no counter changes occur.
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const removed = await client.query(`DELETE FROM follow_requests
       WHERE follower_id = $1::uuid AND followee_id = $2::uuid
       RETURNING follower_id`, [target, meId]);
        if (!removed.rowCount) {
            // No pending request found — check whether the edge already exists so
            // that a duplicate accept (e.g. client retry after a 5xx) is idempotent
            // rather than returning an error.
            const already = await client.query(`SELECT 1 FROM follows WHERE follower_id = $1::uuid AND following_id = $2::uuid`, [target, meId]);
            if (!already.rowCount)
                throw new HttpError(404, 'request_not_found');
            await client.query('COMMIT'); // commit the empty read-only transaction
            return;
        }
        // Instagram/Twitter model: only the requester follows me.
        // I do NOT automatically follow the requester back.
        // The accepting user must choose to follow back as a separate explicit action.
        await _insertConfirmedFollowEdgeWithClient(client, target, meId);
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
export async function declineFriendRequest(meId, requesterId) {
    const target = String(requesterId || '').trim();
    if (!PG_UUID_RE.test(target))
        throw new HttpError(400, 'invalid_user_id');
    await deletePendingFollowRequest(target, meId);
}
export async function cancelOutgoingRequest(meId, targetUserId) {
    const target = String(targetUserId || '').trim();
    if (!PG_UUID_RE.test(target))
        throw new HttpError(400, 'invalid_user_id');
    await deletePendingFollowRequest(meId, target);
}
export async function acceptFirestoreFollowIntoPostgres(followeeId, followerParam) {
    const fp = String(followerParam || '').trim();
    if (!followeeId || !fp)
        throw new HttpError(400, 'invalid_params');
    const gate = await verifyIncomingFirestoreFollowRequest(fp, followeeId);
    if (gate === 'missing') {
        throw new HttpError(404, 'follow_request_not_found');
    }
    const followerPgId = await resolveFollowerPostgresIdForEdge(fp);
    if (!followerPgId) {
        if (PG_UUID_RE.test(fp))
            throw new HttpError(400, 'invalid_follower');
        throw new HttpError(400, 'follower_not_linked');
    }
    if (followerPgId === followeeId)
        throw new HttpError(400, 'cannot_follow_self');
    await deletePendingFollowRequest(followerPgId, followeeId);
    await insertConfirmedFollowEdge(followerPgId, followeeId);
}
export async function listMutualFriends(userId) {
    const r = await pool.query(`SELECT u.id::text AS user_id, p.username, p.avatar_url
     FROM follows f1
     INNER JOIN follows f2
       ON f1.follower_id = $1::uuid
      AND f2.following_id = $1::uuid
      AND f1.following_id = f2.follower_id
     INNER JOIN users u ON u.id = f1.following_id AND u.status = 'active'
     INNER JOIN profiles p ON p.user_id = u.id
     ORDER BY p.username ASC`, [userId]);
    return r.rows.map((row) => ({
        user_id: String(row.user_id),
        username: row.username,
        avatar_url: row.avatar_url,
    }));
}
export async function searchSocialProfiles(meId, q, limit = 24) {
    const term = String(q || '')
        .trim()
        .slice(0, 200)
        .replace(/\\/g, '')
        .replace(/%/g, '')
        .replace(/_/g, '')
        .replace(/^@/, '');
    const lim = Math.min(40, Math.max(1, Number(limit) || 24));
    const mapSearchRow = (row) => ({
        user_id: String(row.user_id),
        firebase_uid: row.firebase_uid == null ? null : String(row.firebase_uid),
        username: String(row.username),
        display_name: row.display_name == null ? null : String(row.display_name),
        avatar_url: row.avatar_url == null ? null : String(row.avatar_url),
        bio: row.bio == null ? null : String(row.bio),
        is_private: Boolean(row.is_private),
        followers_count: Number(row.followers_count || 0),
        following_count: Number(row.following_count || 0),
        is_following: Boolean(row.is_following),
        pending_follow_outgoing: Boolean(row.pending_follow_outgoing),
    });
    // Порожній запит → добірка людей для огляду (топ активних публічних профілів).
    // Без цього екран «Знайти людей» лишається порожнім до першого введеного символу.
    if (term.length < 1) {
        const top = await pool.query(`SELECT p.user_id::text AS user_id, p.firebase_uid, p.username, p.display_name,
              p.avatar_url, p.bio, (p.is_public = false) AS is_private,
              p.followers_count, p.following_count,
              EXISTS (
                SELECT 1 FROM follows f
                WHERE $1::uuid IS NOT NULL AND f.follower_id = $1::uuid AND f.following_id = p.user_id
              ) AS is_following,
              EXISTS (
                SELECT 1 FROM follow_requests fr
                WHERE $1::uuid IS NOT NULL AND fr.follower_id = $1::uuid AND fr.followee_id = p.user_id
              ) AS pending_follow_outgoing
       FROM profiles p
       JOIN users u ON u.id = p.user_id AND u.status = 'active'
       WHERE ($1::uuid IS NULL OR p.user_id <> $1::uuid)
         AND p.is_public = true
       ORDER BY p.followers_count DESC, p.updated_at DESC
       LIMIT $2`, [meId, lim]);
        return top.rows.map(mapSearchRow);
    }
    const like = `%${term}%`;
    const r = await pool.query(`WITH matched AS (
       SELECT p.user_id
       FROM profiles p
       JOIN users u ON u.id = p.user_id
       WHERE u.status = 'active'
         AND ($1::uuid IS NULL OR p.user_id <> $1::uuid)
         AND (
           p.username ILIKE $2
           OR COALESCE(p.display_name, '') ILIKE $2
         )
       ORDER BY
         CASE
           WHEN lower(p.username) = lower($3) OR lower(COALESCE(p.display_name, '')) = lower($3) THEN 0
           WHEN lower(p.username) LIKE lower($3) || '%' OR lower(COALESCE(p.display_name, '')) LIKE lower($3) || '%' THEN 1
           ELSE 2
         END,
         p.username ASC
       LIMIT $4
     )
     SELECT p.user_id::text AS user_id,
            p.firebase_uid,
            p.username,
            p.display_name,
            p.avatar_url,
            p.bio,
            (p.is_public = false) AS is_private,
            p.followers_count,
            p.following_count,
            EXISTS (
              SELECT 1 FROM follows f
              WHERE $1::uuid IS NOT NULL
                AND f.follower_id = $1::uuid
                AND f.following_id = p.user_id
            ) AS is_following,
            EXISTS (
              SELECT 1 FROM follow_requests fr
              WHERE $1::uuid IS NOT NULL
                AND fr.follower_id = $1::uuid
                AND fr.followee_id = p.user_id
            ) AS pending_follow_outgoing
     FROM matched m
     JOIN profiles p ON p.user_id = m.user_id
     ORDER BY
       CASE
         WHEN lower(p.username) = lower($3) OR lower(COALESCE(p.display_name, '')) = lower($3) THEN 0
         WHEN lower(p.username) LIKE lower($3) || '%' OR lower(COALESCE(p.display_name, '')) LIKE lower($3) || '%' THEN 1
         ELSE 2
       END,
       p.username ASC`, [meId, like, term, lim]);
    return r.rows.map(mapSearchRow);
}
// TODO(cursor-pagination): replace limit-only with alphabetical (username ASC, user_id ASC) cursor.
// Add: after_username?: string, after_user_id?: string params.
// WHERE addition: AND (p.username, p.user_id) > ($afterUsername, $afterUserId)
// Pairs well with the existing ORDER BY p.username ASC on all three query branches.
export async function listSocialConnectionsByTarget(params) {
    const meId = params.meId ?? null;
    const kind = params.kind === 'followers' || params.kind === 'following' ? params.kind : 'friends';
    const lim = Math.min(200, Math.max(1, Number(params.limit) || 120));
    const targetUserIdRaw = String(params.targetUserId || '').trim();
    const targetUsernameRaw = String(params.targetUsername || '').replace(/^@/, '').trim();
    let targetUserId = targetUserIdRaw;
    if (!targetUserId && targetUsernameRaw) {
        const resolved = await resolveUserIdByUsername(targetUsernameRaw);
        if (!resolved)
            return [];
        targetUserId = resolved;
    }
    if (!targetUserId)
        return [];
    const sql = kind === 'followers'
        ? `SELECT p.user_id::text AS user_id, p.firebase_uid, p.username, p.display_name, p.avatar_url, p.bio,
                (p.is_public = false) AS is_private, p.followers_count, p.following_count
         FROM follows f
         JOIN users u ON u.id = f.follower_id AND u.status = 'active'
         JOIN profiles p ON p.user_id = u.id
         WHERE f.following_id = $1::uuid
         ORDER BY p.username ASC
         LIMIT $2`
        : kind === 'following'
            ? `SELECT p.user_id::text AS user_id, p.firebase_uid, p.username, p.display_name, p.avatar_url, p.bio,
                  (p.is_public = false) AS is_private, p.followers_count, p.following_count
           FROM follows f
           JOIN users u ON u.id = f.following_id AND u.status = 'active'
           JOIN profiles p ON p.user_id = u.id
           WHERE f.follower_id = $1::uuid
           ORDER BY p.username ASC
           LIMIT $2`
            : `SELECT p.user_id::text AS user_id, p.firebase_uid, p.username, p.display_name, p.avatar_url, p.bio,
                  (p.is_public = false) AS is_private, p.followers_count, p.following_count
           FROM follows f1
           JOIN follows f2 ON f2.follower_id = f1.following_id AND f2.following_id = f1.follower_id
           JOIN users u ON u.id = f1.following_id AND u.status = 'active'
           JOIN profiles p ON p.user_id = u.id
           WHERE f1.follower_id = $1::uuid
           ORDER BY p.username ASC
           LIMIT $2`;
    const r = await pool.query(sql, [targetUserId, lim]);
    const rows = r.rows;
    if (!rows.length)
        return [];
    if (!meId) {
        return rows.map((row) => ({
            user_id: String(row.user_id),
            firebase_uid: row.firebase_uid == null ? null : String(row.firebase_uid),
            username: String(row.username),
            display_name: row.display_name == null ? null : String(row.display_name),
            avatar_url: row.avatar_url == null ? null : String(row.avatar_url),
            bio: row.bio == null ? null : String(row.bio),
            is_private: Boolean(row.is_private),
            followers_count: Number(row.followers_count || 0),
            following_count: Number(row.following_count || 0),
            is_following: false,
            pending_follow_outgoing: false,
        }));
    }
    const ids = rows.map((row) => String(row.user_id));
    const [rel, pend] = await Promise.all([
        pool.query(`SELECT following_id::text AS id
       FROM follows
       WHERE follower_id = $1::uuid
         AND following_id = ANY($2::uuid[])`, [meId, ids]),
        pool.query(`SELECT followee_id::text AS id
       FROM follow_requests
       WHERE follower_id = $1::uuid
         AND followee_id = ANY($2::uuid[])`, [meId, ids]),
    ]);
    const followingSet = new Set(rel.rows.map((x) => String(x.id)));
    const pendingSet = new Set(pend.rows.map((x) => String(x.id)));
    return rows.map((row) => ({
        user_id: String(row.user_id),
        firebase_uid: row.firebase_uid == null ? null : String(row.firebase_uid),
        username: String(row.username),
        display_name: row.display_name == null ? null : String(row.display_name),
        avatar_url: row.avatar_url == null ? null : String(row.avatar_url),
        bio: row.bio == null ? null : String(row.bio),
        is_private: Boolean(row.is_private),
        followers_count: Number(row.followers_count || 0),
        following_count: Number(row.following_count || 0),
        is_following: followingSet.has(String(row.user_id)),
        pending_follow_outgoing: pendingSet.has(String(row.user_id)),
    }));
}
export async function getRelationStateByTarget(params) {
    const meId = params.meId ?? null;
    const empty = { is_following: false, pending_follow_outgoing: false, is_followed_by_peer: false };
    if (!meId)
        return empty;
    const targetUserIdRaw = String(params.targetUserId || '').trim();
    const targetUsernameRaw = String(params.targetUsername || '').replace(/^@/, '').trim();
    let targetUserId = targetUserIdRaw;
    if (!targetUserId && targetUsernameRaw) {
        const resolved = await resolveUserIdByUsername(targetUsernameRaw);
        if (!resolved)
            return empty;
        targetUserId = resolved;
    }
    if (!targetUserId || targetUserId === meId) {
        return empty;
    }
    const r = await pool.query(`SELECT
       EXISTS (
         SELECT 1 FROM follows
         WHERE follower_id = $1::uuid AND following_id = $2::uuid
       ) AS is_following,
       EXISTS (
         SELECT 1 FROM follows
         WHERE follower_id = $2::uuid AND following_id = $1::uuid
       ) AS is_followed_by_peer,
       EXISTS (
         SELECT 1 FROM follow_requests
         WHERE follower_id = $1::uuid AND followee_id = $2::uuid
       ) AS pending_follow_outgoing`, [meId, targetUserId]);
    const row = r.rows[0];
    const following = Boolean(row?.is_following);
    const followedBy = Boolean(row?.is_followed_by_peer);
    return {
        is_following: following,
        pending_follow_outgoing: Boolean(row?.pending_follow_outgoing),
        is_followed_by_peer: followedBy,
    };
}
// fdf
//# sourceMappingURL=socialService.js.map