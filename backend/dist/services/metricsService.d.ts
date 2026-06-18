export interface MetricsPayload {
    /** Opaque session identifier generated once per app cold start */
    sessionId: string;
    /** App version from package.json / expo */
    appVersion?: string;
    /** Platform string: ios | android */
    platform?: string;
    /** OS version, e.g. "17.4" or "15" */
    osVersion?: string;
    /** Device model, e.g. "iPhone15,2" or "SM-S928B" */
    deviceModel?: string;
    /** ISO-8601 / epoch timestamp when the client collected these metrics */
    clientTs: string;
    /** Array of metric entries as returned by getMetricsBuffer() */
    metrics: unknown[];
}
export declare function insertMetrics(userId: string | null, payload: MetricsPayload): Promise<void>;
//# sourceMappingURL=metricsService.d.ts.map