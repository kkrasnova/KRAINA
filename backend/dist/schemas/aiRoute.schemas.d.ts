import { z } from 'zod';
export declare const aiSuggestRouteBodySchema: z.ZodObject<{
    place: z.ZodString;
    hours: z.ZodDefault<z.ZodNumber>;
    transport: z.ZodDefault<z.ZodEnum<["walk", "car", "bus", "train"]>>;
    interests: z.ZodNullable<z.ZodOptional<z.ZodObject<{
        landmark: z.ZodOptional<z.ZodBoolean>;
        park: z.ZodOptional<z.ZodBoolean>;
        museum: z.ZodOptional<z.ZodBoolean>;
        cafe: z.ZodOptional<z.ZodBoolean>;
        architecture: z.ZodOptional<z.ZodBoolean>;
        secret: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        landmark?: boolean | undefined;
        park?: boolean | undefined;
        museum?: boolean | undefined;
        cafe?: boolean | undefined;
        architecture?: boolean | undefined;
        secret?: boolean | undefined;
    }, {
        landmark?: boolean | undefined;
        park?: boolean | undefined;
        museum?: boolean | undefined;
        cafe?: boolean | undefined;
        architecture?: boolean | undefined;
        secret?: boolean | undefined;
    }>>>;
    budgetTier: z.ZodOptional<z.ZodEnum<["free", "budget", "medium"]>>;
    language: z.ZodOptional<z.ZodString>;
    userOrigin: z.ZodNullable<z.ZodOptional<z.ZodObject<{
        lat: z.ZodNumber;
        lng: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        lat: number;
        lng: number;
    }, {
        lat: number;
        lng: number;
    }>>>;
}, "strip", z.ZodTypeAny, {
    transport: "walk" | "car" | "bus" | "train";
    hours: number;
    place: string;
    language?: string | undefined;
    interests?: {
        landmark?: boolean | undefined;
        park?: boolean | undefined;
        museum?: boolean | undefined;
        cafe?: boolean | undefined;
        architecture?: boolean | undefined;
        secret?: boolean | undefined;
    } | null | undefined;
    budgetTier?: "medium" | "free" | "budget" | undefined;
    userOrigin?: {
        lat: number;
        lng: number;
    } | null | undefined;
}, {
    place: string;
    transport?: "walk" | "car" | "bus" | "train" | undefined;
    hours?: number | undefined;
    language?: string | undefined;
    interests?: {
        landmark?: boolean | undefined;
        park?: boolean | undefined;
        museum?: boolean | undefined;
        cafe?: boolean | undefined;
        architecture?: boolean | undefined;
        secret?: boolean | undefined;
    } | null | undefined;
    budgetTier?: "medium" | "free" | "budget" | undefined;
    userOrigin?: {
        lat: number;
        lng: number;
    } | null | undefined;
}>;
//# sourceMappingURL=aiRoute.schemas.d.ts.map