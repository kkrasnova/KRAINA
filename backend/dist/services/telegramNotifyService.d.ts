export declare function sendTelegramHtmlMessage(html: string): Promise<boolean>;
export declare function formatLandmarkStoryRequestTelegram(params: {
    requestRef: string;
    language: string | null;
    userEmail: string | null;
    userId: string | null;
    scanLatitude: number | null;
    scanLongitude: number | null;
    attachedLatitude: number | null;
    attachedLongitude: number | null;
    visionHintTitle: string | null;
    hasPhoto: boolean;
}): string;
//# sourceMappingURL=telegramNotifyService.d.ts.map