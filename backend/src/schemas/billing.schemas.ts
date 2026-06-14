import { z } from 'zod';

export const billingVerifySchema = z
  .object({
    platform: z.enum(['ios', 'android']),
    productId: z.string().min(1).max(256).optional(),
    
    appReceiptBase64: z.string().min(20).max(512_000).optional(),
    purchaseToken: z.string().min(10).max(4096).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.platform === 'ios') {
      if (!val.appReceiptBase64) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'appReceiptBase64_required',
          path: ['appReceiptBase64'],
        });
      }
    } else {
      if (!val.purchaseToken) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'purchaseToken_required',
          path: ['purchaseToken'],
        });
      }
      if (!val.productId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'productId_required',
          path: ['productId'],
        });
      }
    }
  });

export type BillingVerifyInput = z.infer<typeof billingVerifySchema>;

const reasonCode = z.string().min(1).max(64);

export const billingCancelFeedbackSchema = z.object({
  previous_plan: z.enum(['explorer', 'pro', 'family']),
  reason_codes: z.array(reasonCode).min(1).max(24),
  comment: z.string().max(2000).optional().nullable(),
  app_language: z.string().max(16).optional().nullable(),
});

export type BillingCancelFeedbackInput = z.infer<typeof billingCancelFeedbackSchema>;
