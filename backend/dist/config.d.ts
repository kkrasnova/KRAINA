export declare const billingConfig: {
    appleSharedSecret: string;
    googlePlayPackageName: string;
    googlePlayServiceAccountJson: string;
    appleSkuExplorer: string[];
    appleSkuPro: string[];
    appleSkuFamily: string[];
    googleSkuExplorer: string[];
    googleSkuPro: string[];
    googleSkuFamily: string[];
};
export declare const aiRouteConfig: {
    apiKey: string;
    baseUrl: string;
    model: string;
};
/** Claude (Anthropic) — optional for rich landmark story copy. */
export declare const claudeConfig: {
    apiKey: string;
    baseUrl: string;
    model: string;
    apiVersion: string;
    /**
     * LANDMARK_GUIDE_PROVIDER=openai → тільки ChatGPT
     * LANDMARK_GUIDE_PROVIDER=claude → тільки Claude (fallback на OpenAI якщо Claude впав)
     * порожньо / auto → Claude якщо є ключ, інакше OpenAI
     */
    guideProvider: string;
};
export declare function landmarkGuideUsesClaude(): boolean;
export declare const visionConfig: {
    apiKey: string;
};
/** Google Gemini / Imagen — image generation for landmark covers & story pages. */
export declare const geminiConfig: {
    apiKey: string;
    baseUrl: string;
    /** imagen-4.0-generate-001 | imagen-4.0-ultra-generate-001 | imagen-4.0-fast-generate-001 */
    imagenModel: string;
    /**
     * LANDMARK_IMAGE_PROVIDER:
     *   gemini — Imagen only
     *   openai — gpt-image / DALL·E only
     *   auto   — Gemini/Imagen if key present, else OpenAI
     */
    imageProvider: string;
};
export declare function landmarkImageProviderOrder(): Array<'gemini' | 'openai'>;
export declare const telegramConfig: {
    botToken: string;
    chatId: string;
};
export declare const config: {
    nodeEnv: string;
    sentryDsn: string;
    sentryEnv: string;
    sentryTracesSampleRate: number;
    port: number;
    databaseUrl: string;
    databaseSsl: false | {
        rejectUnauthorized: boolean;
    };
    jwtSecret: string;
    refreshPepper: string;
    googleClientId: string;
    /** Optional dedicated Web client for /landmarks-cms Google Sign-In. */
    cmsGoogleClientId: string;
    /** Web + iOS + Android (+ CMS) OAuth client IDs accepted as id_token audience. */
    googleClientIds: string[];
    appleClientId: string;
    publicBaseUrl: string;
    appVersion: string;
    storageProvider: "local" | "s3";
    s3Bucket: string;
    s3Region: string;
    s3AccessKeyId: string;
    s3SecretAccessKey: string;
    s3PublicBaseUrl: string;
    s3Endpoint: string;
    minSupportedAppVersion: string;
    iosAppStoreUrl: string;
    androidPlayStoreUrl: string;
    uploadDir: string;
    maxAvatarBytes: number;
    maxFeedMediaBytes: number;
    maxLandmarkBundleJsonBytes: number;
    maxLandmarkMediaBytes: number;
    landmarkBundlePublicGet: boolean;
    accessTokenTtlSec: number;
    refreshTokenTtlDays: number;
    passwordResetTtlMin: number;
    livekitApiKey: string;
    livekitApiSecret: string;
    livekitUrl: string;
    apnsKeyId: string;
    apnsTeamId: string;
    apnsTopic: string;
    apnsProduction: boolean;
    expoPushAccessToken: string;
    corsOrigins: string[];
    trustProxy: number | boolean;
    apnsConfigured: boolean;
    livekitConfigured: boolean;
    googleVisionApiKey: string;
    googleTtsApiKey: string;
};
//# sourceMappingURL=config.d.ts.map