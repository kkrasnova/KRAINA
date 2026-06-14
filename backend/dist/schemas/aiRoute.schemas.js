import { z } from 'zod';
export const aiSuggestRouteBodySchema = z.object({
    place: z.string().min(1).max(200),
    hours: z.coerce.number().min(1).max(12).default(4),
    transport: z.enum(['walk', 'car', 'bus', 'train']).default('walk'),
    interests: z
        .object({
        landmark: z.boolean().optional(),
        park: z.boolean().optional(),
        museum: z.boolean().optional(),
        cafe: z.boolean().optional(),
        architecture: z.boolean().optional(),
        secret: z.boolean().optional(),
    })
        .optional()
        .nullable(),
    budgetTier: z.enum(['free', 'budget', 'medium']).optional(),
    language: z.string().max(16).optional(),
    userOrigin: z
        .object({
        lat: z.number(),
        lng: z.number(),
    })
        .optional()
        .nullable(),
});
//# sourceMappingURL=aiRoute.schemas.js.map