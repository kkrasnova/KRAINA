export declare function createPostViaSequelize(userId: string, body: {
    media_urls: string[];
    content_text?: string | null;
    visibility: 'public' | 'followers' | 'private';
    place_label?: string | null;
    lat?: number | null;
    lng?: number | null;
    route_plan?: Record<string, unknown> | null;
    route_id?: string | null;
    location_id?: string | null;
}): Promise<any>;
//# sourceMappingURL=postsCrudService.d.ts.map