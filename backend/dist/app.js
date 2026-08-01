// Sentry initialisation MUST be the very first import.
// It instruments subsequent imports (Express, etc.).
import './instrument.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { buildCorsOptions } from './corsConfig.js';
import './models/sequelize/index.js';
import { authRouter } from './routes/authRoutes.js';
import { profileRouter } from './routes/profileRoutes.js';
import { adminRouter } from './routes/adminRoutes.js';
import { billingRouter } from './routes/billingRoutes.js';
import { messageRouter } from './routes/messageRoutes.js';
import { socialRouter } from './routes/socialRoutes.js';
import { feedRouter } from './routes/feedRoutes.js';
import { locationsRouter } from './routes/locationsRoutes.js';
import { aiRouteRouter } from './routes/aiRouteRoutes.js';
import { routesCrudRouter } from './routes/routesCrudRoutes.js';
import { postsTopRouter } from './routes/postsTopRoutes.js';
import { appMetaRouter } from './routes/appMetaRoutes.js';
import { privacyRouter } from './routes/privacyRoutes.js';
import { Sentry as _Sentry } from './instrument.js';
import { errorHandler } from './middleware/errorHandler.js';
import { landmarkContentAdminRouter } from './routes/landmarkContentAdminRoutes.js';
import { metricsRouter } from './routes/metricsRoutes.js';
import { callRouter } from './routes/callRoutes.js';
import { landmarkStoryRequestRouter } from './routes/landmarkStoryRequestRoutes.js';
import { apnsConfigFromEnv, initApnsProvider } from './services/apnsService.js';
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const landmarksCmsPath = path.join(serverDir, '../../landmarks-admin/public');
export function createApp() {
    const app = express();
    if (config.trustProxy) {
        app.set('trust proxy', config.trustProxy);
    }
    app.use('/landmarks-cms', express.static(landmarksCmsPath, {
        extensions: ['html'],
        index: 'index.html',
        setHeaders(res) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.setHeader('Surrogate-Control', 'no-store');
        },
    }));
    app.use(helmet());
    app.use(cors(buildCorsOptions()));
    app.use('/api/admin/landmark-content', express.json({ limit: '15mb' }), landmarkContentAdminRouter);
    app.use('/api/admin/locations/ai-enrich-job', express.json({ limit: '15mb' }));
    app.use(express.json({ limit: '1mb' }));
    app.use('/api/app', appMetaRouter);
    app.use('/static/avatars', express.static(path.join(config.uploadDir, 'avatars')));
    app.use('/static/feed', express.static(path.join(config.uploadDir, 'feed')));
    app.use('/static/landmark-content', express.static(path.join(config.uploadDir, 'landmark-content')));
    app.use('/api/auth', authRouter);
    app.use('/api/profile', profileRouter);
    app.use('/api/admin', adminRouter);
    app.use('/api/billing', billingRouter);
    app.use('/api/privacy', privacyRouter);
    app.use('/api/messages', messageRouter);
    app.use('/api/social', socialRouter);
    app.use('/api/feed', feedRouter);
    app.use('/api/locations', locationsRouter);
    app.use('/api/ai', aiRouteRouter);
    app.use('/api/routes', routesCrudRouter);
    app.use('/api/posts', postsTopRouter);
    app.use('/api/metrics', metricsRouter);
    // Initialise APNs provider (non-blocking — VoIP push will be skipped if not configured)
    if (config.apnsConfigured) {
        const apnsCfg = apnsConfigFromEnv();
        if (apnsCfg) {
            initApnsProvider(apnsCfg);
        }
    }
    app.use('/api/calls', callRouter);
    app.use('/api/scanner/location-requests', landmarkStoryRequestRouter);
    app.get('/health', async (_req, res) => {
        const start = Date.now();
        let dbOk = false;
        try {
            await pool.query('SELECT 1');
            dbOk = true;
        }
        catch {
            dbOk = false;
        }
        const elapsed = Date.now() - start;
        res.status(dbOk ? 200 : 503).json({
            ok: dbOk,
            version: config.appVersion,
            node: process.version,
            uptime: Math.floor(process.uptime()),
            db: dbOk ? 'connected' : 'disconnected',
            dbLatencyMs: elapsed,
            env: config.nodeEnv,
            timestamp: new Date().toISOString(),
        });
    });
    // Sentry error handler (must be registered before the generic error handler)
    if (_Sentry?.setupExpressErrorHandler) {
        _Sentry.setupExpressErrorHandler(app);
    }
    app.use(errorHandler);
    return app;
}
//# sourceMappingURL=app.js.map