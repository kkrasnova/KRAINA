import { z } from 'zod';

export const openThreadSchema = z.object({
  peer_username: z.string().min(1).max(64).optional(),
  peer_user_id: z.string().uuid().optional(),
}).refine((v) => v.peer_username != null || v.peer_user_id != null, {
  message: 'peer_required',
});

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(2000),
});

export const followBodySchema = z.object({
  username: z.string().min(1).max(64),
});
