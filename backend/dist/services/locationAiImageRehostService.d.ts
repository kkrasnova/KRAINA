export declare function isAlreadyHostedLandmarkMedia(url: string): boolean;
/** Icons/maps only — war/damage photos allowed for documentary story pages. */
export declare function isNonPhotoJunkUrl(url: string): boolean;
/** Reject war / scaffold / ruins URLs for hero & card covers. */
export declare function isUnattractiveLandmarkPhotoUrl(url: string): boolean;
/** Reject icons, maps, diagrams and other non-photo junk for story pages. */
export declare function isJunkLandmarkPhotoUrl(url: string): boolean;
/** True when URL looks like war / damage / ruin documentation (for story pages). */
export declare function isDocumentaryDamagePhotoUrl(url: string): boolean;
/** Prefer inviting travel photos for main card / page 1. */
export declare function scoreAttractivePhotoUrl(url: string): number;
export declare function rankImagesForHero(urls: string[]): string[];
/**
 * Generate a historical (100–200 years ago) version of the landmark for page-3 compare.
 * Same viewpoint as the modern photo — archival sepia / early photo look.
 */
/**
 * Build a same-angle historic twin of a modern landmark photo for the
 * vertical then/now slider (9:16, identical framing).
 *
 * Prefer OpenAI gpt-image edits with the modern photo as reference (+ optional
 * historic postcard as style cue). Fall back to text-only generation.
 */
export declare function generateLandmarkHistoricCompareImage(input: {
    titleUk: string;
    titleEn: string;
    city?: string;
    country?: string;
    /** Optional short description of the modern view to match (facade, towers, street…). */
    modernViewHint?: string;
    /** Modern Wikipedia / Commons photo — primary reference for camera angle. */
    modernUri?: string;
    /** Optional real historic postcard / archive photo for period look. */
    historicRefUri?: string;
}): Promise<string | null>;
/**
 * Score how likely a Commons/Wiki URL is a real historic (pre-1950) photo.
 */
export declare function scoreHistoricPhotoUrl(url: string): number;
export declare function pickBestHistoricPhoto(urls: string[], minScore?: number): string;
/**
 * Generate a photorealistic scene image for a landmark story page.
 * Prefer Google Imagen 4 (Gemini API) when configured; OpenAI gpt-image as fallback.
 */
export declare function generateLandmarkSceneImage(input: {
    titleUk: string;
    titleEn: string;
    city?: string;
    country?: string;
    /** Extra scene direction, e.g. "gothic facade at golden hour" */
    scene?: string;
    /** Filename hint for storage */
    fileHint?: string;
}): Promise<string | null>;
/** Cover / home-card hero (beautiful inviting shot). */
export declare function generateLandmarkHeroImage(input: {
    titleUk: string;
    titleEn: string;
    city?: string;
    country?: string;
}): Promise<string | null>;
/**
 * Beautiful AI covers + optional per-page photoreal scenes (Imagen / OpenAI).
 * LANDMARK_AI_PAGE_IMAGES:
 *   hero  — only cover + welcome (default; page bodies use unique Commons)
 *   all   — cover + welcome + each intro page (except compare slot)
 *   0/off — skip AI images entirely
 */
export declare function generateLandmarkStoryPageImages(input: {
    titleUk: string;
    titleEn: string;
    city?: string;
    country?: string;
    onProgress?: (msg: string, done: number, total: number) => void | Promise<void>;
}): Promise<{
    hero: string;
    page1: string;
    pages: string[];
}>;
export declare function rehostRemoteImage(url: string): Promise<string | null>;
export declare function rehostImageList(urls: string[], limit?: number): Promise<string[]>;
export declare function rehostLandmarkMediaFields(landmark: any): Promise<any>;
//# sourceMappingURL=locationAiImageRehostService.d.ts.map