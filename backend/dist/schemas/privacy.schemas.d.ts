import { z } from 'zod';
export declare const privacyUserRequestSchema: z.ZodObject<{
    request_type: z.ZodEnum<["export", "delete"]>;
    app_language: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    user_email: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    request_type: "delete" | "export";
    user_email?: string | null | undefined;
    app_language?: string | null | undefined;
}, {
    request_type: "delete" | "export";
    user_email?: string | null | undefined;
    app_language?: string | null | undefined;
}>;
//# sourceMappingURL=privacy.schemas.d.ts.map