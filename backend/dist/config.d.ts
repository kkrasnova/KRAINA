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
export declare const config: {
    nodeEnv: string;
    port: number;
    databaseUrl: string;
    databaseSsl: false | {
        rejectUnauthorized: boolean;
    };
    jwtSecret: string;
    refreshPepper: string;
    googleClientId: string;
    appleClientId: string;
    publicBaseUrl: string;
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
    corsOrigins: string[];
    trustProxy: number | boolean;
};
//# sourceMappingURL=config.d.ts.map