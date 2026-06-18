/**
 * Startup environment checks.
 *
 * Emits logger.warn for configuration problems that will cause silent failures
 * or security issues in production. Never throws — only warns.
 *
 * Call once from index.ts before app.listen().
 */
import { config } from './config.js';
import { logger } from './logger.js';
import { isFirebaseConfigured } from './services/firebaseAdmin.js';
const isProd = config.nodeEnv === 'production';
function warn(variable, issue, hint) {
    logger.warn('startup.config.warn', { variable, issue, hint });
}
export function runStartupChecks() {
    // -------------------------------------------------------------------------
    // DATABASE_URL
    // -------------------------------------------------------------------------
    // Warn in production if the URL still points to localhost — a managed
    // PostgreSQL host should be used for any real deployment.
    if (isProd) {
        const dbLower = config.databaseUrl.toLowerCase();
        if (dbLower.includes('localhost') ||
            dbLower.includes('127.0.0.1') ||
            dbLower.includes('@::1')) {
            warn('DATABASE_URL', 'points_to_localhost', 'Production deployments must use a managed PostgreSQL host, not localhost.');
        }
    }
    // -------------------------------------------------------------------------
    // JWT_SECRET / REFRESH_SECRET — minimum length
    // -------------------------------------------------------------------------
    // Both are already required (non-empty) by config.ts req(). Here we warn if
    // they are suspiciously short. 32 characters is the minimum for HS256 safety;
    // 64+ is recommended.
    if (config.jwtSecret.length < 32) {
        warn('JWT_SECRET', 'too_short', `JWT_SECRET is ${config.jwtSecret.length} chars. Use at least 32 random characters (64+ recommended) in production.`);
    }
    if (config.refreshPepper.length < 32) {
        warn('REFRESH_SECRET', 'too_short', `REFRESH_SECRET is ${config.refreshPepper.length} chars. Use at least 32 random characters (64+ recommended) in production.`);
    }
    // -------------------------------------------------------------------------
    // PUBLIC_BASE_URL
    // -------------------------------------------------------------------------
    // The default is http://localhost:3000. Avatar and media URLs returned to the
    // mobile client will be unreachable from the internet if this is not set.
    const pubBaseUrl = config.publicBaseUrl.toLowerCase();
    const pubUrlIsLocal = pubBaseUrl.includes('localhost') || pubBaseUrl.includes('127.0.0.1');
    if (isProd && pubUrlIsLocal) {
        warn('PUBLIC_BASE_URL', 'is_localhost', 'Set PUBLIC_BASE_URL to the public HTTPS URL of this API (e.g. https://api.yourdomain.com). ' +
            'Avatar and media URLs stored in the DB will be unreachable from the internet otherwise.');
    }
    else if (!isProd && pubUrlIsLocal) {
        logger.debug('startup.config.info', {
            variable: 'PUBLIC_BASE_URL',
            value: config.publicBaseUrl,
            note: 'Using localhost — expected in development.',
        });
    }
    // -------------------------------------------------------------------------
    // Firebase Admin SDK — shared via services/firebaseAdmin.ts
    // -------------------------------------------------------------------------
    // When neither FIREBASE_SERVICE_ACCOUNT_JSON nor FIREBASE_SERVICE_ACCOUNT_PATH
    // is configured, Firebase custom tokens will not be issued and Firestore
    // follow-request validation always falls through. Acceptable in development;
    // should be set in production.
    if (!isFirebaseConfigured()) {
        const msg = 'Firebase custom tokens will not be issued and Firestore follow validation is disabled. ' +
            'Set FIREBASE_SERVICE_ACCOUNT_JSON (inline JSON) or FIREBASE_SERVICE_ACCOUNT_PATH (file) ' +
            'in production.';
        if (isProd) {
            warn('FIREBASE_SERVICE_ACCOUNT_JSON', 'not_set', msg);
        }
        else {
            logger.debug('startup.config.info', {
                variable: 'FIREBASE_SERVICE_ACCOUNT_JSON',
                note: 'Not set — Firebase features disabled. Expected in development without Firebase credentials.',
            });
        }
    }
    // -------------------------------------------------------------------------
    // TRUST_PROXY
    // -------------------------------------------------------------------------
    // In production, a reverse proxy (nginx, ALB, Traefik) sits in front of the
    // Node.js process. Without TRUST_PROXY=1, express-rate-limit sees the proxy's
    // IP for every request — all clients share a single rate-limit bucket,
    // effectively disabling per-client rate limiting.
    if (isProd && !config.trustProxy) {
        warn('TRUST_PROXY', 'not_set_in_production', 'Set TRUST_PROXY=1 when running behind a reverse proxy (nginx, ALB, Traefik). ' +
            'Without it, IP-based rate limiting uses the proxy IP and all clients share one bucket.');
    }
}
//# sourceMappingURL=startupChecks.js.map