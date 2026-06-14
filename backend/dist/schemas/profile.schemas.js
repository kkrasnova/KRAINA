import { z } from 'zod';
const emptyToNull = (v) => (v === '' ? null : v);
const isoDateString = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((s) => {
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
});
export const patchProfileSchema = z.object({
    username: z
        .string()
        .min(3)
        .max(32)
        .regex(/^[a-zA-Z0-9_]+$/)
        .optional(),
    bio: z.preprocess(emptyToNull, z.union([z.string().max(300), z.null()]).optional()),
    language: z.string().min(2).max(10).optional(),
    is_public: z.boolean().optional(),
    display_name: z.preprocess(emptyToNull, z.union([z.string().max(80), z.null()]).optional()),
    birth_date: z.preprocess(emptyToNull, z.union([isoDateString, z.null()]).optional()),
    birth_date_public: z.boolean().optional(),
    location_label: z.preprocess(emptyToNull, z.union([z.string().max(200), z.null()]).optional()),
    saved_route_plans: z.array(z.record(z.string(), z.unknown())).max(40).optional(),
    firebase_uid: z.preprocess(emptyToNull, z.union([z.string().min(10).max(128).regex(/^[A-Za-z0-9_-]+$/), z.null()]).optional()),
});
//# sourceMappingURL=profile.schemas.js.map