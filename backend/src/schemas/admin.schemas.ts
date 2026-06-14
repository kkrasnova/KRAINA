import { z } from 'zod';

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
