export declare function hashRefreshToken(raw: string): string;
export declare function randomOpaqueToken(): string;
export interface AccessPayload {
    sub: string;
    email: string;
    role: string;
}
export declare function signAccessToken(userId: string, email: string, role: string): string;
export declare function verifyAccessToken(token: string): AccessPayload;
//# sourceMappingURL=tokens.d.ts.map