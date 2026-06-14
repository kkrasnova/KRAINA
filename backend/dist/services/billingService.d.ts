import type { BillingVerifyInput } from '../schemas/billing.schemas.js';
import type { SubscriptionDTO } from './profileService.js';
type ParsedApple = {
    productId: string;
    expiresAt: Date;
    originalTransactionId: string;
    paymentProvider: 'apple';
};
type ParsedGoogle = {
    productId: string;
    expiresAt: Date;
    orderId: string;
    paymentProvider: 'google';
};
export declare function verifyAppleReceipt(receiptBase64: string, hintProductId: string | undefined): Promise<ParsedApple>;
export declare function verifyGoogleSubscription(productId: string, purchaseToken: string): Promise<ParsedGoogle>;
export declare function verifyAndSaveSubscription(userId: string, body: BillingVerifyInput): Promise<{
    subscription: SubscriptionDTO;
}>;
export {};
//# sourceMappingURL=billingService.d.ts.map