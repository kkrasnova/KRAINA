export type WalkNarrateInput = {
    title: string;
    extract: string;
    street?: string;
    city?: string;
    language?: 'uk' | 'en';
};
/**
 * Перетворює Wikipedia extract + вулицю на короткий усний аудіогід (1–3 речення).
 * Без OPENAI_API_KEY повертає deterministic fallback (усе одно з реальних wiki-фактів).
 */
export declare function narrateWalkGuide(input: WalkNarrateInput): Promise<{
    script: string;
    usedAi: boolean;
}>;
//# sourceMappingURL=walkNarrateService.d.ts.map