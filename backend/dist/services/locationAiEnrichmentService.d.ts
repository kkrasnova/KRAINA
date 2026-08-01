type ImportItem = {
    name: string;
    address?: string;
};
export type EnrichLogEntry = {
    ts: string;
    level: 'info' | 'ok' | 'warn' | 'err';
    step: 'start' | 'search' | 'wiki' | 'text' | 'images' | 'rehost' | 'translate' | 'skip' | 'done' | 'publish';
    itemIndex?: number;
    itemName?: string;
    message: string;
    data?: Record<string, unknown>;
};
export type EnrichItemTrace = {
    index: number;
    name: string;
    address: string;
    status: 'pending' | 'running' | 'ok' | 'skipped' | 'error' | 'removed' | 'needs_decision';
    duplicateMatch?: {
        id: string;
        titleUk: string;
        titleEn: string;
        reason: string;
    } | null;
    queries: string[];
    wikiEn: {
        title: string;
        url: string;
        candidates: string[];
    } | null;
    wikiUk: {
        title: string;
        url: string;
        candidates: string[];
    } | null;
    extractUkPreview: string;
    extractEnPreview: string;
    extractUkChars: number;
    extractEnChars: number;
    lat: number | null;
    lng: number | null;
    imagesFound: string[];
    imagesHosted: string[];
    thumbUri: string;
    sources: string[];
    translatedLangs: string[];
    published?: boolean;
    publishedRegionId?: string;
    landmarkId?: string | null;
    titleUk?: string;
    titleEn?: string;
    skipReason?: string;
    error?: string;
};
type EnrichProgress = {
    done: number;
    total: number;
    currentName: string;
    phase: 'enrich' | 'rehost' | 'translate';
};
type EnrichInput = {
    country?: string;
    city?: string;
    items: ImportItem[];
    rehostImages?: boolean;
    onProgress?: (progress: EnrichProgress) => void | Promise<void>;
    onEvent?: (event: EnrichLogEntry) => void | Promise<void>;
    onItemTrace?: (trace: EnrichItemTrace) => void | Promise<void>;
    /** Return true to skip/cancel this item (checked between phases). */
    shouldSkipItem?: (itemIndex: number) => boolean;
    /** Called as soon as one landmark is fully ready (before next item). */
    onLandmarkReady?: (landmark: any, itemIndex: number) => void | Promise<void>;
};
export declare function enrichLocationsFromVerifiedSources(input: EnrichInput): Promise<{
    landmarks: any[];
}>;
export {};
//# sourceMappingURL=locationAiEnrichmentService.d.ts.map