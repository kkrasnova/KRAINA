import { z } from 'zod';
export declare const openThreadSchema: z.ZodEffects<z.ZodObject<{
    peer_username: z.ZodOptional<z.ZodString>;
    peer_user_id: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    peer_username?: string | undefined;
    peer_user_id?: string | undefined;
}, {
    peer_username?: string | undefined;
    peer_user_id?: string | undefined;
}>, {
    peer_username?: string | undefined;
    peer_user_id?: string | undefined;
}, {
    peer_username?: string | undefined;
    peer_user_id?: string | undefined;
}>;
export declare const sendMessageSchema: z.ZodObject<{
    content: z.ZodString;
}, "strip", z.ZodTypeAny, {
    content: string;
}, {
    content: string;
}>;
export declare const followBodySchema: z.ZodObject<{
    username: z.ZodString;
}, "strip", z.ZodTypeAny, {
    username: string;
}, {
    username: string;
}>;
//# sourceMappingURL=messages.schemas.d.ts.map