export type AdminUserSearchRow = {
    user_id: string;
    email: string;
    username: string | null;
    plan_type: string | null;
    expires_at: string | null;
    payment_provider: string | null;
};
export declare function searchUsersByEmailFragment(q: string, limit?: number): Promise<AdminUserSearchRow[]>;
//# sourceMappingURL=adminUsersSearchService.d.ts.map