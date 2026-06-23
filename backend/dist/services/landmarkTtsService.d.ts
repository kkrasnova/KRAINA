/** Google TTS ~5 KB/chunk; OpenAI ~4 KB/chunk — split on paragraphs/sentences. */
export declare function splitTextForTts(text: string, maxBytes: number): string[];
export declare function synthesizeLandmarkSpeech(text: string, rawLang: string): Promise<{
    audioBase64: string;
    provider: 'google' | 'openai';
}>;
//# sourceMappingURL=landmarkTtsService.d.ts.map