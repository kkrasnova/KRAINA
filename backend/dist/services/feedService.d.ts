export declare function saveFeedMediaFile(file: {
    buffer: Buffer;
    mimetype: string;
    originalname?: string;
}): Promise<{
    url: string;
    media_kind: 'image' | 'video' | 'audio';
}>;
export declare function createPost(userId: string, body: {
    media_urls: string[];
    content_text?: string | null;
    visibility: 'public' | 'followers' | 'private';
    place_label?: string | null;
    lat?: number | null;
    lng?: number | null;
    route_plan?: Record<string, unknown> | null;
}): Promise<any>;
export declare function listMyPosts(userId: string, limit?: number): Promise<{
    id: string;
    user_id: string;
    username: string;
    avatar_url: string | null;
    content_text: string;
    media_urls: string[];
    visibility: string;
    place_label: string;
    lat: number | null;
    lng: number | null;
    route_plan: Record<string, unknown> | null;
    likes_count: number;
    comments_count: number;
    reposts_count: number;
    liked_by_viewer: boolean;
    reposted_by_viewer: boolean;
    created_at: string;
    archived_at: string | null;
}[]>;
export declare function listMyArchivedPosts(userId: string, limit?: number): Promise<{
    id: string;
    user_id: string;
    username: string;
    avatar_url: string | null;
    content_text: string;
    media_urls: string[];
    visibility: string;
    place_label: string;
    lat: number | null;
    lng: number | null;
    route_plan: Record<string, unknown> | null;
    likes_count: number;
    comments_count: number;
    reposts_count: number;
    liked_by_viewer: boolean;
    reposted_by_viewer: boolean;
    created_at: string;
    archived_at: string | null;
}[]>;
export declare function setPostArchived(userId: string, postId: string, archived: boolean): Promise<void>;
export declare function updatePostByAuthor(userId: string, postId: string, patch: {
    content_text?: string | null;
    place_label?: string | null;
    lat?: number | null;
    lng?: number | null;
    route_plan?: Record<string, unknown> | null;
    visibility?: 'public' | 'followers' | 'private';
}): Promise<void>;
export declare function deletePostByAuthor(userId: string, postId: string): Promise<void>;
export declare function listWorldPosts(_viewerId: string | null, limit?: number): Promise<{
    id: string;
    user_id: string;
    username: string;
    avatar_url: string | null;
    content_text: string;
    media_urls: string[];
    visibility: string;
    place_label: string;
    lat: number | null;
    lng: number | null;
    route_plan: Record<string, unknown> | null;
    likes_count: number;
    comments_count: number;
    reposts_count: number;
    liked_by_viewer: boolean;
    reposted_by_viewer: boolean;
    created_at: string;
    archived_at: string | null;
}[]>;
export declare function listFriendsPosts(viewerId: string, limit?: number): Promise<{
    id: string;
    user_id: string;
    username: string;
    avatar_url: string | null;
    content_text: string;
    media_urls: string[];
    visibility: string;
    place_label: string;
    lat: number | null;
    lng: number | null;
    route_plan: Record<string, unknown> | null;
    likes_count: number;
    comments_count: number;
    reposts_count: number;
    liked_by_viewer: boolean;
    reposted_by_viewer: boolean;
    created_at: string;
    archived_at: string | null;
}[]>;
export declare function listUserPostsForViewer(viewerId: string, targetUsername: string, limit?: number): Promise<{
    id: string;
    user_id: string;
    username: string;
    avatar_url: string | null;
    content_text: string;
    media_urls: string[];
    visibility: string;
    place_label: string;
    lat: number | null;
    lng: number | null;
    route_plan: Record<string, unknown> | null;
    likes_count: number;
    comments_count: number;
    reposts_count: number;
    liked_by_viewer: boolean;
    reposted_by_viewer: boolean;
    created_at: string;
    archived_at: string | null;
}[]>;
export declare function togglePostLike(postId: string, viewerId: string): Promise<{
    liked: boolean;
    likes_count: number;
}>;
export declare function listPostComments(postId: string, viewerId: string, limit?: number): Promise<{
    id: string;
    post_id: string;
    user_id: string;
    parent_comment_id: string | null;
    username: string;
    avatar_url: string | null;
    content: string;
    likes_count: number;
    liked_by_viewer: boolean;
    deleted: boolean;
    created_at: string;
}[]>;
export declare function addPostComment(postId: string, viewerId: string, content: string, parentCommentId?: string | null): Promise<{
    id: string;
    post_id: string;
    user_id: string;
    parent_comment_id: string | null;
    username: string;
    avatar_url: string | null;
    content: string;
    likes_count: number;
    liked_by_viewer: boolean;
    deleted: boolean;
    created_at: string;
}>;
export declare function createStory(userId: string, media_url: string, media_kind: 'image' | 'video' | 'audio', caption: string): Promise<any>;
export declare function listActiveStoriesTray(viewerId: string): Promise<{
    id: string;
    user_id: string;
    media_url: string;
    media_kind: "image" | "video";
    caption: string;
    created_at: string;
    expires_at: string;
    username: string;
    avatar_url: string | null;
    display_name: string | null;
    view_count: number;
    seen_by_viewer: boolean;
    story_count: number;
    has_unviewed: boolean;
}[]>;
export declare function listMyArchivedStories(userId: string, limit?: number): Promise<{
    id: string;
    user_id: string;
    media_url: string;
    media_kind: "image" | "video";
    caption: string;
    created_at: string;
    expires_at: string;
    view_count: number;
    expired: boolean;
}[]>;
export declare function listActiveStoriesForUser(authorId: string, viewerId: string): Promise<{
    id: string;
    user_id: string;
    media_url: string;
    media_kind: "image" | "video";
    caption: string;
    created_at: string;
    expires_at: string;
    view_count: number;
    seen_by_viewer: boolean;
    liked_by_viewer: boolean;
    username: string;
    avatar_url: string | null;
    display_name: string | null;
}[]>;
export declare function recordStoryView(storyId: string, viewerId: string): Promise<{
    ok: boolean;
}>;
export declare function getStoryViewers(storyId: string, authorId: string): Promise<{
    viewer_id: string;
    username: string;
    avatar_url: string | null;
    viewed_at: string;
}[]>;
export declare function getStoryLikers(storyId: string, authorId: string): Promise<{
    user_id: string;
    username: string;
    avatar_url: string | null;
    liked_at: string;
}[]>;
export declare function deleteStoryAsAuthor(storyId: string, authorId: string): Promise<void>;
export declare function toggleStoryLike(storyId: string, viewerId: string): Promise<{
    liked: boolean;
}>;
export declare function toggleCommentLike(commentId: string, viewerId: string): Promise<{
    liked: boolean;
    likes_count: number;
}>;
export declare function deletePostCommentByAuthor(commentId: string, viewerId: string): Promise<void>;
export declare function togglePostRepost(postId: string, viewerId: string, caption?: string): Promise<{
    reposted: boolean;
    reposts_count: number;
}>;
//# sourceMappingURL=feedService.d.ts.map