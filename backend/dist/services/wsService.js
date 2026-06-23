/**
 * Real-time WebSocket service for chat messaging.
 *
 * Architecture:
 * - Shares the HTTP server with Express (no separate port).
 * - Authenticates via JWT token passed as ?token= query param during upgrade.
 * - Maintains a userId → Set<WebSocket> map (supports multiple devices).
 * - Relays messages, typing indicators, and read receipts in real-time.
 * - Auto-disconnects on invalid/missing token.
 */
// `WebSocket` must be a value import (not `type`): safeSend() reads the
// runtime constant `WebSocket.OPEN`. A type-only import is erased at runtime
// and throws `ReferenceError: WebSocket is not defined` on the first frame.
import { WebSocketServer, WebSocket } from 'ws';
import { verifyAccessToken } from '../utils/tokens.js';
import { logger } from '../logger.js';
import { pool } from '../db/pool.js';
// ─── State ─────────────────────────────────────────────────────────────────────
const clients = new Map(); // userId → connections
const wsToClient = new Map(); // reverse lookup
let wss = null;
// ─── Public API ────────────────────────────────────────────────────────────────
/**
 * Initialise the WebSocket server on the same HTTP server as Express.
 * Call this once during server startup (in index.ts).
 */
export function initWsServer(server) {
    wss = new WebSocketServer({ server, path: '/ws' });
    wss.on('connection', (ws, req) => {
        handleConnection(ws, req);
    });
    wss.on('error', (err) => {
        logger.error('[ws] server error', { err: err.message });
    });
    logger.info('[ws] WebSocket server initialised at /ws');
    return wss;
}
/**
 * Send a real-time event to a specific user (all their connected devices).
 * Returns the number of devices the event was sent to.
 */
export function sendToUser(userId, event) {
    const conns = clients.get(userId);
    if (!conns || conns.size === 0)
        return 0;
    const payload = JSON.stringify(event);
    let sent = 0;
    for (const client of conns) {
        if (client.ws.readyState === WebSocket.OPEN) {
            try {
                client.ws.send(payload);
                sent++;
            }
            catch (e) {
                logger.warn('[ws] send error', { userId, err: e instanceof Error ? e.message : String(e) });
            }
        }
    }
    return sent;
}
/**
 * Send a real-time event to multiple users at once.
 */
export function sendToUsers(userIds, event) {
    let total = 0;
    for (const uid of userIds) {
        total += sendToUser(uid, event);
    }
    return total;
}
/**
 * Check if a user has any active WebSocket connections.
 */
export function isUserOnline(userId) {
    const conns = clients.get(userId);
    if (!conns || conns.size === 0)
        return false;
    for (const c of conns) {
        if (c.ws.readyState === WebSocket.OPEN)
            return true;
    }
    return false;
}
/**
 * Get the number of active connections for a user.
 */
export function getUserDeviceCount(userId) {
    const conns = clients.get(userId);
    if (!conns)
        return 0;
    let count = 0;
    for (const c of conns) {
        if (c.ws.readyState === WebSocket.OPEN)
            count++;
    }
    return count;
}
/**
 * Get the total number of connected users.
 */
export function getConnectedUserCount() {
    const unique = new Set();
    for (const [userId, conns] of clients) {
        for (const c of conns) {
            if (c.ws.readyState === WebSocket.OPEN) {
                unique.add(userId);
                break;
            }
        }
    }
    return unique.size;
}
/**
 * Gracefully close all WebSocket connections and shut down the server.
 */
export function closeWsServer() {
    return new Promise((resolve) => {
        if (!wss) {
            resolve();
            return;
        }
        // Close all client connections
        for (const [, conns] of clients) {
            for (const client of conns) {
                try {
                    client.ws.close(1001, 'Server shutting down');
                }
                catch { /* ignore */ }
            }
        }
        clients.clear();
        wsToClient.clear();
        wss.close(() => {
            logger.info('[ws] WebSocket server closed');
            wss = null;
            resolve();
        });
    });
}
// ─── Internal Connection Handling ──────────────────────────────────────────────
function handleConnection(ws, req) {
    // Parse JWT token from query string
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const token = url.searchParams.get('token');
    if (!token) {
        ws.close(4001, 'token_required');
        return;
    }
    let payload;
    try {
        payload = verifyAccessToken(token);
    }
    catch {
        ws.close(4001, 'token_invalid');
        return;
    }
    const userId = payload.sub;
    // Register the connection
    const client = { ws, userId, connectedAt: Date.now() };
    if (!clients.has(userId)) {
        clients.set(userId, new Set());
    }
    clients.get(userId).add(client);
    wsToClient.set(ws, client);
    logger.debug('[ws] client connected', { userId, deviceCount: clients.get(userId).size });
    // Send welcome event
    safeSend(ws, { type: 'connected', userId });
    // Handle incoming messages from this client
    ws.on('message', (raw) => {
        let event;
        try {
            event = JSON.parse(raw.toString());
        }
        catch {
            safeSend(ws, { type: 'error', message: 'invalid_json' });
            return;
        }
        handleClientEvent(ws, client, event);
    });
    ws.on('close', (code, reason) => {
        handleDisconnect(client);
    });
    ws.on('error', (err) => {
        logger.warn('[ws] client error', { userId, err: err.message });
        handleDisconnect(client);
    });
    // Heartbeat / ping-pong
    ws.on('pong', () => {
        // Client is alive; heartbeat is managed automatically by `ws`.
    });
    // Set a heartbeat interval (auto ping every 30s)
    const heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
        }
        else {
            clearInterval(heartbeat);
        }
    }, 30_000);
    ws.on('close', () => clearInterval(heartbeat));
    ws.on('error', () => clearInterval(heartbeat));
}
function handleDisconnect(client) {
    const { userId, ws } = client;
    wsToClient.delete(ws);
    const conns = clients.get(userId);
    if (conns) {
        conns.delete(client);
        if (conns.size === 0) {
            clients.delete(userId);
        }
    }
    logger.debug('[ws] client disconnected', {
        userId,
        remainingDevices: clients.get(userId)?.size ?? 0,
    });
}
function handleClientEvent(ws, client, event) {
    switch (event.type) {
        case 'typing':
        case 'stopped_typing': {
            const isTyping = event.type === 'typing';
            const threadId = event.threadId;
            if (!threadId) {
                safeSend(ws, { type: 'error', message: 'threadId_required' });
                return;
            }
            // Relay typing status to the OTHER participant(s) in the thread
            relayTypingToPeers(client.userId, threadId, isTyping);
            break;
        }
        case 'mark_read': {
            if (!event.threadId) {
                safeSend(ws, { type: 'error', message: 'threadId_required' });
                return;
            }
            handleMarkRead(client.userId, event.threadId, event.messageId);
            break;
        }
        case 'mark_delivered': {
            if (!event.threadId || !event.messageId) {
                safeSend(ws, { type: 'error', message: 'threadId_and_messageId_required' });
                return;
            }
            handleMarkDelivered(client.userId, event.threadId, event.messageId);
            break;
        }
        case 'ping': {
            safeSend(ws, { type: 'connected', userId: client.userId });
            break;
        }
        default:
            safeSend(ws, { type: 'error', message: `unknown_event: ${event.type}` });
    }
}
function safeSend(ws, event) {
    if (ws.readyState === WebSocket.OPEN) {
        try {
            ws.send(JSON.stringify(event));
        }
        catch { /* ignore */ }
    }
}
// ─── Typing Indicator Relay ────────────────────────────────────────────────────
async function relayTypingToPeers(senderId, threadId, isTyping) {
    try {
        const r = await pool.query(`SELECT user_low::text AS low, user_high::text AS high FROM dm_threads WHERE id = $1::uuid`, [threadId]);
        if (!r.rowCount)
            return;
        const row = r.rows[0];
        const peerId = row.low === senderId ? row.high : row.low;
        sendToUser(peerId, {
            type: isTyping ? 'typing' : 'stopped_typing',
            threadId,
            userId: senderId,
            isTyping,
        });
    }
    catch (e) {
        logger.warn('[ws] relayTyping error', { err: e instanceof Error ? e.message : String(e) });
    }
}
// ─── Read / Delivery Receipts ──────────────────────────────────────────────────
async function handleMarkRead(userId, threadId, messageId) {
    try {
        // Mark messages as read in the database
        if (messageId) {
            await pool.query(`UPDATE messages SET is_read = true WHERE id = $1::uuid AND thread_id = $2::uuid AND receiver_id = $3::uuid`, [messageId, threadId, userId]);
        }
        else {
            await pool.query(`UPDATE messages SET is_read = true WHERE thread_id = $1::uuid AND receiver_id = $2::uuid AND is_read = false`, [threadId, userId]);
        }
        // Notify the sender that messages were read
        const r = await pool.query(`SELECT user_low::text AS low, user_high::text AS high FROM dm_threads WHERE id = $1::uuid`, [threadId]);
        if (!r.rowCount)
            return;
        const row = r.rows[0];
        const peerId = row.low === userId ? row.high : row.low;
        sendToUser(peerId, {
            type: 'message_status',
            threadId,
            messageId: messageId || 'all',
            status: 'read',
        });
    }
    catch (e) {
        logger.warn('[ws] markRead error', { err: e instanceof Error ? e.message : String(e) });
    }
}
async function handleMarkDelivered(userId, threadId, messageId) {
    try {
        // Just relay the delivery status to the sender — actual DB update happens on read
        const r = await pool.query(`SELECT user_low::text AS low, user_high::text AS high FROM dm_threads WHERE id = $1::uuid`, [threadId]);
        if (!r.rowCount)
            return;
        const row = r.rows[0];
        const senderId = row.low === userId ? row.high : row.low;
        sendToUser(senderId, {
            type: 'message_status',
            threadId,
            messageId,
            status: 'delivered',
        });
    }
    catch (e) {
        logger.warn('[ws] markDelivered error', { err: e instanceof Error ? e.message : String(e) });
    }
}
// ─── Integration Helpers ───────────────────────────────────────────────────────
/**
 * Notify thread participants about a new message.
 * Called from messageService.sendTextMessage after successful DB insert.
 */
export function notifyNewMessage(senderId, receiverId, threadId, message) {
    // Send to recipient
    sendToUser(receiverId, {
        type: 'new_message',
        threadId,
        message,
    });
    // Notify sender that the thread was updated (for multi-device sync)
    sendToUser(senderId, {
        type: 'thread_updated',
        threadId,
    });
}
/**
 * Notify thread participants that a thread was updated (e.g., new message, read receipt).
 */
export function notifyThreadUpdated(userIds, threadId) {
    sendToUsers(userIds, { type: 'thread_updated', threadId });
}
//# sourceMappingURL=wsService.js.map