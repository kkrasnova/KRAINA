/**
 * Chat message push notification service.
 *
 * Sends push notifications via Expo Push API when a new chat message arrives.
 * The recipient must have registered an Expo push token.
 *
 * Expo Push API: https://docs.expo.dev/push-notifications/sending-notifications/
 */
/**
 * Send a push notification for a new chat message.
 * Fire-and-forget: logs errors but never throws.
 */
export declare function sendChatMessagePush(receiverId: string, payload: {
    threadId: string;
    senderName: string;
    senderId: string;
    content: string;
}): Promise<void>;
/**
 * Send a push notification when someone likes a post.
 * Fire-and-forget: logs errors but never throws.
 */
export declare function sendPostLikePush(postAuthorId: string, payload: {
    likerName: string;
    likerId: string;
    postId: string;
}): Promise<void>;
/**
 * Send a push notification when someone comments on a post.
 * Fire-and-forget: logs errors but never throws.
 */
export declare function sendPostCommentPush(postAuthorId: string, payload: {
    commenterName: string;
    commenterId: string;
    postId: string;
    commentId: string;
    commentPreview: string;
}): Promise<void>;
/**
 * Send a push notification when someone likes a comment.
 * Fire-and-forget: logs errors but never throws.
 */
export declare function sendCommentLikePush(commentAuthorId: string, payload: {
    likerName: string;
    likerId: string;
    commentId: string;
    postId: string;
}): Promise<void>;
/**
 * Register or update an Expo push token for the current user.
 */
export declare function registerExpoPushToken(userId: string, expoToken: string): Promise<void>;
/**
 * Remove the Expo push token for a user (on logout).
 */
export declare function removeExpoPushToken(userId: string): Promise<void>;
//# sourceMappingURL=chatPushService.d.ts.map