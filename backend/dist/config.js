import { createRequire } from 'node:module';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);
const backendEnvPath = path.join(__dirname, '../.env');
const repoEnvPath = path.join(__dirname, '../../.env');
dotenv.config({ path: repoEnvPath });
dotenv.config({ path: backendEnvPath });
function req(name, fallback) {
    const v = process.env[name] ?? fallback;
    if (v === undefined || v === '') {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return v;
}
function parseCorsOrigins() {
    const raw = process.env.CORS_ORIGINS ?? '';
    return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}
function parseTrustProxy() {
    const v = (process.env.TRUST_PROXY ?? '').trim().toLowerCase();
    if (v === 'true' || v === '1' || v === 'yes')
        return 1;
    if (/^\d+$/.test(v))
        return Number(v);
    return false;
}
function opt(name) {
    return (process.env[name] ?? '').trim();
}
function optList(name) {
    return opt(name)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}
function parseBoolEnv(name) {
    const v = (process.env[name] ?? '').trim().toLowerCase();
    if (!v)
        return null;
    if (v === '1' || v === 'true' || v === 'yes' || v === 'on')
        return true;
    if (v === '0' || v === 'false' || v === 'no' || v === 'off')
        return false;
    return null;
}
function parseDatabaseSsl() {
    const explicitSsl = parseBoolEnv('DATABASE_SSL') ?? parseBoolEnv('DB_SSL');
    const sslMode = (process.env.PGSSLMODE ?? '').trim().toLowerCase();
    const useSsl = explicitSsl ?? ['require', 'verify-ca', 'verify-full'].includes(sslMode);
    if (!useSsl)
        return false;
    const strict = parseBoolEnv('DATABASE_SSL_REJECT_UNAUTHORIZED');
    return { rejectUnauthorized: strict ?? false };
}
export const billingConfig = {
    appleSharedSecret: opt('APPLE_IAP_SHARED_SECRET'),
    googlePlayPackageName: opt('GOOGLE_PLAY_PACKAGE_NAME'),
    googlePlayServiceAccountJson: opt('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON'),
    appleSkuExplorer: optList('IAP_APPLE_SKU_EXPLORER'),
    appleSkuPro: optList('IAP_APPLE_SKU_PRO'),
    appleSkuFamily: optList('IAP_APPLE_SKU_FAMILY'),
    googleSkuExplorer: optList('IAP_GOOGLE_SKU_EXPLORER'),
    googleSkuPro: optList('IAP_GOOGLE_SKU_PRO'),
    googleSkuFamily: optList('IAP_GOOGLE_SKU_FAMILY'),
};
export const aiRouteConfig = {
    apiKey: opt('OPENAI_API_KEY'),
    baseUrl: (opt('OPENAI_BASE_URL') || 'https://api.openai.com/v1').replace(/\/$/, ''),
    model: opt('OPENAI_ROUTE_MODEL') || 'gpt-4o-mini',
};
export const visionConfig = {
    apiKey: opt('GOOGLE_VISION_API_KEY'),
};
export const config = {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    sentryDsn: opt('SENTRY_DSN'),
    sentryEnv: opt('SENTRY_ENV') || process.env.NODE_ENV || 'production',
    sentryTracesSampleRate: (() => {
        const v = Number(process.env.SENTRY_TRACES_SAMPLE_RATE);
        return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.1;
    })(),
    port: Number(process.env.PORT ?? 3000),
    databaseUrl: req('DATABASE_URL'),
    databaseSsl: parseDatabaseSsl(),
    jwtSecret: req('JWT_SECRET'),
    refreshPepper: req('REFRESH_SECRET'),
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
    appleClientId: process.env.APPLE_CLIENT_ID ?? '',
    publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000',
    appVersion: (() => {
        try {
            const p = _require('../../package.json');
            return p.version || '0.0.0';
        }
        catch {
            return '0.0.0';
        }
    })(),
    // --- Object storage (S3-compatible) ---
    storageProvider: (process.env.STORAGE_PROVIDER ?? 'local').trim().toLowerCase(),
    s3Bucket: opt('S3_BUCKET'),
    s3Region: opt('S3_REGION') || 'us-east-1',
    s3AccessKeyId: opt('S3_ACCESS_KEY_ID'),
    s3SecretAccessKey: opt('S3_SECRET_ACCESS_KEY'),
    s3PublicBaseUrl: opt('S3_PUBLIC_BASE_URL'),
    s3Endpoint: opt('S3_ENDPOINT'),
    minSupportedAppVersion: opt('MIN_SUPPORTED_APP_VERSION'),
    iosAppStoreUrl: opt('IOS_APP_STORE_URL'),
    androidPlayStoreUrl: opt('ANDROID_PLAY_STORE_URL'),
    uploadDir: process.env.UPLOAD_DIR ?? './uploads',
    maxAvatarBytes: Number(process.env.MAX_AVATAR_BYTES ?? 5 * 1024 * 1024),
    maxFeedMediaBytes: Number(process.env.MAX_FEED_MEDIA_BYTES ?? 25 * 1024 * 1024),
    maxLandmarkBundleJsonBytes: Number(process.env.MAX_LANDMARK_BUNDLE_BYTES ?? 15 * 1024 * 1024),
    maxLandmarkMediaBytes: Number(process.env.MAX_LANDMARK_MEDIA_BYTES ?? 12 * 1024 * 1024),
    landmarkBundlePublicGet: (process.env.LANDMARK_BUNDLE_PUBLIC_GET ?? '1').toLowerCase() !== '0',
    accessTokenTtlSec: 15 * 60,
    refreshTokenTtlDays: 30,
    passwordResetTtlMin: 60,
    // --- LiveKit (аудіо- та відеодзвінки) ---
    livekitApiKey: opt('LIVEKIT_API_KEY'),
    livekitApiSecret: opt('LIVEKIT_API_SECRET'),
    livekitUrl: opt('LIVEKIT_URL'),
    // --- APNs (VoIP push notifications) ---
    apnsKeyId: opt('APNS_KEY_ID'),
    apnsTeamId: opt('APNS_TEAM_ID'),
    apnsTopic: opt('APNS_TOPIC'),
    apnsProduction: /^(1|true|yes)$/i.test(process.env.APNS_PRODUCTION ?? ''),
    // --- Expo Push (chat message notifications) ---
    expoPushAccessToken: opt('EXPO_PUSH_ACCESS_TOKEN'),
    corsOrigins: parseCorsOrigins(),
    trustProxy: parseTrustProxy(),
    // Helper: true if APNs env vars are present (not necessarily valid)
    apnsConfigured: !!(opt('APNS_KEY_ID') && opt('APNS_TEAM_ID') && opt('APNS_TOPIC')),
    googleVisionApiKey: visionConfig.apiKey,
    googleTtsApiKey: opt('GOOGLE_TTS_API_KEY'),
};
//# sourceMappingURL=config.js.map