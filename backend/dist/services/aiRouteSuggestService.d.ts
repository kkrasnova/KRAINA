export type AiSuggestInput = {
    place: string;
    hours: number;
    transport: 'walk' | 'car' | 'bus' | 'train';
    interests?: {
        landmark?: boolean;
        park?: boolean;
        museum?: boolean;
        cafe?: boolean;
        architecture?: boolean;
        secret?: boolean;
    } | null;
    budgetTier?: 'free' | 'budget' | 'medium';
    language?: string;
    userOrigin?: {
        lat: number;
        lng: number;
    } | null;
};
export declare function suggestAiRoute(input: AiSuggestInput): Promise<{
    routePlan: Record<string, unknown>;
    usedAi: boolean;
    rationale?: string;
}>;
//# sourceMappingURL=aiRouteSuggestService.d.ts.map