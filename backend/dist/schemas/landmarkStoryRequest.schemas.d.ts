import { z } from 'zod';
export declare const landmarkStoryRequestSchema: z.ZodObject<{
    request_ref: z.ZodString;
    language: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    user_id: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    user_email: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    scan_latitude: z.ZodNullable<z.ZodOptional<z.ZodNumber>>;
    scan_longitude: z.ZodNullable<z.ZodOptional<z.ZodNumber>>;
    attached_latitude: z.ZodNullable<z.ZodOptional<z.ZodNumber>>;
    attached_longitude: z.ZodNullable<z.ZodOptional<z.ZodNumber>>;
    vision_hint_title: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    has_photo: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    request_ref: string;
    user_id?: string | null | undefined;
    language?: string | null | undefined;
    user_email?: string | null | undefined;
    scan_latitude?: number | null | undefined;
    scan_longitude?: number | null | undefined;
    attached_latitude?: number | null | undefined;
    attached_longitude?: number | null | undefined;
    vision_hint_title?: string | null | undefined;
    has_photo?: boolean | undefined;
}, {
    request_ref: string;
    user_id?: string | null | undefined;
    language?: string | null | undefined;
    user_email?: string | null | undefined;
    scan_latitude?: number | null | undefined;
    scan_longitude?: number | null | undefined;
    attached_latitude?: number | null | undefined;
    attached_longitude?: number | null | undefined;
    vision_hint_title?: string | null | undefined;
    has_photo?: boolean | undefined;
}>;
//# sourceMappingURL=landmarkStoryRequest.schemas.d.ts.map