import { pool } from '../db/pool.js';
import { HttpError } from '../errors/HttpError.js';
import { isMutualFollow, resolveUserIdByUsername } from './socialService.js';
import { sendChatMessagePush } from './chatPushService.js';
import { logger } from '../logger.js';
function orderedPair(a, b) {
    return a < b ? [a, b] : [b, a];
}
async function getThreadByPair(userLow, userHigh) {
    const r = await pool.query(`SELECT * FROM dm_threads WHERE user_low = $1::uuid AND user_high = $2::uuid`, [
        userLow,
        userHigh,
    ]);
    return r.rowCount ? r.rows[0] : null;
}
export async function getOrCreateThread(meId, peerId) {
    if (meId === peerId)
        throw new HttpError(400, 'cannot_message_self');
    const [low, high] = orderedPair(meId, peerId);
    await pool.query(`INSERT INTO dm_threads (user_low, user_high, pending_for_user_id)
     VALUES ($1::uuid, $2::uuid, NULL)
     ON CONFLICT (user_low, user_high) DO NOTHING`, [low, high]);
    const row = await getThreadByPair(low, high);
    if (!row)
        throw new HttpError(500, 'thread_create_failed');
    return { id: String(row.id) };
}
export async function openThreadByUsername(meId, peerUsername) {
    const peerId = await resolveUserIdByUsername(peerUsername);
    if (!peerId)
        throw new HttpError(404, 'user_not_found');
    const thread = await getOrCreateThread(meId, peerId);
    const meta = await getThreadMetaForUser(thread.id, meId);
    return meta;
}
export async function openThreadByUserId(meId, peerId) {
    if (peerId === meId)
        throw new HttpError(400, 'cannot_message_self');
    const thread = await getOrCreateThread(meId, peerId);
    return getThreadMetaForUser(thread.id, meId);
}
async function assertParticipant(threadId, userId) {
    const r = await pool.query(`SELECT user_low::text AS low, user_high::text AS high FROM dm_threads WHERE id = $1::uuid`, [threadId]);
    if (!r.rowCount)
        throw new HttpError(404, 'thread_not_found');
    const row = r.rows[0];
    if (row.low !== userId && row.high !== userId)
        throw new HttpError(403, 'forbidden');
    return row;
}
function peerIdFromThread(row, meId) {
    return row.low === meId ? row.high : row.low;
}
export async function getThreadMetaForUser(threadId, meId) {
    const r = await pool.query(`SELECT t.user_low::text AS low, t.user_high::text AS high, t.pending_for_user_id::text AS pending_for
     FROM dm_threads t WHERE t.id = $1::uuid`, [threadId]);
    if (!r.rowCount)
        throw new HttpError(404, 'thread_not_found');
    const trow = r.rows[0];
    if (trow.low !== meId && trow.high !== meId)
        throw new HttpError(403, 'forbidden');
    const peer = trow.low === meId ? trow.high : trow.low;
    const pr = await pool.query(`SELECT username, display_name, avatar_url FROM profiles WHERE user_id = $1::uuid`, [peer]);
    if (!pr.rowCount)
        throw new HttpError(404, 'profile_not_found');
    const p = pr.rows[0];
    const pendingFor = trow.pending_for;
    const displayName = p.display_name == null || String(p.display_name).trim() === ''
        ? null
        : String(p.display_name).trim();
    return {
        id: threadId,
        peer_user_id: peer,
        peer_username: p.username,
        peer_display_name: displayName,
        peer_avatar_url: p.avatar_url,
        pending_for_me: pendingFor === meId,
        pending_for_peer: pendingFor === peer,
    };
}
// TODO(cursor-pagination): add before_sent_at + before_id cursor parameters so the
// client can page through threads. Shape: listThreads(meId, folder, limit, beforeSentAt?, beforeId?)
// WHERE clause addition: AND (lm.sent_at, b.id) < ($beforeSentAt, $beforeId)
// Response addition: { threads: ThreadListItemDTO[]; next_cursor: string | null }
export async function listThreads(meId, folder, limit = 50) {
    const lim = Math.min(100, Math.max(1, limit));
    const pendingClause = folder === 'requests'
        ? 'AND t.pending_for_user_id = $1::uuid'
        : `AND (t.pending_for_user_id IS NULL OR t.pending_for_user_id <> $1::uuid)`;
    const r = await pool.query(`WITH base AS (
       SELECT t.id, t.user_low, t.user_high, t.pending_for_user_id
       FROM dm_threads t
       WHERE (t.user_low = $1::uuid OR t.user_high = $1::uuid)
       ${pendingClause}
       AND EXISTS (SELECT 1 FROM messages m WHERE m.thread_id = t.id)
     ),
     last_msg AS (
       SELECT DISTINCT ON (m.thread_id)
         m.thread_id, m.content, m.sent_at
       FROM messages m
       INNER JOIN base b ON b.id = m.thread_id
       ORDER BY m.thread_id, m.sent_at DESC
     )
     SELECT b.id::text AS id,
            (CASE WHEN b.user_low = $1::uuid THEN b.user_high ELSE b.user_low END)::text AS peer_id,
            p.username AS peer_username,
            p.display_name AS peer_display_name,
            p.avatar_url AS peer_avatar_url,
            b.pending_for_user_id::text AS pending_for,
            lm.content AS last_content,
            lm.sent_at AS last_sent_at,
            (SELECT COUNT(*)::int FROM messages m2
             WHERE m2.thread_id = b.id AND m2.receiver_id = $1::uuid AND m2.is_read = false) AS unread_count
     FROM base b
     JOIN profiles p ON p.user_id = (CASE WHEN b.user_low = $1::uuid THEN b.user_high ELSE b.user_low END)
     LEFT JOIN last_msg lm ON lm.thread_id = b.id
     ORDER BY lm.sent_at DESC NULLS LAST, b.id DESC
     LIMIT $2`, [meId, lim]);
    const rows = r.rows;
    return rows.map((row) => {
        const pendingForMe = row.pending_for === meId;
        return {
            id: row.id,
            peer_user_id: row.peer_id,
            peer_username: row.peer_username,
            peer_display_name: row.peer_display_name == null || String(row.peer_display_name).trim() === ''
                ? null
                : String(row.peer_display_name).trim(),
            peer_avatar_url: row.peer_avatar_url,
            pending_for_me: pendingForMe,
            pending_for_peer: row.pending_for === row.peer_id,
            last_content: row.last_content,
            last_sent_at: row.last_sent_at ? new Date(row.last_sent_at).toISOString() : null,
            unread_count: row.unread_count,
            folder: pendingForMe ? 'requests' : 'inbox',
        };
    });
}
// TODO(cursor-pagination): add before_sent_at + before_id cursor for infinite-scroll.
// WHERE addition: AND (sent_at, id) < ($beforeSentAt, $beforeId)
// Response addition: { messages: MessageRowDTO[]; next_cursor: string | null }
export async function listMessages(threadId, meId, limit) {
    await assertParticipant(threadId, meId);
    const lim = Math.min(Math.max(limit, 1), 100);
    const r = await pool.query(`SELECT id::text, sender_id::text, receiver_id::text, content, sent_at, is_read
     FROM (
       SELECT id, sender_id, receiver_id, content, sent_at, is_read
       FROM messages
       WHERE thread_id = $1::uuid AND (sender_id = $2::uuid OR receiver_id = $2::uuid)
       ORDER BY sent_at DESC
       LIMIT $3
     ) sub
     ORDER BY sent_at ASC`, [threadId, meId, lim]);
    return r.rows.map((row) => ({
        id: String(row.id),
        sender_id: String(row.sender_id),
        receiver_id: String(row.receiver_id),
        content: String(row.content),
        sent_at: new Date(row.sent_at).toISOString(),
        is_read: Boolean(row.is_read),
        from_me: String(row.sender_id) === meId,
    }));
}
export async function markThreadRead(threadId, meId) {
    await assertParticipant(threadId, meId);
    await pool.query(`UPDATE messages SET is_read = true
     WHERE thread_id = $1::uuid AND receiver_id = $2::uuid AND is_read = false`, [threadId, meId]);
}
export async function sendTextMessage(threadId, senderId, content) {
    const trimmed = content.trim();
    if (!trimmed)
        throw new HttpError(400, 'empty_message');
    if (trimmed.length > 2000)
        throw new HttpError(400, 'message_too_long');
    const row = await assertParticipant(threadId, senderId);
    const receiverId = peerIdFromThread(row, senderId);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const cnt = await client.query(`SELECT COUNT(*)::int AS c FROM messages WHERE thread_id = $1::uuid`, [
            threadId,
        ]);
        const prevCount = cnt.rows[0].c;
        const ins = await client.query(`INSERT INTO messages (sender_id, receiver_id, content, thread_id)
       VALUES ($1::uuid, $2::uuid, $3, $4::uuid)
       RETURNING id::text, sender_id::text, receiver_id::text, content, sent_at, is_read`, [senderId, receiverId, trimmed, threadId]);
        if (prevCount === 0) {
            const mutual = await isMutualFollow(senderId, receiverId);
            if (!mutual) {
                await client.query(`UPDATE dm_threads SET pending_for_user_id = $1::uuid, updated_at = now() WHERE id = $2::uuid`, [receiverId, threadId]);
            }
        }
        await client.query(`UPDATE dm_threads SET updated_at = now() WHERE id = $1::uuid`, [threadId]);
        await client.query('COMMIT');
        const m = ins.rows[0];
        // Fire-and-forget push notification to the receiver
        const senderName = await resolveSenderName(senderId);
        sendChatMessagePush(receiverId, {
            threadId,
            senderName,
            senderId,
            content: trimmed,
        }).catch((pushErr) => {
            logger.warn('[messageService] Failed to send push', pushErr instanceof Error ? pushErr.message : pushErr);
        });
        return {
            id: String(m.id),
            sender_id: String(m.sender_id),
            receiver_id: String(m.receiver_id),
            content: String(m.content),
            sent_at: new Date(m.sent_at).toISOString(),
            is_read: Boolean(m.is_read),
            from_me: true,
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
export async function acceptThread(threadId, meId) {
    const r = await pool.query(`SELECT pending_for_user_id::text AS p FROM dm_threads WHERE id = $1::uuid`, [threadId]);
    if (!r.rowCount)
        throw new HttpError(404, 'thread_not_found');
    const p = r.rows[0].p;
    if (p !== meId)
        throw new HttpError(400, 'not_pending_for_you');
    await pool.query(`UPDATE dm_threads SET pending_for_user_id = NULL, updated_at = now() WHERE id = $1::uuid`, [threadId]);
    return getThreadMetaForUser(threadId, meId);
}
export async function clearThreadMessages(threadId, meId) {
    await assertParticipant(threadId, meId);
    await pool.query(`DELETE FROM messages WHERE thread_id = $1::uuid`, [threadId]);
}
async function resolveSenderName(senderId) {
    try {
        const r = await pool.query(`SELECT COALESCE(display_name, username) AS name FROM profiles WHERE user_id = $1::uuid`, [senderId]);
        if (r.rowCount) {
            const name = r.rows[0].name;
            if (name && String(name).trim())
                return String(name).trim();
        }
    }
    catch {
        /* best-effort */
    }
    return 'KRAЇNA';
}
export async function removeThread(threadId, meId) {
    await assertParticipant(threadId, meId);
    await pool.query(`DELETE FROM messages WHERE thread_id = $1::uuid`, [threadId]);
    await pool.query(`DELETE FROM dm_threads WHERE id = $1::uuid`, [threadId]);
}
//# sourceMappingURL=messageService.js.map