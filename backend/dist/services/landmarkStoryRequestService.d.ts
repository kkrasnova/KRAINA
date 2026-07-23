export interface LandmarkStoryRequestRow {
    id: string;
    request_ref: string;
    user_id: string | null;
    user_email: string | null;
    app_language: string | null;
    scan_latitude: number | null;
    scan_longitude: number | null;
    attached_latitude: number | null;
    attached_longitude: number | null;
    vision_hint_title: string | null;
    has_photo: boolean;
    telegram_sent: boolean;
    created_at: string;
}
export declare function createLandmarkStoryRequest(params: {
    requestRef: string;
    language: string | null;
    userId: string | null;
    userEmail: string | null;
    scanLatitude: number | null;
    scanLongitude: number | null;
    attachedLatitude: number | null;
    attachedLongitude: number | null;
    visionHintTitle: string | null;
    hasPhoto: boolean;
}): Promise<{
    id: string;
    telegramSent: boolean;
}>;
export declare function listLandmarkStoryRequestsForAdmin(limit?: number): Promise<LandmarkStoryRequestRow[]>;
//# sourceMappingURL=landmarkStoryRequestService.d.ts.map