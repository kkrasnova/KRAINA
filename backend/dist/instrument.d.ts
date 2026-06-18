/**
 * Sentry initialisation — MUST be imported as the very first module
 * in app.ts so the SDK can instrument Express and all subsequent imports.
 *
 * ```ts
 * import './instrument.js';  // MUST be first
 * import express from 'express';
 * ```
 *
 * Environment variables:
 *   SENTRY_DSN                  — Required in production.
 *   SENTRY_ENV                  — Optional (defaults to NODE_ENV).
 *   SENTRY_TRACES_SAMPLE_RATE   — Optional 0.0–1.0 (default 0.1).
 */
import * as Sentry from '@sentry/node';
export { Sentry };
//# sourceMappingURL=instrument.d.ts.map