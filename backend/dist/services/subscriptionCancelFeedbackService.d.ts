export interface CancelFeedbackRow {
    id: string;
    user_id: string | null;
    user_email: string | null;
    previous_plan: string;
    reason_codes: string[];
    comment: string | null;
    app_language: string | null;
    created_at: string;
}
export declare function recordCancelFeedbackAndDeactivateSubs(params: {
    userId: string;
    userEmail: string | null;
    previousPlan: 'explorer' | 'pro' | 'family';
    reasonCodes: string[];
    comment: string | null;
    appLanguage: string | null;
}): Promise<void>;
export declare function listCancelFeedbackForAdmin(limit?: number): Promise<CancelFeedbackRow[]>;
//# sourceMappingURL=subscriptionCancelFeedbackService.d.ts.map