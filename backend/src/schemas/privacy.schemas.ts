import { z } from 'zod';

export const privacyUserRequestSchema = z.object({
  request_type: z.enum(['export', 'delete']),
  app_language: z.string().max(16).optional().nullable(),
  user_email: z.string().email().optional().nullable(),
});
