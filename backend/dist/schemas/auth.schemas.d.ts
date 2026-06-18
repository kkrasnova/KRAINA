import { z } from 'zod';
export declare const registerSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
    username: z.ZodOptional<z.ZodString>;
    display_name: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
    username?: string | undefined;
    display_name?: string | undefined;
}, {
    email: string;
    password: string;
    username?: string | undefined;
    display_name?: string | undefined;
}>;
export declare const loginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export declare const googleSchema: z.ZodObject<{
    id_token: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id_token: string;
}, {
    id_token: string;
}>;
export declare const appleSchema: z.ZodObject<{
    identity_token: z.ZodString;
    user: z.ZodOptional<z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name?: string | undefined;
    }, {
        name?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    identity_token: string;
    user?: {
        name?: string | undefined;
    } | undefined;
}, {
    identity_token: string;
    user?: {
        name?: string | undefined;
    } | undefined;
}>;
export declare const refreshSchema: z.ZodObject<{
    refresh_token: z.ZodString;
}, "strip", z.ZodTypeAny, {
    refresh_token: string;
}, {
    refresh_token: string;
}>;
export declare const forgotPasswordSchema: z.ZodObject<{
    email: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
}, {
    email: string;
}>;
export declare const resetPasswordSchema: z.ZodObject<{
    token: z.ZodString;
    new_password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    token: string;
    new_password: string;
}, {
    token: string;
    new_password: string;
}>;
export declare const emailExistsSchema: z.ZodObject<{
    email: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
}, {
    email: string;
}>;
export declare const appPasswordResetOtpSchema: z.ZodObject<{
    email: z.ZodString;
    code: z.ZodString;
    expires_at: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    email: string;
    code: string;
    expires_at: number;
}, {
    email: string;
    code: string;
    expires_at: number;
}>;
export declare const appPasswordResetConfirmSchema: z.ZodObject<{
    email: z.ZodString;
    code: z.ZodString;
    new_password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    code: string;
    new_password: string;
}, {
    email: string;
    code: string;
    new_password: string;
}>;
//# sourceMappingURL=auth.schemas.d.ts.map