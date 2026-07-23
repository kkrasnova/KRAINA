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
export declare const visionConfig: {
    apiKey: string;
};
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
    /** Web + iOS + Android OAuth client IDs accepted as id_token audience. */
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