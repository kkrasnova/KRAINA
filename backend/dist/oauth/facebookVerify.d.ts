export type FacebookProfile = {
    facebookId: string;
    email: string;
    name: string;
};
export declare function verifyFacebookAccessToken(accessToken: string): Promise<FacebookProfile>;
//# sourceMappingURL=facebookVerify.d.ts.map