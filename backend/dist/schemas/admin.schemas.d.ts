import { z } from 'zod';
export declare const adminGrantSubscriptionSchema: z.ZodEffects<z.ZodObject<{
    email: z.ZodString;
    plan_type: z.ZodEnum<["free", "explorer", "pro", "family"]>;
    duration_days: z.ZodDefault<z.ZodNumber>;
    lifetime: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    email: string;
    plan_type: "free" | "explorer" | "pro" | "family";
    duration_days: number;
    lifetime: boolean;
}, {
    email: string;
    plan_type: "free" | "explorer" | "pro" | "family";
    duration_days?: number | undefined;
    lifetime?: boolean | undefined;
}>, {
    email: string;
    plan_type: "free" | "explorer" | "pro" | "family";
    duration_days: number;
    lifetime: boolean;
}, {
    email: string;
    plan_type: "free" | "explorer" | "pro" | "family";
    duration_days?: number | undefined;
    lifetime?: boolean | undefined;
}>;
//# sourceMappingURL=admin.schemas.d.ts.map