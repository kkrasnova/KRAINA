/**
 * Single source of truth for city → regionId so "Київ" / "Kyiv" / "Kiev"
 * always map to the same region (`kyiv`), never duplicate cities in the app.
 */
export type CanonicalCity = {
    id: string;
    titleUk: string;
    titleEn: string;
    aliases: string[];
};
/** Capitals + major cities used by the app / AI import. */
export declare const CANONICAL_CITIES: CanonicalCity[];
export declare function resolveCanonicalCity(input: {
    regionId?: string;
    cityUk?: string;
    cityEn?: string;
    city?: string;
}): {
    id: string;
    titleUk: string;
    titleEn: string;
};
/**
 * If a matching city region already exists under any alias id/title, return the
 * canonical id (caller creates/merges into that id after dedupe).
 */
export declare function findExistingRegionId(regions: Record<string, any>, canonical: {
    id: string;
    titleUk: string;
    titleEn: string;
}): string;
/**
 * Merge duplicate city regions (e.g. `київ` → `kyiv`) inside a landmark bundle.
 */
export declare function dedupeCityRegionsInBundle(bundle: Record<string, any>): Record<string, any>;
//# sourceMappingURL=cityRegionCanonical.d.ts.map