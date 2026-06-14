export declare function grantSubscriptionByEmail(params: {
    email: string;
    plan_type: 'free' | 'explorer' | 'pro' | 'family';
    duration_days: number;
    lifetime?: boolean;
    adminId: string;
}): Promise<{
    user_id: string;
    plan_type: string;
    expires_at: string | null;
}>;
//# sourceMappingURL=adminSubscriptionService.d.ts.map