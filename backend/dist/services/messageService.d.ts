export declare function getOrCreateThread(meId: string, peerId: string): Promise<{
    id: string;
}>;
export declare function openThreadByUsername(meId: string, peerUsername: string): Promise<ThreadMetaDTO>;
export declare function openThreadByUserId(meId: string, peerId: string): Promise<ThreadMetaDTO>;
export interface ThreadMetaDTO {
    id: string;
    peer_user_id: string;
    peer_username: string;
    peer_display_name: string | null;
    peer_avatar_url: string | null;
    pending_for_me: boolean;
    pending_for_peer: boolean;
}
export declare function getThreadMetaForUser(threadId: string, meId: string): Promise<ThreadMetaDTO>;
export type MessageFolder = 'inbox' | 'requests';
export interface ThreadListItemDTO extends ThreadMetaDTO {
    last_content: string | null;
    last_sent_at: string | null;
    unread_count: number;
    folder: MessageFolder;
}
export declare function listThreads(meId: string, folder: MessageFolder, limit?: number): Promise<ThreadListItemDTO[]>;
export interface MessageRowDTO {
    id: string;
    sender_id: string;
    receiver_id: string;
    content: string;
    sent_at: string;
    is_read: boolean;
    from_me: boolean;
}
export declare function listMessages(threadId: string, meId: string, limit: number): Promise<MessageRowDTO[]>;
export declare function markThreadRead(threadId: string, meId: string): Promise<void>;
export declare function sendTextMessage(threadId: string, senderId: string, content: string): Promise<MessageRowDTO>;
export declare function acceptThread(threadId: string, meId: string): Promise<ThreadMetaDTO>;
export declare function clearThreadMessages(threadId: string, meId: string): Promise<void>;
export declare function removeThread(threadId: string, meId: string): Promise<void>;
//# sourceMappingURL=messageService.d.ts.map