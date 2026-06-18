export type IncomingFollowRequestVerify = 'verified' | 'missing' | 'no_admin';
export declare function verifyIncomingFirestoreFollowRequest(followerId: string, followeeId: string): Promise<IncomingFollowRequestVerify>;
//# sourceMappingURL=firestoreAdminService.d.ts.map