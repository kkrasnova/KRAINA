import { z } from 'zod';
export declare const billingVerifySchema: z.ZodEffects<z.ZodObject<{
    platform: z.ZodEnum<["ios", "android"]>;
    productId: z.ZodOptional<z.ZodString>;
    appReceiptBase64: z.ZodOptional<z.ZodString>;
    purchaseToken: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    platform: "ios" | "android";
    productId?: string | undefined;
    appReceiptBase64?: string | undefined;
    purchaseToken?: string | undefined;
}, {
    platform: "ios" | "android";
    productId?: string | undefined;
    appReceiptBase64?: string | undefined;
    purchaseToken?: string | undefined;
}>, {
    platform: "ios" | "android";
    productId?: string | undefined;
    appReceiptBase64?: string | undefined;
    purchaseToken?: string | undefined;
}, {
    platform: "ios" | "android";
    productId?: string | undefined;
    appReceiptBase64?: string | undefined;
    purchaseToken?: string | undefined;
}>;
export type BillingVerifyInput = z.infer<typeof billingVerifySchema>;
export declare const billingCancelFeedbackSchema: z.ZodObject<{
    previous_plan: z.ZodEnum<["explorer", "pro", "family"]>;
    reason_codes: z.ZodArray<z.ZodString, "many">;
    comment: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    app_language: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    previous_plan: "explorer" | "pro" | "family";
    reason_codes: string[];
    comment?: string | null | undefined;
    app_language?: string | null | undefined;
}, {
    previous_plan: "explorer" | "pro" | "family";
    reason_codes: string[];
    comment?: string | null | undefined;
    app_language?: string | null | undefined;
}>;
export type BillingCancelFeedbackInput = z.infer<typeof billingCancelFeedbackSchema>;
//# sourceMappingURL=billing.schemas.d.ts.map