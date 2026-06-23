export declare function resolveUserIdByUsername(username: string): Promise<string | null>;
export declare function isMutualFollow(a: string, b: string): Promise<boolean>;
export declare function insertFollowEdgeByIds(followerId: string, followingId: string): Promise<{
    pending: boolean;
}>;
export declare function deleteFollowEdgeByIds(followerId: string, followingId: string): Promise<void>;
export declare function followByUsername(followerId: string, targetUsername: string): Promise<{
    pending: boolean;
    user_id: string;
}>;
export declare function followByUserId(followerId: string, targetUserId: string): Promise<{
    pending: boolean;
    user_id: string;
}>;
export declare function unfollowByUsername(followerId: string, targetUsername: string): Promise<void>;
export declare function unfollowByUserId(followerId: string, targetUserId: string): Promise<void>;
export interface MutualFriendRow {
    user_id: string;
    username: string;
    avatar_url: string | null;
}
export interface SocialSearchRow {
    user_id: string;
    firebase_uid: string | null;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    bio: string | null;
    is_private: boolean;
    followers_count: number;
    following_count: number;
    is_following: boolean;
    pending_follow_outgoing: boolean;
}
export interface SocialConnectionRow {
    user_id: string;
    firebase_uid: string | null;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    bio: string | null;
    is_private: boolean;
    followers_count: number;
    following_count: number;
    is_following: boolean;
    pending_follow_outgoing: boolean;
}
export interface FriendRequestRow {
    user_id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    requested_at: string;
}
export declare function listIncomingRequests(userId: string): Promise<FriendRequestRow[]>;
export declare function listOutgoingRequests(userId: string): Promise<FriendRequestRow[]>;
export declare function acceptFriendRequest(meId: string, requesterId: string): Promise<void>;
export declare function declineFriendRequest(meId: string, requesterId: string): Promise<void>;
export declare function cancelOutgoingRequest(meId: string, targetUserId: string): Promise<void>;
export declare function acceptFirestoreFollowIntoPostgres(followeeId: string, followerParam: string): Promise<void>;
export declare function listMutualFriends(userId: string): Promise<MutualFriendRow[]>;
export declare function searchSocialProfiles(meId: string | null, q: string, limit?: number): Promise<SocialSearchRow[]>;
export declare function listSocialConnectionsByTarget(params: {
    meId: string | null;
    targetUsername?: string | null;
    targetUserId?: string | null;
    kind?: 'followers' | 'following' | 'friends';
    limit?: number;
}): Promise<SocialConnectionRow[]>;
export declare function getRelationStateByTarget(params: {
    meId: string | null;
    targetUsername?: string | null;
    targetUserId?: string | null;
}): Promise<{
    is_following: boolean;
    pending_follow_outgoing: boolean;
    is_followed_by_peer: boolean;
}>;
//# sourceMappingURL=socialService.d.ts.map