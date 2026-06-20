// TODO(redis-rate-limit): replace the in-memory store with a Redis-backed store
// (rate-limit-redis or @express-rate-limit/redis) once Redis is introduced.
//
// Current behaviour: each API process instance maintains its own in-memory
// counter. On a multi-pod deployment the effective limit is:
//   configured_limit × number_of_pods
// A user who knows the pod count can trivially bypass all limiters.
//
// Migration path:
//   1. Add env vars: REDIS_URL, RATE_LIMIT_PREFIX (default 'rl:').
//   2. npm install rate-limit-redis ioredis
//   3. In this file: import RedisStore from 'rate-limit-redis'
//      and import Redis from 'ioredis'.
//   4. Create a single shared Redis client: const redis = new Redis(REDIS_URL).
//   5. Add `store: new RedisStore({ sendCommand: (...args) => redis.call(...args) })`
//      to each rateLimit() call. All other options stay unchanged.
//   Until Redis is available, the in-memory implementation below is acceptable
//   for single-pod development and staging environments.
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';


const rateLimitValidate =
  config.nodeEnv === 'production' ? undefined : { xForwardedForHeader: false as const };


export const authLoginRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: rateLimitValidate,
  handler: (_req, res) => {
    res.status(429).json({ error: 'rate_limited' });
  },
});


export const authRegisterRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: rateLimitValidate,
  handler: (_req, res) => {
    res.status(429).json({ error: 'rate_limited' });
  },
});


export const authForgotPasswordRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: rateLimitValidate,
  handler: (_req, res) => {
    res.status(429).json({ error: 'rate_limited' });
  },
});


export const authResetPasswordRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: rateLimitValidate,
  handler: (_req, res) => {
    res.status(429).json({ error: 'rate_limited' });
  },
});


export const authRefreshRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: rateLimitValidate,
  handler: (_req, res) => {
    res.status(429).json({ error: 'rate_limited' });
  },
});

function oauthLimiter(): ReturnType<typeof rateLimit> {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    validate: rateLimitValidate,
    handler: (_req, res) => {
      res.status(429).json({ error: 'rate_limited' });
    },
  });
}


export const authGoogleRateLimiter = oauthLimiter();
export const authAppleRateLimiter = oauthLimiter();


export const adminActionRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: rateLimitValidate,
  handler: (_req, res) => {
    res.status(429).json({ error: 'rate_limited' });
  },
});


export const billingVerifyRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: rateLimitValidate,
  handler: (_req, res) => {
    res.status(429).json({ error: 'rate_limited' });
  },
});

export const messageSendRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: rateLimitValidate,
  handler: (_req, res) => {
    res.status(429).json({ error: 'rate_limited' });
  },
});


export const aiRouteSuggestRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: rateLimitValidate,
  handler: (_req, res) => {
    res.status(429).json({ error: 'rate_limited' });
  },
});


export const visionLandmarkRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: rateLimitValidate,
  handler: (_req, res) => {
    res.status(429).json({ error: 'rate_limited' });
  },
});

export const landmarkTtsRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: rateLimitValidate,
  handler: (_req, res) => {
    res.status(429).json({ error: 'rate_limited' });
  },
});
