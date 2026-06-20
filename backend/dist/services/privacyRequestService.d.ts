export type PrivacyRequestType = 'export' | 'delete';
export declare function recordPrivacyUserRequest(params: {
    userId: string;
    userEmail: string | null;
    requestType: PrivacyRequestType;
    appLanguage: string | null;
}): Promise<void>;
//# sourceMappingURL=privacyRequestService.d.ts.map