/** Live app UI languages (content localization for landmark cards). */
export declare const LANDMARK_CONTENT_LANGS: readonly ["uk", "en", "de", "pl", "nl", "es", "lt", "lv", "ro", "it", "hy", "fr", "pt", "cs", "sk", "hu", "sv", "no", "da", "fi", "is", "et", "el", "bg", "hr", "sl", "sr", "bs", "mk", "sq", "mt", "ga", "ca", "tr"];
/** Keep at most `max` paragraphs (blank-line separated). */
export declare function clampGuideParagraphs(text: string, max?: number): string;
export declare function splitGuideSentences(text: string): string[];
/** Merge mid-sentence breaks like "…С." + "Валовського." into one paragraph. */
export declare function normalizeGuideProse(text: string, max?: number): string;
/**
 * Ensure story pages have enough paragraphs (split long single blobs into sentence groups).
 * Does not invent content — only reformats. Never breaks on initials like "С. Валовського".
 */
export declare function ensureMinGuideParagraphs(text: string, min?: number, max?: number): string;
/**
 * Adds titleI18n / descI18n and full story I18n maps for all app languages.
 * Translates intro pages, quiz, photo/fact cards — not only short card fields.
 */
export declare function localizeLandmarkForAllAppLanguages(landmark: any, opts?: {
    onBatch?: (done: number, total: number, langs: string[]) => void | Promise<void>;
}): Promise<any>;
export type LandmarkGuideQuizOption = {
    textUk: string;
    textEn: string;
    correct: boolean;
};
export type LandmarkGuideQuizQuestion = {
    questionUk: string;
    questionEn: string;
    options: LandmarkGuideQuizOption[];
    multiHintUk?: string;
    multiHintEn?: string;
};
export type LandmarkGuideQuiz = LandmarkGuideQuizQuestion & {
    xpPerCorrect?: number;
    questions?: LandmarkGuideQuizQuestion[];
};
export type LandmarkGuidePerson = {
    nameUk: string;
    nameEn: string;
};
export type LandmarkGuidePack = {
    titleUk: string;
    titleEn: string;
    descUk: string;
    descEn: string;
    shortIntroUk: string;
    shortIntroEn: string;
    miniPreviewUk: string;
    miniPreviewEn: string;
    introPage1Uk: string;
    introPage1En: string;
    pagesUk: string[];
    pagesEn: string[];
    people: LandmarkGuidePerson[];
    quiz: LandmarkGuideQuiz | null;
};
/**
 * ChatGPT / Claude: rewritten travel-guide copy — rich 2–3 paragraphs per page,
 * surprising real facts (never Wikipedia paste, never invented history).
 */
export declare function openaiBuildLandmarkGuide(input: {
    titleUk: string;
    titleEn: string;
    cityUk?: string;
    cityEn?: string;
    extractUk: string;
    extractEn: string;
}): Promise<LandmarkGuidePack | null>;
//# sourceMappingURL=locationAiTranslateService.d.ts.map