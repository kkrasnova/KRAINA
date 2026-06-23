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
import { type Server as HttpServer } from 'node:http';
import { WebSocketServer } from 'ws';
/** Events sent FROM server TO client. */
export type ServerWsEvent = {
    type: 'new_message';
    threadId: string;
    message: Record<string, unknown>;
} | {
    type: 'message_status';
    threadId: string;
    messageId: string;
    status: 'delivered' | 'read';
} | {
    type: 'typing';
    threadId: string;
    userId: string;
    isTyping: boolean;
} | {
    type: 'stopped_typing';
    threadId: string;
    userId: string;
} | {
    type: 'thread_updated';
    threadId: string;
} | {
    type: 'thread_deleted';
    threadId: string;
} | {
    type: 'connected';
    userId: string;
} | {
    type: 'error';
    message: string;
};
/**
 * Initialise the WebSocket server on the same HTTP server as Express.
 * Call this once during server startup (in index.ts).
 */
export declare function initWsServer(server: HttpServer): WebSocketServer;
/**
 * Send a real-time event to a specific user (all their connected devices).
 * Returns the number of devices the event was sent to.
 */
export declare function sendToUser(userId: string, event: ServerWsEvent): number;
/**
 * Send a real-time event to multiple users at once.
 */
export declare function sendToUsers(userIds: string[], event: ServerWsEvent): number;
/**
 * Check if a user has any active WebSocket connections.
 */
export declare function isUserOnline(userId: string): boolean;
/**
 * Get the number of active connections for a user.
 */
export declare function getUserDeviceCount(userId: string): number;
/**
 * Get the total number of connected users.
 */
export declare function getConnectedUserCount(): number;
/**
 * Gracefully close all WebSocket connections and shut down the server.
 */
export declare function closeWsServer(): Promise<void>;
/**
 * Notify thread participants about a new message.
 * Called from messageService.sendTextMessage after successful DB insert.
 */
export declare function notifyNewMessage(senderId: string, receiverId: string, threadId: string, message: Record<string, unknown>): void;
/**
 * Notify thread participants that a thread was updated (e.g., new message, read receipt).
 */
export declare function notifyThreadUpdated(userIds: string[], threadId: string): void;
//# sourceMappingURL=wsService.d.ts.map