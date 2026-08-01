export declare function ensureLandmarkContentDirs(): Promise<void>;
export declare function hasLandmarkContentBundle(): Promise<boolean>;
export declare function getLandmarkContentBundle(): Promise<unknown>;
export declare function saveLandmarkContentBundle(data: unknown): Promise<{
    _meta: {
        publishedAt: string;
        version: string;
    };
}>;
export declare function getLandmarkContentBundleMeta(): Promise<{
    version: string;
    size: number;
    mtimeMs: number;
    publishedAt: string;
} | null>;
export type SavedMedia = {
    fileName: string;
    url: string;
};
export declare function saveLandmarkMedia(buffer: Buffer, origName: string): Promise<SavedMedia>;
export type MediaListItem = {
    fileName: string;
    url: string;
    size: number;
    mtimeMs: number;
};
export declare function listLandmarkMedia(): Promise<MediaListItem[]>;
export declare function removeLandmarkMedia(url: string): Promise<void>;
//# sourceMappingURL=landmarkContentAdminService.d.ts.map