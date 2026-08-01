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
        park?: boolean | undefined;
        museum?: boolean | undefined;
        landmark?: boolean | undefined;
        cafe?: boolean | undefined;
        architecture?: boolean | undefined;
        secret?: boolean | undefined;
    }, {
        park?: boolean | undefined;
        museum?: boolean | undefined;
        landmark?: boolean | undefined;
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
        park?: boolean | undefined;
        museum?: boolean | undefined;
        landmark?: boolean | undefined;
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
        park?: boolean | undefined;
        museum?: boolean | undefined;
        landmark?: boolean | undefined;
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
export declare const visionLandmarkBodySchema: z.ZodObject<{
    base64: z.ZodString;
}, "strip", z.ZodTypeAny, {
    base64: string;
}, {
    base64: string;
}>;
export declare const landmarkTtsBodySchema: z.ZodObject<{
    text: z.ZodString;
    language: z.ZodDefault<z.ZodEnum<["uk", "en"]>>;
}, "strip", z.ZodTypeAny, {
    language: "uk" | "en";
    text: string;
}, {
    text: string;
    language?: "uk" | "en" | undefined;
}>;
export declare const walkNarrateBodySchema: z.ZodObject<{
    title: z.ZodDefault<z.ZodString>;
    extract: z.ZodString;
    street: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    city: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    language: z.ZodDefault<z.ZodEnum<["uk", "en"]>>;
}, "strip", z.ZodTypeAny, {
    title: string;
    city: string;
    language: "uk" | "en";
    street: string;
    extract: string;
}, {
    extract: string;
    title?: string | undefined;
    city?: string | undefined;
    language?: "uk" | "en" | undefined;
    street?: string | undefined;
}>;
//# sourceMappingURL=aiRoute.schemas.d.ts.map