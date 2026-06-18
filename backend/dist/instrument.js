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
import { config } from './config.js';
import * as Sentry from '@sentry/node';
const dsn = config.sentryDsn;
if (dsn) {
    try {
        Sentry.init({
            dsn,
            environment: config.sentryEnv,
            tracesSampleRate: config.sentryTracesSampleRate,
            profilesSampleRate: 0.1,
            attachStacktrace: true,
            beforeSend(event) {
                // Strip auth tokens from query strings
                if (event.request?.query_string) {
                    const qs = String(event.request.query_string);
                    if (/[&?](token|secret|key|api_key)=/i.test(qs)) {
                        event.request.query_string = qs.replace(/([&?])(token|secret|key|api_key)=[^&]+/gi, '$1$2=***');
                    }
                }
                return event;
            },
        });
    }
    catch (e) {
        console.warn('[sentry] init failed — continuing without Sentry', e);
    }
}
export { Sentry };
//# sourceMappingURL=instrument.js.map