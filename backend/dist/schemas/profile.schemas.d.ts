import { z } from 'zod';
export declare const patchProfileSchema: z.ZodObject<{
    username: z.ZodOptional<z.ZodString>;
    bio: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>, string | null | undefined, unknown>;
    language: z.ZodOptional<z.ZodString>;
    is_public: z.ZodOptional<z.ZodBoolean>;
    display_name: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>, string | null | undefined, unknown>;
    birth_date: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodEffects<z.ZodString, string, string>, z.ZodNull]>>, string | null | undefined, unknown>;
    birth_date_public: z.ZodOptional<z.ZodBoolean>;
    location_label: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>, string | null | undefined, unknown>;
    saved_route_plans: z.ZodOptional<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">>;
    firebase_uid: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNull]>>, string | null | undefined, unknown>;
}, "strip", z.ZodTypeAny, {
    is_public?: boolean | undefined;
    username?: string | undefined;
    bio?: string | null | undefined;
    language?: string | undefined;
    display_name?: string | null | undefined;
    birth_date?: string | null | undefined;
    birth_date_public?: boolean | undefined;
    location_label?: string | null | undefined;
    saved_route_plans?: Record<string, unknown>[] | undefined;
    firebase_uid?: string | null | undefined;
}, {
    is_public?: boolean | undefined;
    username?: string | undefined;
    bio?: unknown;
    language?: string | undefined;
    display_name?: unknown;
    birth_date?: unknown;
    birth_date_public?: boolean | undefined;
    location_label?: unknown;
    saved_route_plans?: Record<string, unknown>[] | undefined;
    firebase_uid?: unknown;
}>;
//# sourceMappingURL=profile.schemas.d.ts.map