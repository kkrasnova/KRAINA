import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8, { message: 'weak_password' })
  .regex(/\d/, { message: 'weak_password' });

export const registerSchema = z.object({
  email: z.string().email({ message: 'invalid_email' }),
  password: passwordSchema,
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/, { message: 'invalid_username' })
    .optional(),
  display_name: z.string().trim().min(1).max(120).optional(),
});

export const loginSchema = z.object({
  email: z.string().email({ message: 'invalid_email' }),
  password: z.string().min(1),
});

export const googleSchema = z.object({
  id_token: z.string().min(1),
});

export const appleSchema = z.object({
  identity_token: z.string().min(1),
  user: z
    .object({
      name: z.string().optional(),
    })
    .optional(),
});

export const refreshSchema = z.object({
  refresh_token: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email({ message: 'invalid_email' }),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  new_password: passwordSchema,
});

export const emailExistsSchema = z.object({
  email: z.string().email({ message: 'invalid_email' }),
});

export const appPasswordResetOtpSchema = z.object({
  email: z.string().email({ message: 'invalid_email' }),
  code: z.string().regex(/^\d{6}$/, { message: 'invalid_code' }),
  expires_at: z.number().int().positive(),
});

export const appPasswordResetConfirmSchema = z.object({
  email: z.string().email({ message: 'invalid_email' }),
  code: z.string().regex(/^\d{6}$/, { message: 'token_invalid' }),
  new_password: passwordSchema,
});
