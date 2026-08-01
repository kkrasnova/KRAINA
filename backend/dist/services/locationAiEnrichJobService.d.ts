import { type EnrichItemTrace, type EnrichLogEntry } from './locationAiEnrichmentService.js';
export type EnrichJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'awaiting_decisions';
export type EnrichJobProgress = {
    done: number;
    total: number;
    currentName: string;
    phase: 'enrich' | 'rehost' | 'translate' | 'publish' | 'done';
};
export type DuplicateAction = 'skip' | 'replace' | 'merge' | 'keep_both';
export type PendingDuplicate = {
    itemIndex: number;
    landmark: any;
    match: {
        id: string;
        titleUk: string;
        titleEn: string;
        index: number;
    };
    reason: string;
};
export type EnrichJobMergeTarget = {
    countryId: string;
    countryUk?: string;
    countryEn?: string;
    regionId?: string;
    cityUk?: string;
    cityEn?: string;
};
export type EnrichJobCreateInput = {
    country?: string;
    city?: string;
    items: Array<{
        name: string;
        address?: string;
    }>;
    rehostImages?: boolean;
    autoPublish?: boolean;
    mergeTarget?: EnrichJobMergeTarget;
    /** Full admin snapshot. Used only as overlay; disk bundle is always preferred base. */
    snapshot?: Record<string, any>;
    /** Optional pre-set decisions keyed by item index. */
    duplicatePolicies?: Record<string, DuplicateAction>;
};
export type EnrichJob = {
    id: string;
    status: EnrichJobStatus;
    createdAt: string;
    updatedAt: string;
    progress: EnrichJobProgress;
    error?: string;
    landmarks?: any[];
    published?: boolean;
    firestore?: unknown;
    appliedRegionId?: string;
    log: EnrichLogEntry[];
    itemTraces: EnrichItemTrace[];
    /** Kept so a CMS client can retry after server restart. Not returned in API by default. */
    _input?: EnrichJobCreateInput;
    /** Indexes removed by admin during the run. */
    cancelledIndexes: number[];
    /** Live snapshot mutated as each landmark publishes. */
    liveSnapshot?: Record<string, any>;
    publishedCount: number;
    pendingDuplicates: PendingDuplicate[];
    duplicateDecisions: Record<string, DuplicateAction>;
};
export declare function getEnrichJob(jobId: string): EnrichJob | null;
export declare function createEnrichJob(input: EnrichJobCreateInput): EnrichJob;
export declare function removeEnrichJobItem(jobId: string, itemIndex: number): EnrichJob;
export declare function resolveEnrichJobDuplicate(jobId: string, itemIndex: number, action: DuplicateAction): Promise<EnrichJob>;
export declare function listEnrichJobs(): EnrichJob[];
export declare function serializeEnrichJobSummary(job: EnrichJob): {
    ok: boolean;
    id: string;
    status: EnrichJobStatus;
    createdAt: string;
    updatedAt: string;
    error: string | null;
    published: boolean;
    publishedCount: number;
    landmarkCount: number;
    appliedRegionId: string | null;
    country: string;
    city: string;
    countryId: string;
    regionId: string;
    items: {
        index: number;
        name: string;
        address: string;
        status: "error" | "ok" | "pending" | "running" | "skipped" | "removed" | "needs_decision";
        published: boolean;
        landmarkId: any;
        titleUk: any;
        titleEn: any;
        thumbUri: any;
        regionId: string | null;
        wikiUk: string | null;
        wikiEn: string | null;
    }[];
    retry: {
        country: string;
        city: string;
        countryId: string;
        countryUk: string;
        countryEn: string;
        cityUk: string;
        cityEn: string;
        regionId: string;
        itemsAll: {
            name: string;
            address: string;
        }[];
        itemsFailed: {
            name: string;
            address: string;
        }[];
    };
};
export declare function serializeEnrichJob(job: EnrichJob, opts?: {
    includeLandmarks?: boolean;
}): {
    landmarks?: any[] | undefined;
    progress: EnrichJobProgress;
    firestore: {} | null;
    cancelledIndexes: number[];
    pendingDuplicates: PendingDuplicate[];
    duplicateDecisions: Record<string, DuplicateAction>;
    log: EnrichLogEntry[];
    itemTraces: EnrichItemTrace[];
    ok: boolean;
    id: string;
    status: EnrichJobStatus;
    createdAt: string;
    updatedAt: string;
    error: string | null;
    published: boolean;
    publishedCount: number;
    landmarkCount: number;
    appliedRegionId: string | null;
    country: string;
    city: string;
    countryId: string;
    regionId: string;
    items: {
        index: number;
        name: string;
        address: string;
        status: "error" | "ok" | "pending" | "running" | "skipped" | "removed" | "needs_decision";
        published: boolean;
        landmarkId: any;
        titleUk: any;
        titleEn: any;
        thumbUri: any;
        regionId: string | null;
        wikiUk: string | null;
        wikiEn: string | null;
    }[];
    retry: {
        country: string;
        city: string;
        countryId: string;
        countryUk: string;
        countryEn: string;
        cityUk: string;
        cityEn: string;
        regionId: string;
        itemsAll: {
            name: string;
            address: string;
        }[];
        itemsFailed: {
            name: string;
            address: string;
        }[];
    };
};
//# sourceMappingURL=locationAiEnrichJobService.d.ts.map