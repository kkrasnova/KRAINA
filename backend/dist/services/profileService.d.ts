import { listActiveStoriesForUser, listUserPostsForViewer } from './feedService.js';
export interface ProfileDTO {
    id: string;
    user_id: string;
    username: string;
    avatar_url: string | null;
    bio: string | null;
    language: string;
    display_name: string | null;
    birth_date: string | null;
    birth_date_public: boolean;
    location_label: string | null;
    xp_points: number;
    level: number;
    is_public: boolean;
    locations_visited: number;
    routes_created: number;
    followers_count: number;
    following_count: number;
    created_at: string;
    updated_at: string;
    saved_route_plans: unknown[];
}
export interface SubscriptionDTO {
    plan_type: string;
    billing_period: string | null;
    is_active: boolean;
    expires_at: string | null;
    payment_provider: string | null;
}
export interface UsageLimitsDTO {
    period_month: string;
    ar_scans_used: number;
    routes_created: number;
    locations_viewed: number;
}
export interface PublicProfileDTO {
    username: string;
    avatar_url: string | null;
    bio: string | null;
    language: string;
    display_name: string | null;
    location_label: string | null;
    birth_date: string | null;
    level: number;
    xp_points: number;
    locations_visited: number;
    routes_created: number;
    followers_count: number;
    following_count: number;
    user_id?: string;
    is_following?: boolean | null;
    is_public?: boolean;
}
export interface PublicProfilePersonDTO {
    user_id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
}
export interface PublicProfileFullDTO {
    profile: PublicProfileDTO;
    followers: PublicProfilePersonDTO[];
    following: PublicProfilePersonDTO[];
    friends: PublicProfilePersonDTO[];
    posts: Awaited<ReturnType<typeof listUserPostsForViewer>>;
    stories: Awaited<ReturnType<typeof listActiveStoriesForUser>>;
}
export interface ProfileSearchHitDTO {
    user_id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    bio: string | null;
    is_following: boolean;
    is_public?: boolean;
}
export declare function searchProfilesForViewer(viewerId: string | null, q: string, limit?: number): Promise<ProfileSearchHitDTO[]>;
export declare function getProfileMe(userId: string): Promise<{
    profile: ProfileDTO;
    subscription: SubscriptionDTO;
    usage: UsageLimitsDTO;
}>;
export declare function patchProfileMe(userId: string, patch: {
    username?: string;
    bio?: string | null;
    language?: string;
    is_public?: boolean;
    display_name?: string | null;
    birth_date?: string | null;
    birth_date_public?: boolean;
    location_label?: string | null;
    saved_route_plans?: unknown[];
    firebase_uid?: string | null;
}): Promise<ProfileDTO>;
export declare function saveAvatar(userId: string, file: {
    buffer: Buffer;
    mimetype: string;
}): Promise<string>;
export declare function clearAvatar(userId: string): Promise<void>;
export declare function getPublicProfileByUsername(username: string, viewerUserId: string | null): Promise<PublicProfileDTO>;
export declare function getPublicProfileFullByUsername(username: string, viewerUserId: string | null, limit?: number): Promise<PublicProfileFullDTO>;
//# sourceMappingURL=profileService.d.ts.map