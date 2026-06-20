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
    username?: string;
    display_name?: string;
}): Promise<AuthTokens>;
export declare function loginWithPassword(emailRaw: string, password: string): Promise<AuthTokens>;
export declare function loginOrRegisterGoogle(idToken: string): Promise<AuthTokens>;
export declare function loginOrRegisterFacebook(accessToken: string): Promise<AuthTokens>;
export declare function loginOrRegisterApple(identityToken: string, displayName?: string): Promise<AuthTokens>;
/** Вхід/реєстрація за Firebase ID token (email/Google/Apple через Firebase Auth на клієнті). */
export declare function loginOrRegisterFirebaseIdToken(idToken: string): Promise<AuthTokens>;
export declare function rotateRefreshToken(rawRefresh: string): Promise<{
    access_token: string;
    refresh_token: string;
    user_id: string;
}>;
export declare function logoutAllRefreshTokens(userId: string): Promise<void>;
export declare function requestPasswordReset(emailRaw: string): Promise<void>;
export declare function userEmailExists(emailRaw: string): Promise<boolean>;
/** OTP з додатку (Resend) — той самий hash, що в app/db.js otpHashForCode. */
export declare function storeAppPasswordResetOtp(emailRaw: string, code: string, expiresAtMs: number): Promise<void>;
export declare function resetPasswordWithAppOtp(emailRaw: string, code: string, newPassword: string): Promise<void>;
export declare function resetPasswordWithToken(rawToken: string, newPassword: string): Promise<void>;
//# sourceMappingURL=authService.d.ts.map