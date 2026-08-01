import { aiRouteConfig, claudeConfig, landmarkGuideUsesClaude } from '../config.js';
/** Live app UI languages (content localization for landmark cards). */
export const LANDMARK_CONTENT_LANGS = [
    'uk',
    'en',
    'de',
    'pl',
    'nl',
    'es',
    'lt',
    'lv',
    'ro',
    'it',
    'hy',
    'fr',
    'pt',
    'cs',
    'sk',
    'hu',
    'sv',
    'no',
    'da',
    'fi',
    'is',
    'et',
    'el',
    'bg',
    'hr',
    'sl',
    'sr',
    'bs',
    'mk',
    'sq',
    'mt',
    'ga',
    'ca',
    'tr',
];
const LANG_NAME = {
    uk: 'Ukrainian',
    en: 'English',
    de: 'German',
    pl: 'Polish',
    nl: 'Dutch',
    es: 'Spanish',
    lt: 'Lithuanian',
    lv: 'Latvian',
    ro: 'Romanian',
    it: 'Italian',
    hy: 'Armenian',
    fr: 'French',
    pt: 'Portuguese',
    cs: 'Czech',
    sk: 'Slovak',
    hu: 'Hungarian',
    sv: 'Swedish',
    no: 'Norwegian',
    da: 'Danish',
    fi: 'Finnish',
    is: 'Icelandic',
    et: 'Estonian',
    el: 'Greek',
    bg: 'Bulgarian',
    hr: 'Croatian',
    sl: 'Slovenian',
    sr: 'Serbian',
    bs: 'Bosnian',
    mk: 'Macedonian',
    sq: 'Albanian',
    mt: 'Maltese',
    ga: 'Irish',
    ca: 'Catalan',
    tr: 'Turkish',
};
function clean(s) {
    return String(s || '').trim();
}
/** Keep at most `max` paragraphs (blank-line separated). */
export function clampGuideParagraphs(text, max = 5) {
    const raw = clean(text)
        .replace(/\r\n/g, '\n')
        .replace(/^[=]{2,}.*$/gm, '')
        .replace(/^[-–—=]{3,}\s*$/gm, '');
    const paras = raw
        .split(/\n{2,}/)
        .map((p) => p.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
    if (paras.length <= max)
        return paras.join('\n\n');
    return paras.slice(0, max).join('\n\n');
}
const INITIAL_END_RE = /(?:^|[\s(«"'])[A-ZА-ЯІЇЄҐЁA-Za-z]\.\s*$/u;
const LOWER_START_RE = /^[a-zа-яіїєґёäöüßàáâãåæçèéêëìíîïñòóôõøùúûüýÿ]/u;
const ABBREV_PROTECT_RE = /(?<![\p{L}\p{N}])(вул|просп|пл|смт|обл|рис|англ|пол|нім|фр|італ|укр|рос|ім|др|проф|гр|стр|ст)\./giu;
function protectAbbreviations(text) {
    return String(text || '')
        // JS \b does not treat Cyrillic as word chars — use unicode letter lookbehind
        .replace(/(?<![\p{L}\p{N}])([A-ZА-ЯІЇЄҐЁ])\.(?=\s*[\p{L}])/gu, '$1\uE000')
        .replace(ABBREV_PROTECT_RE, (m) => m.replace(/\./g, '\uE000'));
}
function restoreAbbreviations(text) {
    return String(text || '').replace(/\uE000/g, '.');
}
export function splitGuideSentences(text) {
    const blob = String(text || '').replace(/\s+/g, ' ').trim();
    if (!blob)
        return [];
    const protectedText = protectAbbreviations(blob);
    const raw = protectedText.match(/[^.!?…]+[.!?…]+(?:\s+|$)|[^.!?…]+$/g) || [protectedText];
    return raw
        .map((s) => restoreAbbreviations(s).replace(/\s+/g, ' ').trim())
        .filter(Boolean);
}
function endsIncompleteGuidePara(para) {
    const t = String(para || '').trim();
    if (!t)
        return true;
    if (INITIAL_END_RE.test(t))
        return true;
    if (/[,:;–—\-]$/u.test(t))
        return true;
    if (!/[.!?…»"”']$/u.test(t))
        return true;
    if (/(?:^|\s)[A-ZА-ЯІЇЄҐЁ]\.$/u.test(t))
        return true;
    return false;
}
function startsContinuationGuidePara(para) {
    const t = String(para || '').trim();
    if (!t)
        return false;
    if (LOWER_START_RE.test(t))
        return true;
    if (t.length <= 90 && /^[A-ZА-ЯІЇЄҐЁ][a-zа-яіїєґё'’-]/u.test(t)) {
        const words = t.split(/\s+/).filter(Boolean);
        if (words.length <= 8)
            return true;
    }
    return false;
}
function shouldMergeGuideParas(prev, next) {
    if (!prev || !next)
        return false;
    if (endsIncompleteGuidePara(prev))
        return true;
    if (startsContinuationGuidePara(next) && (INITIAL_END_RE.test(prev.trim()) || prev.trim().length > 40)) {
        return true;
    }
    if (String(next).trim().length < 48 && !/[.!?…].*[.!?…]/u.test(next))
        return true;
    return false;
}
/** Merge mid-sentence breaks like "…С." + "Валовського." into one paragraph. */
export function normalizeGuideProse(text, max = 5) {
    const raw = clean(text)
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n');
    if (!raw)
        return '';
    const rough = raw
        .split(/\n\s*\n/)
        .map((p) => p.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
    const merged = [];
    for (const p of rough) {
        if (!merged.length) {
            merged.push(p);
            continue;
        }
        const prev = merged[merged.length - 1];
        if (shouldMergeGuideParas(prev, p)) {
            merged[merged.length - 1] = `${prev} ${p}`.replace(/\s+/g, ' ').trim();
        }
        else {
            merged.push(p);
        }
    }
    const healed = [];
    for (const p of merged) {
        if (!healed.length) {
            healed.push(p);
            continue;
        }
        const prev = healed[healed.length - 1];
        if (shouldMergeGuideParas(prev, p)) {
            healed[healed.length - 1] = `${prev} ${p}`.replace(/\s+/g, ' ').trim();
        }
        else {
            healed.push(p);
        }
    }
    if (healed.length === 1 && healed[0].length > 420) {
        const sentences = splitGuideSentences(healed[0]);
        if (sentences.length >= 4) {
            const target = Math.min(max, Math.max(2, Math.min(4, Math.floor(sentences.length / 2))));
            const per = Math.ceil(sentences.length / target);
            const groups = [];
            for (let i = 0; i < sentences.length; i += per) {
                groups.push(sentences.slice(i, i + per).join(' '));
            }
            return groups.slice(0, max).join('\n\n');
        }
    }
    return healed.slice(0, max).join('\n\n');
}
/**
 * Ensure story pages have enough paragraphs (split long single blobs into sentence groups).
 * Does not invent content — only reformats. Never breaks on initials like "С. Валовського".
 */
export function ensureMinGuideParagraphs(text, min = 3, max = 5) {
    const healed = normalizeGuideProse(text, max);
    let paras = healed
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean);
    if (paras.length >= min)
        return paras.slice(0, max).join('\n\n');
    const blob = paras.join(' ').replace(/\s+/g, ' ').trim();
    if (!blob)
        return '';
    const sentences = splitGuideSentences(blob);
    const cleaned = sentences.filter((s) => s.length > 12);
    if (cleaned.length <= 1)
        return blob;
    const target = Math.min(max, Math.max(min, Math.min(cleaned.length, 4)));
    const groups = [];
    const per = Math.ceil(cleaned.length / target);
    for (let i = 0; i < cleaned.length; i += per) {
        groups.push(cleaned.slice(i, i + per).join(' '));
    }
    return groups.slice(0, max).join('\n\n');
}
const GUIDE_SECTION_LABELS = new Set([
    'історичний контекст',
    'тоді і зараз',
    'люди та події',
    'культурне значення',
    'цікаві факти',
    'як виглядає сьогодні',
    'що побачити поруч',
    'легенди та історії',
    'символи місця',
    'практичні деталі',
    'атмосфера візиту',
    'на прощання',
    'деталі',
    'historic context',
    'then and now',
    'people and events',
    'cultural significance',
    'interesting facts',
    'how it looks today',
    'what to see nearby',
    'legends and stories',
    'symbols of the place',
    'practical details',
    'visit atmosphere',
    'a closing note',
    'details',
].map((s) => s.toLowerCase()));
/** Drop leading "Історичний контекст."-style labels from AI/wiki page bodies. */
function stripGuideSectionLead(text) {
    let raw = clean(text)
        .replace(/^(тоді\s+і\s+зараз|then\s+and\s+now)\s*[.。:–—-]?\s*/iu, '')
        .trim();
    for (let i = 0; i < 2; i += 1) {
        const paras = raw
            .split(/\n\s*\n/)
            .map((p) => p.trim())
            .filter(Boolean);
        if (!paras.length)
            return '';
        const first = paras[0]
            .replace(/^[*\s«»"']+|[*«»"']+$/g, '')
            .replace(/[.。…:]+$/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
        const dash = first.split(/\s+[—–-]\s+/);
        const isLabel = GUIDE_SECTION_LABELS.has(first) ||
            (dash.length === 2 && GUIDE_SECTION_LABELS.has(dash[1]));
        if (!isLabel)
            break;
        if (paras.length < 2)
            return '';
        raw = paras.slice(1).join('\n\n').trim();
    }
    return raw;
}
function fillFromFallback(map, fallbackEn, fallbackUk) {
    const out = { ...map };
    for (const lang of LANDMARK_CONTENT_LANGS) {
        if (!clean(out[lang])) {
            out[lang] = lang === 'uk' ? fallbackUk || fallbackEn : fallbackEn || fallbackUk;
        }
    }
    return out;
}
function chunkLangs(langs, size) {
    const out = [];
    for (let i = 0; i < langs.length; i += size)
        out.push(langs.slice(i, i + size));
    return out;
}
function mergeLangMaps(base, extra) {
    return { ...base, ...(extra && typeof extra === 'object' ? extra : {}) };
}
function parseJsonObject(text) {
    const raw = String(text || '')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '');
    if (!raw)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        const start = raw.indexOf('{');
        const end = raw.lastIndexOf('}');
        if (start < 0 || end <= start)
            return null;
        try {
            return JSON.parse(raw.slice(start, end + 1));
        }
        catch {
            return null;
        }
    }
}
function emptyGuideResult(pageCount, optionCount) {
    return {
        title: {},
        desc: {},
        shortIntro: {},
        miniPreview: {},
        introPage1: {},
        pages: Array.from({ length: pageCount }, () => ({})),
        quiz: {
            question: {},
            hint: {},
            options: Array.from({ length: optionCount }, () => ({ text: {}, correct: false })),
        },
        photoFact: { title: {}, body: {} },
        secondFact: { title: {}, body: {} },
    };
}
function qualityTranslateSystemPrompt(langs) {
    const named = langs.map((l) => `${l} (${LANG_NAME[l] || l})`).join(', ');
    return [
        'You are a professional literary translator for the premium European travel app KRAЇNA.',
        'Translate EVERY field into EACH requested target language completely.',
        'Rules:',
        `- Target languages ONLY: ${named}`,
        '- Write like a native travel journalist in each language — natural, elegant, vivid. Never leave English/Ukrainian leftovers in other languages.',
        '- Faithful meaning: do NOT invent new facts, dates, or names. Do NOT drop details.',
        '- Preserve paragraph breaks (blank lines between paragraphs).',
        '- Keep **double-asterisk** markers around person names. Translate or localize the name spelling only when that language has a standard form; otherwise keep the original orthography inside **...**.',
        '- Titles: landmark name only, no city in parentheses.',
        '- Quiz options: keep short and punchy; preserve which option is correct via the correct flag.',
        '- Return ONLY valid JSON matching the required_shape. No markdown fences.',
    ].join('\n');
}
async function openaiTranslateGuideBatch(source, langs) {
    const apiKey = aiRouteConfig.apiKey;
    if (!apiKey || !langs.length)
        return null;
    const payload = {
        model: aiRouteConfig.model || 'gpt-4o-mini',
        temperature: 0.25,
        response_format: { type: 'json_object' },
        messages: [
            {
                role: 'system',
                content: qualityTranslateSystemPrompt(langs),
            },
            {
                role: 'user',
                content: JSON.stringify({
                    target_languages: langs,
                    source_bilingual: source,
                    required_shape: {
                        title: Object.fromEntries(langs.map((l) => [l, 'string'])),
                        desc: Object.fromEntries(langs.map((l) => [l, 'string'])),
                        shortIntro: Object.fromEntries(langs.map((l) => [l, 'string'])),
                        miniPreview: Object.fromEntries(langs.map((l) => [l, 'string'])),
                        introPage1: Object.fromEntries(langs.map((l) => [l, 'string'])),
                        pages: ['array same length as source.pages; each item is lang→full page body'],
                        quiz: {
                            question: Object.fromEntries(langs.map((l) => [l, 'string'])),
                            hint: Object.fromEntries(langs.map((l) => [l, 'string'])),
                            options: [{ text: Object.fromEntries(langs.map((l) => [l, 'string'])), correct: true }],
                            questions: [
                                {
                                    question: Object.fromEntries(langs.map((l) => [l, 'string'])),
                                    hint: Object.fromEntries(langs.map((l) => [l, 'string'])),
                                    options: [
                                        { text: Object.fromEntries(langs.map((l) => [l, 'string'])), correct: true },
                                    ],
                                },
                            ],
                        },
                        photoFact: {
                            title: Object.fromEntries(langs.map((l) => [l, 'string'])),
                            body: Object.fromEntries(langs.map((l) => [l, 'string'])),
                        },
                        secondFact: {
                            title: Object.fromEntries(langs.map((l) => [l, 'string'])),
                            body: Object.fromEntries(langs.map((l) => [l, 'string'])),
                        },
                    },
                }),
            },
        ],
    };
    const url = `${aiRouteConfig.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 180000);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: ac.signal,
        });
        if (!res.ok) {
            const err = await res.text().catch(() => '');
            console.warn('[landmarkTranslate] batch failed', langs.join(','), res.status, err.slice(0, 220));
            return null;
        }
        const json = (await res.json());
        const text = String(json?.choices?.[0]?.message?.content || '').trim();
        const parsed = parseJsonObject(text);
        if (!parsed || typeof parsed !== 'object')
            return null;
        return parsed;
    }
    catch (e) {
        console.warn('[landmarkTranslate] batch error', langs.join(','), e);
        return null;
    }
    finally {
        clearTimeout(timer);
    }
}
function asLangMap(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v))
        return {};
    const out = {};
    for (const [k, val] of Object.entries(v)) {
        const t = clean(val);
        if (t)
            out[k] = t;
    }
    return out;
}
/**
 * Adds titleI18n / descI18n and full story I18n maps for all app languages.
 * Translates intro pages, quiz, photo/fact cards — not only short card fields.
 */
export async function localizeLandmarkForAllAppLanguages(landmark, opts) {
    if (!landmark || typeof landmark !== 'object')
        return landmark;
    const next = JSON.parse(JSON.stringify(landmark));
    const titleEn = clean(next.titleEn || next.titleUk);
    const titleUk = clean(next.titleUk || next.titleEn);
    const descEn = clean(next.descEn || next.descUk);
    const descUk = clean(next.descUk || next.descEn);
    const story = next.story && typeof next.story === 'object' ? next.story : {};
    const shortIntroEn = clean(story.shortIntroEn || story.shortIntroUk || descEn);
    const shortIntroUk = clean(story.shortIntroUk || story.shortIntroEn || descUk);
    const miniPreviewEn = clean(story.miniPreviewEn || story.miniPreviewUk || descEn).slice(0, 240);
    const miniPreviewUk = clean(story.miniPreviewUk || story.miniPreviewEn || descUk).slice(0, 240);
    const introPage1Uk = clean(story.introPage1Uk || '');
    const introPage1En = clean(story.introPage1En || introPage1Uk);
    const pagesUk = Array.isArray(story.introPagesUk) ? story.introPagesUk : [];
    const pagesEn = Array.isArray(story.introPagesEn) ? story.introPagesEn : [];
    const pageCount = Math.max(pagesUk.length, pagesEn.length, 0);
    const pagePairs = Array.from({ length: pageCount }, (_, i) => ({
        uk: clean(pagesUk[i]?.body || ''),
        en: clean(pagesEn[i]?.body || pagesUk[i]?.body || ''),
    }));
    const quiz = story.quiz && typeof story.quiz === 'object' ? story.quiz : {};
    const quizQuestionsRaw = Array.isArray(quiz.questions) ? quiz.questions : [];
    const quizOptions = Array.isArray(quiz.options)
        ? quiz.options
        : Array.isArray(quizQuestionsRaw[0]?.options)
            ? quizQuestionsRaw[0].options
            : [];
    const photoFact = story.photoFact && typeof story.photoFact === 'object' ? story.photoFact : {};
    const secondFact = story.secondFact && typeof story.secondFact === 'object' ? story.secondFact : {};
    const mapQuizQuestionSource = (q) => ({
        question: {
            uk: clean(q?.questionUk || ''),
            en: clean(q?.questionEn || q?.questionUk || ''),
        },
        hint: {
            uk: clean(q?.multiHintUk || ''),
            en: clean(q?.multiHintEn || q?.multiHintUk || ''),
        },
        options: (Array.isArray(q?.options) ? q.options : []).map((o) => ({
            text: {
                uk: clean(o?.textUk || ''),
                en: clean(o?.textEn || o?.textUk || ''),
            },
            correct: !!o?.correct,
        })),
    });
    const source = {
        title: { uk: titleUk, en: titleEn },
        desc: { uk: descUk, en: descEn },
        shortIntro: { uk: shortIntroUk, en: shortIntroEn },
        miniPreview: { uk: miniPreviewUk, en: miniPreviewEn },
        introPage1: { uk: introPage1Uk, en: introPage1En },
        pages: pagePairs,
        quiz: {
            ...mapQuizQuestionSource({
                questionUk: quiz.questionUk || quizQuestionsRaw[0]?.questionUk,
                questionEn: quiz.questionEn || quizQuestionsRaw[0]?.questionEn,
                multiHintUk: quiz.multiHintUk || quizQuestionsRaw[0]?.multiHintUk,
                multiHintEn: quiz.multiHintEn || quizQuestionsRaw[0]?.multiHintEn,
                options: quizOptions,
            }),
            questions: (quizQuestionsRaw.length ? quizQuestionsRaw : [quiz]).map(mapQuizQuestionSource),
        },
        photoFact: {
            title: {
                uk: clean(photoFact.titleUk || ''),
                en: clean(photoFact.titleEn || photoFact.titleUk || ''),
            },
            body: {
                uk: clean(photoFact.bodyUk || ''),
                en: clean(photoFact.bodyEn || photoFact.bodyUk || ''),
            },
        },
        secondFact: {
            title: {
                uk: clean(secondFact.titleUk || ''),
                en: clean(secondFact.titleEn || secondFact.titleUk || ''),
            },
            body: {
                uk: clean(secondFact.bodyUk || ''),
                en: clean(secondFact.bodyEn || secondFact.bodyUk || ''),
            },
        },
    };
    const merged = emptyGuideResult(pageCount, quizOptions.length);
    merged.title = { uk: titleUk, en: titleEn };
    merged.desc = { uk: descUk, en: descEn };
    merged.shortIntro = { uk: shortIntroUk, en: shortIntroEn };
    merged.miniPreview = { uk: miniPreviewUk, en: miniPreviewEn };
    merged.introPage1 = { uk: introPage1Uk, en: introPage1En };
    merged.pages = pagePairs.map((p) => ({ uk: p.uk, en: p.en }));
    merged.quiz.question = { ...source.quiz.question };
    merged.quiz.hint = { ...source.quiz.hint };
    merged.quiz.options = source.quiz.options.map((o) => ({
        text: { ...o.text },
        correct: o.correct,
    }));
    merged.quiz.questions = (source.quiz.questions || []).map((q) => ({
        question: { ...q.question },
        hint: { ...q.hint },
        options: (q.options || []).map((o) => ({
            text: { ...o.text },
            correct: o.correct,
        })),
    }));
    merged.photoFact = {
        title: { ...source.photoFact.title },
        body: { ...source.photoFact.body },
    };
    merged.secondFact = {
        title: { ...source.secondFact.title },
        body: { ...source.secondFact.body },
    };
    const targetLangs = LANDMARK_CONTENT_LANGS.filter((l) => l !== 'uk' && l !== 'en');
    // Small batches = better quality for long multi-page guides
    const batches = chunkLangs(targetLangs, 4);
    for (let bi = 0; bi < batches.length; bi += 1) {
        const batch = batches[bi];
        await opts?.onBatch?.(bi + 1, batches.length, batch);
        const part = await openaiTranslateGuideBatch(source, batch);
        if (!part)
            continue;
        merged.title = mergeLangMaps(merged.title, asLangMap(part.title));
        merged.desc = mergeLangMaps(merged.desc, asLangMap(part.desc));
        merged.shortIntro = mergeLangMaps(merged.shortIntro, asLangMap(part.shortIntro));
        merged.miniPreview = mergeLangMaps(merged.miniPreview, asLangMap(part.miniPreview));
        merged.introPage1 = mergeLangMaps(merged.introPage1, asLangMap(part.introPage1));
        if (Array.isArray(part.pages)) {
            part.pages.forEach((pageMap, i) => {
                if (!merged.pages[i])
                    merged.pages[i] = {};
                merged.pages[i] = mergeLangMaps(merged.pages[i], asLangMap(pageMap));
            });
        }
        if (part.quiz && typeof part.quiz === 'object') {
            merged.quiz.question = mergeLangMaps(merged.quiz.question, asLangMap(part.quiz.question));
            merged.quiz.hint = mergeLangMaps(merged.quiz.hint, asLangMap(part.quiz.hint));
            const optsQuiz = Array.isArray(part.quiz.options) ? part.quiz.options : [];
            optsQuiz.forEach((o, i) => {
                if (!merged.quiz.options[i]) {
                    merged.quiz.options[i] = {
                        text: {},
                        correct: !!source.quiz.options[i]?.correct,
                    };
                }
                merged.quiz.options[i].text = mergeLangMaps(merged.quiz.options[i].text, asLangMap(o?.text));
                if (typeof o?.correct === 'boolean')
                    merged.quiz.options[i].correct = o.correct;
            });
            const partQuestions = Array.isArray(part.quiz.questions) ? part.quiz.questions : [];
            partQuestions.forEach((pq, qi) => {
                if (!merged.quiz.questions)
                    merged.quiz.questions = [];
                if (!merged.quiz.questions[qi]) {
                    const srcQ = source.quiz.questions?.[qi];
                    merged.quiz.questions[qi] = {
                        question: { ...(srcQ?.question || {}) },
                        hint: { ...(srcQ?.hint || {}) },
                        options: (srcQ?.options || []).map((o) => ({
                            text: { ...o.text },
                            correct: o.correct,
                        })),
                    };
                }
                const mq = merged.quiz.questions[qi];
                mq.question = mergeLangMaps(mq.question, asLangMap(pq?.question));
                mq.hint = mergeLangMaps(mq.hint, asLangMap(pq?.hint));
                const pqOpts = Array.isArray(pq?.options) ? pq.options : [];
                pqOpts.forEach((o, oi) => {
                    if (!mq.options[oi]) {
                        mq.options[oi] = {
                            text: {},
                            correct: !!source.quiz.questions?.[qi]?.options?.[oi]?.correct,
                        };
                    }
                    mq.options[oi].text = mergeLangMaps(mq.options[oi].text, asLangMap(o?.text));
                    if (typeof o?.correct === 'boolean')
                        mq.options[oi].correct = o.correct;
                });
            });
        }
        if (part.photoFact && typeof part.photoFact === 'object') {
            merged.photoFact.title = mergeLangMaps(merged.photoFact.title, asLangMap(part.photoFact.title));
            merged.photoFact.body = mergeLangMaps(merged.photoFact.body, asLangMap(part.photoFact.body));
        }
        if (part.secondFact && typeof part.secondFact === 'object') {
            merged.secondFact.title = mergeLangMaps(merged.secondFact.title, asLangMap(part.secondFact.title));
            merged.secondFact.body = mergeLangMaps(merged.secondFact.body, asLangMap(part.secondFact.body));
        }
    }
    const titleI18n = fillFromFallback(merged.title, titleEn, titleUk);
    const descI18n = fillFromFallback(merged.desc, descEn, descUk);
    const shortIntroI18n = fillFromFallback(merged.shortIntro, shortIntroEn, shortIntroUk);
    const miniPreviewI18n = fillFromFallback(merged.miniPreview, miniPreviewEn, miniPreviewUk);
    const introPage1I18n = fillFromFallback(merged.introPage1, introPage1En || introPage1Uk, introPage1Uk || introPage1En);
    const introPagesBodiesI18n = merged.pages.map((pageMap, i) => fillFromFallback(pageMap, pagePairs[i]?.en || '', pagePairs[i]?.uk || ''));
    const stripParen = (s) => String(s || '')
        .replace(/\s*[\(（][^)）]{0,48}[\)）]\s*$/u, '')
        .replace(/\s+/g, ' ')
        .trim();
    for (const lang of LANDMARK_CONTENT_LANGS) {
        if (titleI18n[lang])
            titleI18n[lang] = stripParen(titleI18n[lang]) || titleI18n[lang];
    }
    next.titleI18n = titleI18n;
    next.descI18n = descI18n;
    next.titleUk = stripParen(titleI18n.uk || titleUk) || titleUk;
    next.titleEn = stripParen(titleI18n.en || titleEn) || titleEn;
    next.descUk = descI18n.uk || descUk;
    next.descEn = descI18n.en || descEn;
    const quizNext = {
        ...quiz,
        questionUk: merged.quiz.question.uk || source.quiz.question.uk,
        questionEn: merged.quiz.question.en || source.quiz.question.en,
        multiHintUk: merged.quiz.hint.uk || source.quiz.hint.uk,
        multiHintEn: merged.quiz.hint.en || source.quiz.hint.en,
        questionI18n: fillFromFallback(merged.quiz.question, source.quiz.question.en, source.quiz.question.uk),
        multiHintI18n: fillFromFallback(merged.quiz.hint, source.quiz.hint.en, source.quiz.hint.uk),
        options: quizOptions.map((o, i) => {
            const textMap = fillFromFallback(merged.quiz.options[i]?.text || {}, source.quiz.options[i]?.text.en || '', source.quiz.options[i]?.text.uk || '');
            return {
                ...o,
                textUk: textMap.uk || o?.textUk || '',
                textEn: textMap.en || o?.textEn || '',
                correct: merged.quiz.options[i]?.correct ?? !!o?.correct,
                textI18n: textMap,
            };
        }),
        questions: (source.quiz.questions || []).map((srcQ, qi) => {
            const mq = merged.quiz.questions?.[qi];
            const rawQ = quizQuestionsRaw[qi] || {};
            const questionI18n = fillFromFallback(mq?.question || {}, srcQ.question.en, srcQ.question.uk);
            const multiHintI18n = fillFromFallback(mq?.hint || {}, srcQ.hint.en, srcQ.hint.uk);
            return {
                ...rawQ,
                questionUk: questionI18n.uk || srcQ.question.uk || rawQ.questionUk || '',
                questionEn: questionI18n.en || srcQ.question.en || rawQ.questionEn || '',
                multiHintUk: multiHintI18n.uk || srcQ.hint.uk || rawQ.multiHintUk || '',
                multiHintEn: multiHintI18n.en || srcQ.hint.en || rawQ.multiHintEn || '',
                questionI18n,
                multiHintI18n,
                options: (srcQ.options || []).map((o, oi) => {
                    const textMap = fillFromFallback(mq?.options?.[oi]?.text || {}, o.text.en || '', o.text.uk || '');
                    const rawOpt = Array.isArray(rawQ.options) ? rawQ.options[oi] : {};
                    return {
                        ...rawOpt,
                        textUk: textMap.uk || o.text.uk || '',
                        textEn: textMap.en || o.text.en || '',
                        correct: mq?.options?.[oi]?.correct ?? o.correct,
                        textI18n: textMap,
                    };
                }),
            };
        }),
    };
    next.story = {
        ...story,
        shortIntroUk: shortIntroI18n.uk || shortIntroUk,
        shortIntroEn: shortIntroI18n.en || shortIntroEn,
        miniPreviewUk: miniPreviewI18n.uk || miniPreviewUk,
        miniPreviewEn: miniPreviewI18n.en || miniPreviewEn,
        introPage1Uk: introPage1I18n.uk || introPage1Uk,
        introPage1En: introPage1I18n.en || introPage1En,
        shortIntroI18n,
        miniPreviewI18n,
        introPage1I18n,
        introPagesBodiesI18n,
        quiz: quizNext,
        photoFact: {
            ...photoFact,
            titleUk: merged.photoFact.title.uk || source.photoFact.title.uk,
            titleEn: merged.photoFact.title.en || source.photoFact.title.en,
            bodyUk: merged.photoFact.body.uk || source.photoFact.body.uk,
            bodyEn: merged.photoFact.body.en || source.photoFact.body.en,
            titleI18n: fillFromFallback(merged.photoFact.title, source.photoFact.title.en, source.photoFact.title.uk),
            bodyI18n: fillFromFallback(merged.photoFact.body, source.photoFact.body.en, source.photoFact.body.uk),
        },
        secondFact: {
            ...secondFact,
            titleUk: merged.secondFact.title.uk || source.secondFact.title.uk,
            titleEn: merged.secondFact.title.en || source.secondFact.title.en,
            bodyUk: merged.secondFact.body.uk || source.secondFact.body.uk,
            bodyEn: merged.secondFact.body.en || source.secondFact.body.en,
            titleI18n: fillFromFallback(merged.secondFact.title, source.secondFact.title.en, source.secondFact.title.uk),
            bodyI18n: fillFromFallback(merged.secondFact.body, source.secondFact.body.en, source.secondFact.body.uk),
        },
    };
    const translatedLangs = LANDMARK_CONTENT_LANGS.filter((l) => l !== 'uk' && l !== 'en' && clean(titleI18n[l]) && clean(titleI18n[l]) !== titleEn);
    console.info(`[landmarkTranslate] localized «${next.titleEn || next.titleUk}»: ${translatedLangs.length + 2}/${LANDMARK_CONTENT_LANGS.length} langs, ${introPagesBodiesI18n.length} pages`);
    return next;
}
/**
 * ChatGPT / Claude: rewritten travel-guide copy — rich 2–3 paragraphs per page,
 * surprising real facts (never Wikipedia paste, never invented history).
 */
export async function openaiBuildLandmarkGuide(input) {
    if (landmarkGuideUsesClaude()) {
        const claude = await claudeBuildLandmarkGuide(input);
        if (claude)
            return claude;
    }
    return openaiBuildLandmarkGuideViaOpenAI(input);
}
function landmarkGuideSystemPrompt() {
    return [
        'You write landmark audio-guide copy for a travel app (KRAЇNA).',
        'Gold standard: the same cinematic multi-page experience as the St Nicholas Cathedral (Kyiv) guide — dense true facts, unique photos implied, zero UI chrome talk.',
        'Return ONLY valid JSON (no markdown fences).',
        'Rules:',
        '- Titles WITHOUT city in parentheses (not "Church (Kyiv)", just the landmark name).',
        '- CRITICAL: REWRITE completely in your own words. NEVER copy Wikipedia sentences, phrasing, or paragraph structure.',
        '- NO Wikipedia markup: no == headings ==, no --- lines, no wiki links, no bullet spam.',
        '- NO repeated paragraphs across pages. Every page must have NEW unique content.',
        '- CRITICAL ANTI-REPEAT: Never reuse the same sentence, anecdote, or fact cluster on two pages. If you already said an architect/year/style on page 1, later pages must add DIFFERENT details.',
        '- Tone: a brilliant local storyteller walking beside the traveler — warm, vivid, cinematic. Not a dry encyclopedia.',
        '- Tell a FULL interesting history across the pages: founding, builders, architecture, people, scandals, rituals, political turns, restorations, and how the place lives today.',
        '- If sources document war, shelling, missile strikes, fires, scaffolding, or damage (e.g. 2022+ in Ukraine), you MUST include those TRUE facts on at least one dedicated page — honest, respectful, specific (dates/what was hit when known). Do NOT invent war damage. Do NOT skip it when sources mention it.',
        '- Prefer "wow" FACTS that most tourists miss: odd measurements, near-misses, rivalries, hidden architectural details, surprising people, acoustic quirks, political twists — as long as they are TRUE and grounded in the sources.',
        '- DENSITY (critical — phone screens look EMPTY with short copy): EVERY page must feel packed. Minimum ~5 concrete facts per page (dates, names, numbers, materials, what changed, what a visitor notices). NEVER ship a page with only 1–2 sentences.',
        '- Use ALL provided source blocks (main encyclopedia + related articles + Wikidata events). Cross-check; never invent dates, names, battles, miracles, or quotes.',
        '- If sources are thin, expand with honest atmosphere and what a visitor can notice on site — still never fabricate history.',
        '- EACH story page body (pagesUk/pagesEn items): EXACTLY 5 paragraphs separated by blank lines (minimum 4, maximum 6). Never a single short paragraph.',
        '- Each paragraph: 2–5 full sentences with at least one concrete fact or sensory detail. Aim ~900–1400 characters per page body (hard floor ~700).',
        '- page1 (introPage1*): FULL welcome screen — EXACTLY 5 rich paragraphs (blank-line separated, min 4). Hook with uniqueness, where the visitor stands, builders/era, architecture details, one vivid surprise. FORBIDDEN: a 2-sentence Wikipedia stub that leaves empty white space.',
        '- NEVER start any page with a section title/label like "Історичний контекст", "Historic context", "Interesting facts", "Then and now". Begin directly with the narrative.',
        '- NEVER break a sentence across paragraphs. Initials like "С. Валовський" / "W. Horodecki" stay on one line with the full name. No list-like mid-sentence wraps.',
        '- FORBIDDEN META / UI COPY anywhere: no "tap the audio guide", "увімкніть аудіогід", "Save or share", "open Sources", "compare the photos above", "photo gallery", "thank you for reading", emoji pointing at chrome, or app navigation instructions. Headphones and Sources already exist in the UI.',
        '- FORBIDDEN FILLER: never "Це місце варто побачити на власні очі", "Stop for a moment…", or generic tourist fluff without a concrete fact.',
        '- pages = exactly 12 more unique sections — each with NEW facts not repeated from other pages.',
        '- pages[1] (story screen 3) MUST be then-and-now: how the place looked historically vs today (names, eras, what changed) — sits under a vertical before/after photo slider. Still 5 rich paragraphs. Do NOT tell the user to "compare the slider".',
        '- Other pages: architecture secrets, people, documented legends, cultural meaning, war/damage/restoration when sourced, today\'s life of the place, visit atmosphere, closing wow detail — each page must introduce NEW real facts.',
        '- When mentioning a real historical person (architect, founder, ruler, artist…), wrap THEIR FULL PERSONAL NAME only in double asterisks like **Władysław Horodecki** / **Владислав Городецький**.',
        '- NEVER wrap street names, addresses, place names, building names, or adjectives in **...**. Only real people.',
        '- Also return people[]: ONLY those real persons (nameUk + nameEn). No streets, no landmarks, no city names.',
        '- quiz: EXACTLY 3 engaging multiple-choice questions (questions[]), each with exactly 4 REAL options and exactly one correct. Prefer thought-provoking questions (architecture quirks, people, motives, surprising dates, what a visitor should notice) — NOT trivial "what is the name of this place?" / "how is this place called?".',
        '- QUIZ RULES: every correct answer MUST appear as one of the 4 options; hints MUST include that same correct fact (name/year/style); no duplicate questions; no placeholder options like "Option 3"; answers must be grounded in the guide text you wrote.',
        '- QUIZ UI CONSTRAINTS (critical): questionUk/questionEn max ~80 characters; each option textUk/textEn max ~36 characters. Short punchy wording so everything fits on one phone screen without shrinking.',
        '- Ukrainian and English both required; pagesUk[i] and pagesEn[i] must cover the same ideas.',
    ].join('\n');
}
function landmarkGuideUserPayload(input) {
    return JSON.stringify({
        landmark: {
            titleUk: input.titleUk,
            titleEn: input.titleEn,
            cityUk: input.cityUk || '',
            cityEn: input.cityEn || '',
        },
        sources_for_facts_only: {
            // Main page + related war/restoration/history blocks + Wikidata
            extractUk: clean(input.extractUk).slice(0, 22000),
            extractEn: clean(input.extractEn).slice(0, 22000),
        },
        instruction: 'Write a LONG rich multi-page TRUE story matching St Nicholas Cathedral (Kyiv) quality: cinematic, fact-dense, unique pages, no UI/meta CTAs. Every page ~900–1400 chars, 5 paragraphs, many concrete facts from the sources (dates, names, numbers, materials, what changed). Include war damage / shelling / restoration when present. Never invent. Absolutely no thin stub pages — phone screens must feel full of text.',
        required_shape: {
            titleUk: 'string',
            titleEn: 'string',
            descUk: 'string max ~700 chars, rewritten, vivid, fact-packed',
            descEn: 'string, rewritten, fact-packed',
            shortIntroUk: 'string, rewritten',
            shortIntroEn: 'string, rewritten',
            miniPreviewUk: 'string max 180',
            miniPreviewEn: 'string max 180',
            introPage1Uk: '5 rich paragraphs (~900–1400 chars total) with many concrete facts, blank-line separated',
            introPage1En: '5 rich paragraphs (~900–1400 chars total) with many concrete facts, blank-line separated',
            pagesUk: [
                '12 strings; EACH must be 5 paragraphs (min 4) with blank lines; many surprising TRUE facts; person names in **bold**; include war/damage page when sourced; ~900–1400 chars each',
            ],
            pagesEn: [
                '12 strings; EACH must be 5 paragraphs (min 4) with blank lines; many surprising TRUE facts; person names in **bold**; include war/damage page when sourced; ~900–1400 chars each',
            ],
            people: [{ nameUk: 'string', nameEn: 'string' }],
            quiz: {
                xpPerCorrect: 5,
                questions: [
                    {
                        questionUk: 'string max 80 chars — thought-provoking',
                        questionEn: 'string max 80 chars — thought-provoking',
                        options: [
                            {
                                textUk: 'string max 36 chars',
                                textEn: 'string max 36 chars',
                                correct: true,
                            },
                        ],
                        multiHintUk: 'string max 120 — must match the correct option',
                        multiHintEn: 'string max 120 — must match the correct option',
                    },
                    {
                        questionUk: '2nd distinct question',
                        questionEn: '2nd distinct question',
                        options: [{ textUk: '...', textEn: '...', correct: true }],
                        multiHintUk: '...',
                        multiHintEn: '...',
                    },
                    {
                        questionUk: '3rd distinct question',
                        questionEn: '3rd distinct question',
                        options: [{ textUk: '...', textEn: '...', correct: true }],
                        multiHintUk: '...',
                        multiHintEn: '...',
                    },
                ],
            },
        },
    });
}
function parseLandmarkGuideJson(text, input) {
    const parsed = parseJsonObject(text);
    if (!parsed)
        return null;
    const pagesUk = Array.isArray(parsed?.pagesUk)
        ? parsed.pagesUk
            .map((x) => ensureMinGuideParagraphs(stripGuideSectionLead(clean(x)), 5, 6))
            .filter(Boolean)
        : [];
    const pagesEn = Array.isArray(parsed?.pagesEn)
        ? parsed.pagesEn
            .map((x) => ensureMinGuideParagraphs(stripGuideSectionLead(clean(x)), 5, 6))
            .filter(Boolean)
        : [];
    while (pagesUk.length < 12)
        pagesUk.push('');
    while (pagesEn.length < 12)
        pagesEn.push('');
    const quizRaw = parsed?.quiz && typeof parsed.quiz === 'object' ? parsed.quiz : null;
    const normalizeQuizOptions = (rawOptions) => {
        const options = Array.isArray(rawOptions)
            ? rawOptions
                .map((o) => ({
                textUk: clean(o?.textUk || o?.textEn).slice(0, 42),
                textEn: clean(o?.textEn || o?.textUk).slice(0, 42),
                correct: !!o?.correct,
            }))
                .filter((o) => (o.textUk || o.textEn) &&
                !/^(варіант|вариант|option)\s*\d+$/i.test(o.textUk) &&
                !/^(варіант|вариант|option)\s*\d+$/i.test(o.textEn))
                .slice(0, 4)
            : [];
        if (options.length !== 4)
            return [];
        const correctCount = options.filter((o) => o.correct).length;
        if (correctCount === 0)
            options[0].correct = true;
        if (correctCount > 1) {
            let seen = false;
            for (const o of options) {
                if (o.correct && seen)
                    o.correct = false;
                else if (o.correct)
                    seen = true;
            }
        }
        return options;
    };
    const normalizeOneQuizQuestion = (rawQ) => {
        if (!rawQ || typeof rawQ !== 'object')
            return null;
        const options = normalizeQuizOptions(rawQ.options);
        if (options.length !== 4)
            return null;
        const questionUk = clean(rawQ.questionUk || rawQ.questionEn).slice(0, 90);
        const questionEn = clean(rawQ.questionEn || rawQ.questionUk).slice(0, 90);
        if (!questionUk && !questionEn)
            return null;
        if (/як називається ця локація|what is the name of this location/i.test(`${questionUk} ${questionEn}`)) {
            return null;
        }
        const correct = options.find((o) => o.correct);
        let multiHintUk = clean(rawQ.multiHintUk || '').slice(0, 140);
        let multiHintEn = clean(rawQ.multiHintEn || '').slice(0, 140);
        const correctUk = correct.textUk || correct.textEn;
        const correctEn = correct.textEn || correct.textUk;
        if (!multiHintUk && correctUk)
            multiHintUk = `Правильна відповідь: **${correctUk}**.`;
        if (!multiHintEn && correctEn)
            multiHintEn = `Correct answer: **${correctEn}**.`;
        return {
            questionUk,
            questionEn,
            options,
            multiHintUk,
            multiHintEn,
        };
    };
    const questionsFromAi = [];
    if (Array.isArray(quizRaw?.questions)) {
        for (const q of quizRaw.questions) {
            const n = normalizeOneQuizQuestion(q);
            if (n)
                questionsFromAi.push(n);
            if (questionsFromAi.length >= 3)
                break;
        }
    }
    if (!questionsFromAi.length) {
        const legacy = normalizeOneQuizQuestion(quizRaw);
        if (legacy)
            questionsFromAi.push(legacy);
    }
    const PLACE_OR_NON_PERSON_RE = /\b(вул(?:иця|иці|ицею|ицю)?|просп(?:ект|екті|екту)?|площа|площі|майдан|набережн\w*|перевулок|alley|street|st\.|ave\.|avenue|road|square|plaza|park|парк|сад|монастир|церкв\w*|костел|собор|храм|каплиц\w*|castle|palace|museum|музей|міст|bridge|район|область|країна|city|місто|город|київ|kyiv)\b/i;
    const isLikelyPerson = (n) => {
        const t = clean(n);
        if (t.length < 5 || t.length > 72)
            return false;
        if (PLACE_OR_NON_PERSON_RE.test(t))
            return false;
        const words = t.split(/\s+/).filter(Boolean);
        if (words.length < 2 || words.length > 5)
            return false;
        const caps = words.filter((w) => /^[A-ZА-ЯІЇЄҐ]/.test(w)).length;
        if (caps < 2)
            return false;
        return words.some((w) => /^[A-ZА-ЯІЇЄҐ][a-zа-яіїєґ''-]{2,}$/u.test(w) &&
            !/ській|цькій|ська|цька|ський|цький$/i.test(w));
    };
    const peopleRaw = Array.isArray(parsed?.people) ? parsed.people : [];
    const people = peopleRaw
        .map((p) => ({
        nameUk: clean(p?.nameUk || p?.nameEn),
        nameEn: clean(p?.nameEn || p?.nameUk),
    }))
        .filter((p) => isLikelyPerson(p.nameUk) || isLikelyPerson(p.nameEn))
        .slice(0, 12);
    const boldRe = /\*\*([^*]{4,64})\*\*/g;
    const harvest = `${parsed?.introPage1Uk || ''}\n${pagesUk.join('\n')}\n${pagesEn.join('\n')}`;
    let bm;
    while ((bm = boldRe.exec(harvest)) !== null) {
        const n = clean(bm[1]);
        if (!isLikelyPerson(n))
            continue;
        if (!people.some((p) => p.nameUk === n || p.nameEn === n)) {
            people.push({ nameUk: n, nameEn: n });
        }
    }
    return {
        titleUk: clean(parsed?.titleUk) || clean(input.titleUk),
        titleEn: clean(parsed?.titleEn) || clean(input.titleEn),
        descUk: ensureMinGuideParagraphs(clean(parsed?.descUk), 2, 3).slice(0, 900),
        descEn: ensureMinGuideParagraphs(clean(parsed?.descEn), 2, 3).slice(0, 900),
        shortIntroUk: ensureMinGuideParagraphs(clean(parsed?.shortIntroUk), 2, 2).slice(0, 600),
        shortIntroEn: ensureMinGuideParagraphs(clean(parsed?.shortIntroEn), 2, 2).slice(0, 600),
        miniPreviewUk: clean(parsed?.miniPreviewUk).slice(0, 180),
        miniPreviewEn: clean(parsed?.miniPreviewEn).slice(0, 180),
        introPage1Uk: ensureMinGuideParagraphs(stripGuideSectionLead(clean(parsed?.introPage1Uk)), 5, 6),
        introPage1En: ensureMinGuideParagraphs(stripGuideSectionLead(clean(parsed?.introPage1En)), 5, 6),
        pagesUk: pagesUk.slice(0, 12),
        pagesEn: pagesEn.slice(0, 12),
        people: people.slice(0, 24),
        quiz: questionsFromAi.length > 0
            ? {
                ...questionsFromAi[0],
                questions: questionsFromAi.slice(0, 3),
                xpPerCorrect: 5,
            }
            : null,
    };
}
async function claudeBuildLandmarkGuide(input) {
    const apiKey = claudeConfig.apiKey;
    if (!apiKey)
        return null;
    const url = `${claudeConfig.baseUrl}/v1/messages`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 180000);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': claudeConfig.apiVersion,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: claudeConfig.model,
                max_tokens: 20000,
                temperature: 0.8,
                system: landmarkGuideSystemPrompt(),
                messages: [{ role: 'user', content: landmarkGuideUserPayload(input) }],
            }),
            signal: ac.signal,
        });
        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            console.warn('[landmarkGuide] Claude failed', res.status, errText.slice(0, 240));
            return null;
        }
        const json = (await res.json());
        const text = Array.isArray(json?.content)
            ? json.content
                .filter((b) => b?.type === 'text')
                .map((b) => String(b?.text || ''))
                .join('\n')
                .trim()
            : '';
        return parseLandmarkGuideJson(text, input);
    }
    catch (e) {
        console.warn('[landmarkGuide] Claude error', e);
        return null;
    }
    finally {
        clearTimeout(timer);
    }
}
async function openaiBuildLandmarkGuideViaOpenAI(input) {
    const apiKey = aiRouteConfig.apiKey;
    if (!apiKey)
        return null;
    const payload = {
        model: aiRouteConfig.model || 'gpt-4o-mini',
        temperature: 0.8,
        max_tokens: 16000,
        response_format: { type: 'json_object' },
        messages: [
            { role: 'system', content: landmarkGuideSystemPrompt() },
            { role: 'user', content: landmarkGuideUserPayload(input) },
        ],
    };
    const url = `${aiRouteConfig.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 150000);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: ac.signal,
        });
        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            console.warn('[landmarkGuide] OpenAI failed', res.status, errText.slice(0, 240));
            return null;
        }
        const json = (await res.json());
        const text = String(json?.choices?.[0]?.message?.content || '').trim();
        return parseLandmarkGuideJson(text, input);
    }
    catch (e) {
        console.warn('[landmarkGuide] OpenAI error', e);
        return null;
    }
    finally {
        clearTimeout(timer);
    }
}
//# sourceMappingURL=locationAiTranslateService.js.map