import { Router } from 'express';
import pg from 'pg';
import { ZodError } from 'zod';
import {
  registerSchema,
  loginSchema,
  googleSchema,
  firebaseSchema,
  appleSchema,
  facebookSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  emailExistsSchema,
  appPasswordResetOtpSchema,
  appPasswordResetConfirmSchema,
} from '../schemas/auth.schemas.js';
import {
  registerUser,
  loginWithPassword,
  loginOrRegisterGoogle,
  loginOrRegisterFirebaseIdToken,
  loginOrRegisterFacebook,
  loginOrRegisterApple,
  rotateRefreshToken,
  logoutAllRefreshTokens,
  requestPasswordReset,
  resetPasswordWithToken,
  userEmailExists,
  storeAppPasswordResetOtp,
  resetPasswordWithAppOtp,
  type AuthTokens,
} from '../services/authService.js';
import { createFirebaseCustomToken } from '../services/firebaseAdminAuthService.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { HttpError } from '../errors/HttpError.js';
import {
  authLoginRateLimiter,
  authRegisterRateLimiter,
  authGoogleRateLimiter,
  authAppleRateLimiter,
  authRefreshRateLimiter,
  authForgotPasswordRateLimiter,
  authResetPasswordRateLimiter,
} from '../middleware/rateLimits.js';

async function withFirebaseCustomToken(out: AuthTokens): Promise<AuthTokens & { firebase_custom_token?: string }> {
  try {
    const token = await createFirebaseCustomToken(out.user.id);
    return token ? { ...out, firebase_custom_token: token } : out;
  } catch (e) {
    return out;
  }
}

const router = Router();

function zodFirstCode(err: ZodError): string {
  const i = err.issues[0];
  if (
    i?.message === 'weak_password' ||
    i?.message === 'invalid_email' ||
    i?.message === 'invalid_username'
  ) {
    return i.message;
  }
  if (i?.path.includes('username')) return 'invalid_username';
  if (i?.path.includes('email')) return 'invalid_email';
  return 'invalid_email';
}

function isPgUniqueViolation(e: unknown): e is pg.DatabaseError {
  return e instanceof pg.DatabaseError && e.code === '23505';
}

router.post('/register', authRegisterRateLimiter, async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, zodFirstCode(parsed.error));
    }
    const out = await registerUser(parsed.data);
    res.status(201).json(await withFirebaseCustomToken(out));
  } catch (e) {
    if (isPgUniqueViolation(e)) {
      const msg = e.detail ?? '';
      if (msg.includes('email') || msg.includes('(email)')) {
        next(new HttpError(400, 'email_taken'));
        return;
      }
      next(new HttpError(400, 'username_taken'));
      return;
    }
    next(e);
  }
});

router.post('/login', authLoginRateLimiter, async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, zodFirstCode(parsed.error));
    }
    const out = await loginWithPassword(parsed.data.email, parsed.data.password);
    res.status(200).json(await withFirebaseCustomToken(out));
  } catch (e) {
    next(e);
  }
});

router.post('/google', authGoogleRateLimiter, async (req, res, next) => {
  try {
    const parsed = googleSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'invalid_token');
    }
    const out = await loginOrRegisterGoogle(parsed.data.id_token);
    res.status(200).json(await withFirebaseCustomToken(out));
  } catch (e) {
    next(e);
  }
});

router.post('/firebase', authGoogleRateLimiter, async (req, res, next) => {
  try {
    const parsed = firebaseSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'invalid_token');
    }
    const out = await loginOrRegisterFirebaseIdToken(parsed.data.id_token);
    res.status(200).json(await withFirebaseCustomToken(out));
  } catch (e) {
    next(e);
  }
});

router.post('/facebook', authGoogleRateLimiter, async (req, res, next) => {
  try {
    const parsed = facebookSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'invalid_token');
    }
    const out = await loginOrRegisterFacebook(parsed.data.access_token);
    res.status(200).json(await withFirebaseCustomToken(out));
  } catch (e) {
    next(e);
  }
});

router.post('/apple', authAppleRateLimiter, async (req, res, next) => {
  try {
    const parsed = appleSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'invalid_token');
    }
    const name = parsed.data.user?.name;
    const out = await loginOrRegisterApple(parsed.data.identity_token, name);
    res.status(200).json(await withFirebaseCustomToken(out));
  } catch (e) {
    next(e);
  }
});

router.post('/refresh', authRefreshRateLimiter, async (req, res, next) => {
  try {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(401, 'token_invalid');
    }
    const tokens = await rotateRefreshToken(parsed.data.refresh_token);
    const firebase_custom_token = (await createFirebaseCustomToken(tokens.user_id)) ?? undefined;
    const { user_id: _user_id, ...rest } = tokens;
    void _user_id;
    res.status(200).json(firebase_custom_token ? { ...rest, firebase_custom_token } : rest);
  } catch (e) {
    next(e);
  }
});

router.post('/email-exists', authForgotPasswordRateLimiter, async (req, res, next) => {
  try {
    const parsed = emailExistsSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, zodFirstCode(parsed.error));
    }
    const exists = await userEmailExists(parsed.data.email);
    res.status(200).json({ exists });
  } catch (e) {
    next(e);
  }
});

router.post('/app-password-reset/otp', authForgotPasswordRateLimiter, async (req, res, next) => {
  try {
    const parsed = appPasswordResetOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, zodFirstCode(parsed.error));
    }
    await storeAppPasswordResetOtp(parsed.data.email, parsed.data.code, parsed.data.expires_at);
    res.status(200).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/app-password-reset/confirm', authResetPasswordRateLimiter, async (req, res, next) => {
  try {
    const parsed = appPasswordResetConfirmSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const code =
        issue?.message === 'weak_password'
          ? 'weak_password'
          : issue?.message === 'invalid_email'
            ? 'invalid_email'
            : 'token_invalid';
      throw new HttpError(400, code);
    }
    await resetPasswordWithAppOtp(parsed.data.email, parsed.data.code, parsed.data.new_password);
    res.status(200).json({ message: 'password_reset' });
  } catch (e) {
    next(e);
  }
});

router.post('/forgot-password', authForgotPasswordRateLimiter, async (req, res, next) => {
  try {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, zodFirstCode(parsed.error));
    }
    await requestPasswordReset(parsed.data.email);
    res.status(200).json({ message: 'email_sent' });
  } catch (e) {
    next(e);
  }
});

router.post('/reset-password', authResetPasswordRateLimiter, async (req, res, next) => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      const code = parsed.error.issues[0]?.message === 'weak_password' ? 'weak_password' : 'token_invalid';
      throw new HttpError(400, code);
    }
    await resetPasswordWithToken(parsed.data.token, parsed.data.new_password);
    res.status(200).json({ message: 'password_reset' });
  } catch (e) {
    next(e);
  }
});

router.post('/logout', authenticateToken, async (req, res, next) => {
  try {
    const id = req.authUser?.id;
    if (!id) {
      throw new HttpError(401, 'token_invalid');
    }
    await logoutAllRefreshTokens(id);
    res.status(200).json({ message: 'logged_out' });
  } catch (e) {
    next(e);
  }
});

export const authRouter = router;
