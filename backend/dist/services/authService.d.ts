export interface UserDTO {
    id: string;
    email: string;
    role: string;
    status: string;
}
export interface AuthTokens {
    user: UserDTO;
    access_token: string;
    refresh_token: string;
}
export declare function registerUser(input: {
    email: string;
    password: string;
    username: string;
}): Promise<AuthTokens>;
export declare function loginWithPassword(emailRaw: string, password: string): Promise<AuthTokens>;
export declare function loginOrRegisterGoogle(idToken: string): Promise<AuthTokens>;
export declare function loginOrRegisterApple(identityToken: string, displayName?: string): Promise<AuthTokens>;
export declare function rotateRefreshToken(rawRefresh: string): Promise<{
    access_token: string;
    refresh_token: string;
    user_id: string;
}>;
export declare function logoutAllRefreshTokens(userId: string): Promise<void>;
export declare function requestPasswordReset(emailRaw: string): Promise<void>;
export declare function resetPasswordWithToken(rawToken: string, newPassword: string): Promise<void>;
//# sourceMappingURL=authService.d.ts.map