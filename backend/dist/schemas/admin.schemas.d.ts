import { z } from 'zod';
export declare const adminLocationAiEnrichSchema: z.ZodObject<{
    country: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    city: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    items: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        address: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        address: string;
    }, {
        name: string;
        address?: string | undefined;
    }>, "many">;
    rehostImages: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    city: string;
    country: string;
    items: {
        name: string;
        address: string;
    }[];
    rehostImages: boolean;
}, {
    items: {
        name: string;
        address?: string | undefined;
    }[];
    city?: string | undefined;
    country?: string | undefined;
    rehostImages?: boolean | undefined;
}>;
export declare const adminLocationAiEnrichJobSchema: z.ZodObject<{
    country: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    city: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    items: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        address: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        address: string;
    }, {
        name: string;
        address?: string | undefined;
    }>, "many">;
    rehostImages: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    autoPublish: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    mergeTarget: z.ZodOptional<z.ZodObject<{
        countryId: z.ZodString;
        countryUk: z.ZodDefault<z.ZodOptional<z.ZodString>>;
        countryEn: z.ZodDefault<z.ZodOptional<z.ZodString>>;
        regionId: z.ZodDefault<z.ZodOptional<z.ZodString>>;
        cityUk: z.ZodDefault<z.ZodOptional<z.ZodString>>;
        cityEn: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        countryId: string;
        countryUk: string;
        countryEn: string;
        regionId: string;
        cityUk: string;
        cityEn: string;
    }, {
        countryId: string;
        countryUk?: string | undefined;
        countryEn?: string | undefined;
        regionId?: string | undefined;
        cityUk?: string | undefined;
        cityEn?: string | undefined;
    }>>;
    snapshot: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    /** Per import item index: how to handle a similar existing landmark. */
    duplicatePolicies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodEnum<["skip", "replace", "merge", "keep_both"]>>>;
}, "strip", z.ZodTypeAny, {
    city: string;
    country: string;
    items: {
        name: string;
        address: string;
    }[];
    rehostImages: boolean;
    autoPublish: boolean;
    mergeTarget?: {
        countryId: string;
        countryUk: string;
        countryEn: string;
        regionId: string;
        cityUk: string;
        cityEn: string;
    } | undefined;
    snapshot?: Record<string, any> | undefined;
    duplicatePolicies?: Record<string, "replace" | "skip" | "merge" | "keep_both"> | undefined;
}, {
    items: {
        name: string;
        address?: string | undefined;
    }[];
    city?: string | undefined;
    country?: string | undefined;
    rehostImages?: boolean | undefined;
    autoPublish?: boolean | undefined;
    mergeTarget?: {
        countryId: string;
        countryUk?: string | undefined;
        countryEn?: string | undefined;
        regionId?: string | undefined;
        cityUk?: string | undefined;
        cityEn?: string | undefined;
    } | undefined;
    snapshot?: Record<string, any> | undefined;
    duplicatePolicies?: Record<string, "replace" | "skip" | "merge" | "keep_both"> | undefined;
}>;
export declare const adminAiDuplicateDecisionSchema: z.ZodObject<{
    action: z.ZodEnum<["skip", "replace", "merge", "keep_both"]>;
}, "strip", z.ZodTypeAny, {
    action: "replace" | "skip" | "merge" | "keep_both";
}, {
    action: "replace" | "skip" | "merge" | "keep_both";
}>;
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
export declare const adminGrantAdminSchema: z.ZodObject<{
    email: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
}, {
    email: string;
}>;
export declare const adminRevokeAdminSchema: z.ZodObject<{
    email: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
}, {
    email: string;
}>;
//# sourceMappingURL=admin.schemas.d.ts.map