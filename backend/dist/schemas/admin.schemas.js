import { z } from 'zod';
export const adminLocationAiEnrichSchema = z.object({
    country: z.string().trim().max(120).optional().default(''),
    city: z.string().trim().max(120).optional().default(''),
    items: z
        .array(z.object({
        name: z.string().trim().min(1).max(240),
        address: z.string().trim().max(500).optional().default(''),
    }))
        .min(1)
        .max(100),
    rehostImages: z.boolean().optional().default(true),
});
export const adminLocationAiEnrichJobSchema = z.object({
    country: z.string().trim().max(120).optional().default(''),
    city: z.string().trim().max(120).optional().default(''),
    items: z
        .array(z.object({
        name: z.string().trim().min(1).max(240),
        address: z.string().trim().max(500).optional().default(''),
    }))
        .min(1)
        .max(100),
    rehostImages: z.boolean().optional().default(true),
    autoPublish: z.boolean().optional().default(false),
    mergeTarget: z
        .object({
        countryId: z.string().trim().min(2).max(8),
        countryUk: z.string().trim().max(120).optional().default(''),
        countryEn: z.string().trim().max(120).optional().default(''),
        regionId: z.string().trim().max(120).optional().default(''),
        cityUk: z.string().trim().max(120).optional().default(''),
        cityEn: z.string().trim().max(120).optional().default(''),
    })
        .optional(),
    snapshot: z.record(z.any()).optional(),
    /** Per import item index: how to handle a similar existing landmark. */
    duplicatePolicies: z
        .record(z.enum(['skip', 'replace', 'merge', 'keep_both']))
        .optional(),
});
export const adminAiDuplicateDecisionSchema = z.object({
    action: z.enum(['skip', 'replace', 'merge', 'keep_both']),
});
export const adminGrantSubscriptionSchema = z
    .object({
    email: z.string().trim().email(),
    plan_type: z.enum(['free', 'explorer', 'pro', 'family']),
    duration_days: z.coerce.number().int().min(0).max(3660).default(0),
    lifetime: z.boolean().optional().default(false),
})
    .superRefine((data, ctx) => {
    if (data.plan_type === 'free') {
        return;
    }
    if (data.lifetime) {
        return;
    }
    if (data.duration_days < 1) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'duration_required',
            path: ['duration_days'],
        });
    }
});
export const adminGrantAdminSchema = z.object({
    email: z.string().trim().email(),
});
export const adminRevokeAdminSchema = z.object({
    email: z.string().trim().email(),
});
//# sourceMappingURL=admin.schemas.js.map