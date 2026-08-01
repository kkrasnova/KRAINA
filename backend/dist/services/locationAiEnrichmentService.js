import { rehostLandmarkMediaFields, generateLandmarkStoryPageImages, generateLandmarkHistoricCompareImage, rankImagesForHero, isUnattractiveLandmarkPhotoUrl, isJunkLandmarkPhotoUrl, isNonPhotoJunkUrl, isDocumentaryDamagePhotoUrl, pickBestHistoricPhoto, scoreHistoricPhotoUrl, } from './locationAiImageRehostService.js';
import { localizeLandmarkForAllAppLanguages, openaiBuildLandmarkGuide, ensureMinGuideParagraphs, clampGuideParagraphs, normalizeGuideProse, splitGuideSentences, } from './locationAiTranslateService.js';
import { landmarkGuideUsesClaude } from '../config.js';
const UA = 'KRAINA-LocationEnrichment/1.0 (admin verified-source import)';
/** 12 labels for slides 2–13 (page 1 is welcome). */
const SLIDE_LABELS_UK = [
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
];
const SLIDE_LABELS_EN = [
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
];
/** Page index 1 = UI story page 3 — St Nicholas / Maidan vertical before/after slider. */
const COMPARE_PAGE3_LAYOUT = {
    compareHeroHeightRatio: 0.6,
    compareHeroHeightMax: 540,
    compareHeroTopInset: 22,
    introCompareRounded: true,
    heroStackGap: 22,
    heroFit: 'cover',
    compareBeforePosition: { left: '50%', top: '42%' },
    compareAfterPosition: { left: '50%', top: '42%' },
};
/**
 * Gold-standard intro layouts (St Nicholas cathedral recipe).
 * Every page pins heroFit:cover — full-bleed beautiful photos, never letterboxed contain.
 * Rhythm: inset → compare → bleed tower → dual photo → insets → afterText → bleed → fact card → finale.
 */
const INTRO_PAGE_LAYOUTS = [
    {
        heroFit: 'cover',
        heroHeightRatio: 0.4,
        heroHeightMax: 340,
        introHeroInsetRounded: true,
        heroStackGap: 22,
    },
    { ...COMPARE_PAGE3_LAYOUT },
    { heroFit: 'cover', introHeroBleedTop: true },
    {
        heroFit: 'cover',
        introHeroBleedTop: true,
        heroHeightRatio: 0.68,
        heroHeightMax: 600,
        heroPosition: { left: '72%', top: '50%' },
    },
    {
        heroFit: 'cover',
        introHeroBleedTop: true,
        heroHeightRatio: 0.48,
        heroHeightMax: 400,
        heroPosition: { left: '50%', top: '34%' },
        secondaryStackGap: 0,
        secondaryHeroPosition: { left: '50%', top: '40%' },
        secondaryHeroHeightRatio: 0.3,
        secondaryHeroHeightMax: 260,
    },
    {
        heroFit: 'cover',
        introHeroInsetRounded: true,
        heroHeightRatio: 0.42,
        heroHeightMax: 360,
        heroStackGap: 18,
    },
    {
        heroFit: 'cover',
        introHeroInsetRounded: true,
        heroHeightRatio: 0.42,
        heroHeightMax: 360,
        heroStackGap: 18,
    },
    {
        heroFit: 'cover',
        introHeroAfterText: true,
        heroHeightRatio: 0.5,
        heroHeightMax: 420,
        introHeroInsetRounded: true,
    },
    {
        heroFit: 'cover',
        introHeroBleedTop: true,
        heroHeightRatio: 0.44,
        heroHeightMax: 380,
        secondaryStackGap: 12,
        secondaryHeroHeightRatio: 0.28,
        secondaryHeroHeightMax: 240,
    },
    {
        heroFit: 'cover',
        introFactCard: true,
        introHeroBleedTop: true,
        heroHeightRatio: 0.55,
        heroHeightMax: 480,
    },
    {
        heroFit: 'cover',
        introHeroInsetRounded: true,
        heroHeightRatio: 0.36,
        heroHeightMax: 300,
        heroStackGap: 16,
        introHeroBleedTop: true,
    },
    {
        heroFit: 'cover',
        introHeroInsetRounded: true,
        heroHeightRatio: 0.38,
        heroHeightMax: 320,
        heroStackGap: 20,
    },
];
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
async function withTimeout(promise, ms, fallback, label = 'step') {
    let timer;
    const guarded = Promise.resolve(promise).then((v) => v, (err) => {
        console.warn(`[enrich] ${label} error:`, err?.message || err);
        return fallback;
    });
    try {
        return await Promise.race([
            guarded,
            new Promise((resolve) => {
                timer = setTimeout(() => {
                    console.warn(`[enrich] timeout ${ms}ms: ${label}`);
                    resolve(fallback);
                }, ms);
            }),
        ]);
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
function nowIso() {
    return new Date().toISOString();
}
function previewText(s, max = 420) {
    const t = String(s || '')
        .replace(/\s+/g, ' ')
        .trim();
    if (t.length <= max)
        return t;
    return `${t.slice(0, max)}…`;
}
async function fetchJson(url, retries = 4) {
    for (let attempt = 0; attempt < retries; attempt += 1) {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 12000);
        try {
            const res = await fetch(url, {
                headers: { 'User-Agent': UA, Accept: 'application/json' },
                signal: ac.signal,
            });
            if (res.status === 429) {
                await sleep(1200 * (attempt + 1));
                continue;
            }
            if (!res.ok)
                return null;
            return await res.json();
        }
        catch {
            await sleep(500 * (attempt + 1));
        }
        finally {
            clearTimeout(timer);
        }
    }
    return null;
}
function normalizeWikiTitle(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zа-яіїєґ0-9]+/gi, ' ')
        .trim();
}
function slugifyId(s) {
    const base = String(s || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/['’`]/g, '')
        .replace(/[^a-z0-9а-яіїєґ]+/gi, '_')
        .replace(/^_+|_+$/g, '');
    const ascii = base.replace(/[^a-z0-9_]/g, '');
    return ascii || `lm_${Date.now().toString(36)}`;
}
function titleWords(s) {
    // Drop saint/generic glue so "Святого Миколая" → distinctive "миколая",
    // and "St. Nicholas Church" keeps church + nicholas.
    const stop = new Set([
        'the',
        'of',
        'and',
        'in',
        'city',
        'місто',
        'город',
        'вул',
        'вулиця',
        'saint',
        'saints',
        'st',
        'ste',
        'holy',
        'святого',
        'святої',
        'святий',
        'свята',
        'святих',
        'святе',
        'імені',
        'имени',
        'named',
        'roman',
        'catholic',
        'римо',
        'католицький',
        'католицька',
    ]);
    return normalizeWikiTitle(s)
        .split(/\s+/)
        .filter((w) => w.length > 2 && !stop.has(w));
}
/** Landmark facility types — query type must not resolve to a conflicting type. */
const PLACE_TYPE_GROUPS = [
    {
        id: 'church',
        keys: [
            'костел',
            'церква',
            'собор',
            'храм',
            'каплиця',
            'монастир',
            'лавра',
            'church',
            'cathedral',
            'chapel',
            'basilica',
            'abbey',
            'monastery',
            'kirk',
            'temple',
        ],
        anti: ['площа', 'майдан', 'square', 'plaza', 'парк', 'park', 'вулиця', 'street', 'міст', 'bridge', 'музей', 'museum', 'памятник', 'monument'],
    },
    {
        id: 'square',
        keys: ['площа', 'майдан', 'square', 'plaza'],
        anti: ['костел', 'церква', 'собор', 'храм', 'church', 'cathedral', 'chapel', 'монастир', 'monastery'],
    },
    {
        id: 'museum',
        keys: ['музей', 'museum', 'галерея', 'gallery'],
        anti: ['площа', 'майдан', 'square', 'костел', 'церква', 'church', 'cathedral'],
    },
    {
        id: 'monument',
        keys: ['памятник', 'monument', 'statue', 'монумент'],
        anti: ['площа', 'майдан', 'square', 'костел', 'церква', 'church', 'cathedral', 'музей', 'museum'],
    },
    {
        id: 'park',
        keys: ['парк', 'park', 'сад', 'garden'],
        anti: ['костел', 'церква', 'church', 'cathedral', 'музей', 'museum'],
    },
];
function detectPlaceTypeIds(text) {
    const n = normalizeWikiTitle(text);
    return PLACE_TYPE_GROUPS.filter((g) => g.keys.some((k) => n.includes(k))).map((g) => g.id);
}
function typeMismatchPenalty(queryName, pageTitle) {
    const qTypes = detectPlaceTypeIds(queryName);
    if (!qTypes.length)
        return 0;
    const titleNorm = normalizeWikiTitle(pageTitle);
    const titleTypes = detectPlaceTypeIds(pageTitle);
    let penalty = 0;
    for (const id of qTypes) {
        const group = PLACE_TYPE_GROUPS.find((g) => g.id === id);
        if (!group)
            continue;
        // Avoid \\b — it does not work with Cyrillic in JS regex.
        if (group.anti.some((a) => titleNorm.includes(a)))
            penalty -= 200;
        if (titleTypes.includes(id) || group.keys.some((k) => titleNorm.includes(k))) {
            penalty += 90;
        }
        else if (titleTypes.length && !titleTypes.some((t) => qTypes.includes(t))) {
            penalty -= 120;
        }
    }
    return penalty;
}
function nameTitleCoverage(nameWords, titleNorm) {
    if (!nameWords.length)
        return 1;
    const hits = nameWords.filter((w) => titleNorm.includes(w)).length;
    return hits / nameWords.length;
}
/** Known city aliases so "Київ" matches Kyiv/Kiev in EN titles/extracts. */
const CITY_ALIAS_GROUPS = [
    ['київ', 'kyiv', 'kiev', 'киев'],
    ['варшава', 'warsaw', 'warszawa'],
    ['львів', 'lviv', 'lwow', 'лемберг'],
    ['одеса', 'odessa', 'odesa'],
    ['харків', 'kharkiv', 'kharkov'],
    ['berlin', 'берлін', 'berlin'],
    ['paris', 'париж', 'paris'],
    ['rome', 'рим', 'roma', 'rome'],
    ['prague', 'прага', 'praha'],
    ['budapest', 'будапешт'],
    ['vienna', 'відень', 'wien'],
    ['amsterdam', 'амстердам'],
    ['madrid', 'мадрид'],
    ['lisbon', 'лісабон', 'lisboa'],
    ['london', 'лондон'],
    ['stockholm', 'стокгольм'],
    ['helsinki', 'гельсінкі'],
    ['athens', 'афіни', 'athina'],
    ['bucharest', 'бухарест', 'bucuresti'],
    ['sofia', 'софія'],
    ['belgrade', 'белград', 'beograd'],
    ['zagreb', 'загреб'],
    ['bratislava', 'братислава'],
    ['vilnius', 'вільнюс'],
    ['riga', 'рига'],
    ['tallinn', 'таллінн'],
    ['yerevan', 'єреван', 'ереван'],
];
function expandPlaceTokens(city, country) {
    const seeds = [city, country].map((x) => normalizeWikiTitle(x)).filter(Boolean);
    const out = new Set(seeds);
    for (const seed of seeds) {
        for (const group of CITY_ALIAS_GROUPS) {
            if (group.some((a) => seed === a || seed.includes(a) || a.includes(seed))) {
                group.forEach((a) => out.add(a));
            }
        }
    }
    return [...out];
}
/** Title forms for "Name (City)" lookups — prefer real Wikipedia casing. */
function cityTitleForms(city, placeTokens) {
    const preferred = [];
    const push = (s) => {
        const t = String(s || '').trim();
        if (!t)
            return;
        if (!preferred.some((x) => normalizeWikiTitle(x) === normalizeWikiTitle(t)))
            preferred.push(t);
    };
    push(city);
    // Canonical display forms for common cities
    const canon = {
        київ: ['Київ', 'Kyiv', 'Kiev'],
        kyiv: ['Kyiv', 'Київ', 'Kiev'],
        kiev: ['Kiev', 'Kyiv', 'Київ'],
        львів: ['Львів', 'Lviv'],
        lviv: ['Lviv', 'Львів'],
        варшава: ['Варшава', 'Warsaw', 'Warszawa'],
        warsaw: ['Warsaw', 'Warszawa', 'Варшава'],
    };
    const key = normalizeWikiTitle(city);
    for (const form of canon[key] || [])
        push(form);
    for (const t of placeTokens) {
        if (canon[t])
            for (const form of canon[t])
                push(form);
    }
    // Capitalize alias tokens as a last resort
    for (const t of placeTokens.slice(0, 4)) {
        if (t.length >= 3)
            push(t.charAt(0).toUpperCase() + t.slice(1));
    }
    return preferred.slice(0, 8);
}
function addressTokens(address) {
    const cleaned = normalizeWikiTitle(address)
        .replace(/\b(вул|вулиця|просп|проспект|провулок|пл|площа|набережна|street|st|ave|avenue|road|rd|lane|ln)\b/g, ' ')
        .replace(/\b\d+[а-яa-z]?\b/g, ' ');
    return cleaned
        .split(/\s+/)
        .filter((w) => w.length >= 4)
        .slice(0, 6);
}
function isBadWikiPage(title, extractOrSnippet = '') {
    const t = String(title || '');
    const body = String(extractOrSnippet || '');
    if (/значення|disambiguation|may refer to|^список |list of |категорія:|category:/i.test(t))
        return true;
    if (/може означати|може відноситись|may refer to|disambiguation page/i.test(body.slice(0, 500)))
        return true;
    // list-like: many other cities enumerated without focus
    const bullets = (body.match(/\n\*\s+/g) || []).length;
    if (bullets >= 8 && body.length < 2500)
        return true;
    return false;
}
function scorePlaceMatch(input) {
    const title = normalizeWikiTitle(input.title);
    const body = normalizeWikiTitle(`${input.snippet || ''} ${input.extract || ''}`);
    if (isBadWikiPage(input.title, `${input.snippet || ''} ${input.extract || ''}`))
        return -10000;
    let score = 0;
    const places = input.placeTokens.filter(Boolean);
    const titleRaw = String(input.title || '');
    const paren = titleRaw.match(/\(([^)]+)\)/);
    const parenNorm = paren ? normalizeWikiTitle(paren[1]) : '';
    const hasPlaceInTitleParen = !!parenNorm && places.some((p) => parenNorm === p || parenNorm.includes(p) || p.includes(parenNorm));
    const hasPlaceInTitle = places.some((p) => title.includes(p));
    const hasPlaceInBody = places.some((p) => body.includes(p));
    if (hasPlaceInTitleParen)
        score += 80;
    else if (hasPlaceInTitle)
        score += 50;
    if (hasPlaceInBody)
        score += 25;
    // require city somehow when places provided
    if (places.length && !hasPlaceInTitle && !hasPlaceInBody)
        score -= 80;
    for (const a of input.addressTokens) {
        if (title.includes(a))
            score += 70;
        else if (body.includes(a))
            score += 45;
    }
    const coverage = nameTitleCoverage(input.nameWords, title);
    let nameHits = 0;
    for (const w of input.nameWords) {
        if (title.includes(w))
            nameHits += 1;
    }
    // Title name match is the main signal — city alone must not win.
    score += Math.min(120, nameHits * 35);
    score += Math.round(coverage * 80);
    // Full landmark name inside the page title (ignoring city paren)
    const queryNorm = normalizeWikiTitle(input.queryName || '');
    const titleCore = title.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
    if (queryNorm.length >= 6 && (titleCore.includes(queryNorm) || queryNorm.includes(titleCore))) {
        score += 100;
    }
    // Weak body-only name echoes (e.g. "День святого Миколая" on Sofiiska Square)
    let bodyOnlyHits = 0;
    for (const w of input.nameWords) {
        if (!title.includes(w) && body.includes(w))
            bodyOnlyHits += 1;
    }
    score += Math.min(15, bodyOnlyHits * 5);
    score += typeMismatchPenalty(input.queryName || input.nameWords.join(' '), input.title);
    // Hard reject: distinctive name words present but almost none in the title
    if (input.nameWords.length >= 1 && coverage < 0.34 && nameHits === 0) {
        score -= 250;
    }
    // Prefer concrete monument pages over broad war/culture list articles
    if (/cultural.*(heritage|sites)|heritage sites|пам.ятки.*війни|втрачен/i.test(input.title))
        score -= 60;
    return score;
}
async function wikiExtract(origin, title) {
    const u = `${origin}/w/api.php?action=query&redirects=1&prop=extracts|coordinates&explaintext=1&titles=${encodeURIComponent(title)}&format=json`;
    const json = await fetchJson(u);
    const page = Object.values(json?.query?.pages || {})[0];
    if (!page || page.missing)
        return { extract: '', pageTitle: title, missing: true, lat: null, lng: null };
    const coord = Array.isArray(page.coordinates) ? page.coordinates[0] : null;
    return {
        extract: page?.extract || '',
        pageTitle: page?.title || title,
        lat: Number.isFinite(Number(coord?.lat)) ? Number(coord.lat) : null,
        lng: Number.isFinite(Number(coord?.lon)) ? Number(coord.lon) : null,
    };
}
async function wikiLangLink(origin, title, targetLang) {
    const u = `${origin}/w/api.php?action=query&redirects=1&prop=langlinks&lllang=${encodeURIComponent(targetLang)}&titles=${encodeURIComponent(title)}&format=json`;
    const json = await fetchJson(u, 2);
    const page = Object.values(json?.query?.pages || {})[0];
    const link = Array.isArray(page?.langlinks) ? page.langlinks[0] : null;
    return link?.['*'] ? String(link['*']) : null;
}
async function wikiSearchCandidates(query, lang, limit = 10, retries = 4) {
    const origin = `https://${lang}.wikipedia.org`;
    const u = `${origin}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${limit}&format=json`;
    const json = await fetchJson(u, retries);
    const hits = json?.query?.search || [];
    return hits
        .map((row) => ({
        title: String(row?.title || ''),
        snippet: String(row?.snippet || '').replace(/<[^>]+>/g, ' '),
    }))
        .filter((h) => h.title);
}
/**
 * Resolve the Wikipedia page for a landmark in a specific city/country.
 * Never picks a bare same-name page in another city when city is provided.
 * Title/type must match the landmark — city alone is not enough (avoids
 * «Софійська площа» for «Костел Святого Миколая»).
 * Pages without "(City)" in the title are allowed when the name matches strongly
 * and the extract confirms the city (e.g. «Косий капонір»).
 */
async function resolveWikiHitForPlace(input) {
    const origin = `https://${input.lang}.wikipedia.org`;
    const placeTokens = expandPlaceTokens(input.city, input.country);
    const addrTokens = addressTokens(input.address || '');
    const nameWords = titleWords(input.name);
    const cityForms = cityTitleForms(input.city, placeTokens);
    const candidateTitles = new Map(); // title -> snippet
    const addCand = (title, snippet = '') => {
        if (!title || isBadWikiPage(title, snippet))
            return;
        if (typeMismatchPenalty(input.name, title) <= -150)
            return;
        if (!candidateTitles.has(title))
            candidateTitles.set(title, snippet);
    };
    const scoreOpts = {
        placeTokens,
        addressTokens: addrTokens,
        nameWords,
        queryName: input.name,
    };
    const acceptHit = (pageTitle, extract, score) => {
        const cov = nameTitleCoverage(nameWords, normalizeWikiTitle(pageTitle));
        if (typeMismatchPenalty(input.name, pageTitle) <= -150)
            return false;
        if (nameWords.length >= 1 && cov < 0.34)
            return false;
        const body = normalizeWikiTitle(extract);
        const hasCity = !placeTokens.length ||
            placeTokens.some((p) => body.includes(p) || normalizeWikiTitle(pageTitle).includes(p));
        const hasAddr = addrTokens.some((a) => body.includes(a) || normalizeWikiTitle(pageTitle).includes(a));
        // Strong name match without city in title: require city or address in extract
        if (cov >= 0.6 && (hasCity || hasAddr) && score >= 40)
            return true;
        if (cov >= 0.34 && hasCity && score >= 50)
            return true;
        return score >= 80 && hasCity;
    };
    // 0) Exact bare title — many Kyiv landmarks omit "(Київ)" in the page title
    {
        addCand(input.name, input.city);
        const bare = await wikiExtract(origin, input.name);
        if (!bare.missing && bare.extract.length > 80 && !isBadWikiPage(bare.pageTitle, bare.extract)) {
            const score = scorePlaceMatch({
                title: bare.pageTitle,
                extract: bare.extract,
                ...scoreOpts,
            });
            if (acceptHit(bare.pageTitle, bare.extract, score)) {
                return {
                    origin,
                    title: bare.pageTitle,
                    data: bare,
                    candidates: [bare.pageTitle],
                };
            }
        }
        await sleep(60);
    }
    // 1) Exact titles with city in parentheses (e.g. "Костел Святого Миколая (Київ)")
    for (const form of cityForms) {
        const titled = `${input.name} (${form})`;
        addCand(titled, form);
        const exact = await wikiExtract(origin, titled);
        if (!exact.missing && exact.extract.length > 80 && !isBadWikiPage(exact.pageTitle, exact.extract)) {
            const score = scorePlaceMatch({
                title: exact.pageTitle,
                extract: exact.extract,
                ...scoreOpts,
            });
            if (acceptHit(exact.pageTitle, exact.extract, score)) {
                return {
                    origin,
                    title: exact.pageTitle,
                    data: exact,
                    candidates: [exact.pageTitle],
                };
            }
        }
        await sleep(60);
    }
    // 2) Search queries always include city — never bare name first
    const queries = [
        `"${input.name}" ${input.city}`,
        `${input.name} ${input.city}`,
        `${input.name} (${input.city})`,
        `"${input.name}"`,
        addrTokens[0] ? `${input.name} ${addrTokens[0]} ${input.city}` : '',
        addrTokens[0] ? `${addrTokens[0]} ${input.name}` : '',
        `${input.name} ${input.city} ${input.country}`.trim(),
        `${input.name} ${placeTokens[0] || input.city}`,
    ].filter(Boolean);
    for (const q of queries) {
        const hits = await wikiSearchCandidates(q, input.lang, 10);
        for (const h of hits)
            addCand(h.title, h.snippet);
        await sleep(80);
    }
    const ranked = [];
    for (const [title, snippet] of candidateTitles) {
        ranked.push({
            title,
            snippet,
            score: scorePlaceMatch({
                title,
                snippet,
                ...scoreOpts,
            }),
        });
    }
    ranked.sort((a, b) => b.score - a.score);
    // 3) Fetch extracts for top candidates and re-score with full text + address
    let best = null;
    let bestScore = -Infinity;
    for (const row of ranked.slice(0, 8)) {
        const data = await wikiExtract(origin, row.title);
        if (data.missing || !data.extract || data.extract.length < 80)
            continue;
        if (isBadWikiPage(data.pageTitle, data.extract))
            continue;
        const score = scorePlaceMatch({
            title: data.pageTitle,
            snippet: row.snippet,
            extract: data.extract,
            ...scoreOpts,
        });
        if (!acceptHit(data.pageTitle, data.extract, score))
            continue;
        if (score > bestScore) {
            bestScore = score;
            best = {
                origin,
                title: data.pageTitle,
                data,
                candidates: ranked.slice(0, 8).map((r) => r.title),
            };
        }
        await sleep(70);
    }
    if (!best || bestScore < 40)
        return null;
    return best;
}
async function wikidataSearchEntity(name, city, lang) {
    const q = `${name} ${city}`.trim();
    const u = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(q)}&language=${lang}&uselang=${lang}&limit=6&format=json`;
    const json = await fetchJson(u, 2);
    const rows = Array.isArray(json?.search) ? json.search : [];
    const nameWords = titleWords(name);
    for (const row of rows) {
        const label = String(row?.label || '');
        const desc = String(row?.description || '');
        const id = String(row?.id || '');
        if (!id)
            continue;
        const cov = nameTitleCoverage(nameWords, normalizeWikiTitle(label));
        const blob = normalizeWikiTitle(`${label} ${desc} ${city}`);
        const cityOk = expandPlaceTokens(city, '').some((p) => blob.includes(p)) || !city;
        if (cov < 0.34 && nameWords.length)
            continue;
        if (city && !cityOk && cov < 0.8)
            continue;
        return { id, label, description: desc };
    }
    // retry bare name
    const u2 = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=${lang}&uselang=${lang}&limit=6&format=json`;
    const json2 = await fetchJson(u2, 2);
    for (const row of Array.isArray(json2?.search) ? json2.search : []) {
        const label = String(row?.label || '');
        const desc = String(row?.description || '');
        const id = String(row?.id || '');
        if (!id)
            continue;
        const cov = nameTitleCoverage(titleWords(name), normalizeWikiTitle(label));
        const blob = normalizeWikiTitle(`${label} ${desc}`);
        const cityOk = expandPlaceTokens(city, '').some((p) => blob.includes(p));
        if (cov >= 0.5 && (cityOk || cov >= 0.99))
            return { id, label, description: desc };
    }
    return null;
}
async function wikidataEntityFacts(id, lang) {
    const u = `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(id)}.json`;
    const json = await fetchJson(u, 2);
    const entity = json?.entities?.[id];
    if (!entity)
        return { text: '', lat: null, lng: null, url: '' };
    const labels = entity.labels || {};
    const descriptions = entity.descriptions || {};
    const label = labels[lang]?.value || labels.uk?.value || labels.en?.value || labels[Object.keys(labels)[0] || '']?.value || '';
    const description = descriptions[lang]?.value ||
        descriptions.uk?.value ||
        descriptions.en?.value ||
        descriptions[Object.keys(descriptions)[0] || '']?.value ||
        '';
    let lat = null;
    let lng = null;
    const p625 = entity.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
    if (p625 && Number.isFinite(Number(p625.latitude)) && Number.isFinite(Number(p625.longitude))) {
        lat = Number(p625.latitude);
        lng = Number(p625.longitude);
    }
    const aliases = [
        ...(labels.uk?.value ? [labels.uk.value] : []),
        ...(labels.en?.value ? [labels.en.value] : []),
        ...((entity.aliases?.[lang] || []).map((a) => a?.value).filter(Boolean) || []),
    ];
    // Pull structured facts: inception, architects, significant events, destruction…
    const claimBits = [];
    const timeClaim = (pid, labelText) => {
        const rows = Array.isArray(entity.claims?.[pid]) ? entity.claims[pid] : [];
        for (const row of rows.slice(0, 4)) {
            const t = row?.mainsnak?.datavalue?.value?.time;
            if (typeof t === 'string' && t.length >= 5) {
                const year = t.replace(/^[+-]/, '').slice(0, 4);
                if (year)
                    claimBits.push(`${labelText}: ${year}`);
            }
        }
    };
    timeClaim('P571', lang === 'uk' ? 'Засновано / побудовано' : 'Inception / built');
    timeClaim('P1619', lang === 'uk' ? 'Дата відкриття' : 'Date of official opening');
    timeClaim('P576', lang === 'uk' ? 'Скасовано / зруйновано' : 'Dissolved / demolished');
    const idClaims = (pid, labelText) => {
        const rows = Array.isArray(entity.claims?.[pid]) ? entity.claims[pid] : [];
        for (const row of rows.slice(0, 6)) {
            const qid = row?.mainsnak?.datavalue?.value?.id;
            if (typeof qid === 'string' && qid)
                claimBits.push(`${labelText}: ${qid}`);
        }
    };
    idClaims('P84', lang === 'uk' ? 'Архітектор (Wikidata)' : 'Architect (Wikidata)');
    idClaims('P112', lang === 'uk' ? 'Засновник' : 'Founded by');
    idClaims('P793', lang === 'uk' ? 'Значуща подія' : 'Significant event');
    idClaims('P31', lang === 'uk' ? 'Тип обʼєкта' : 'Instance of');
    const text = [label, description, aliases.filter(Boolean).join(', '), ...claimBits]
        .filter(Boolean)
        .join('. ');
    return {
        text,
        lat,
        lng,
        url: `https://www.wikidata.org/wiki/${encodeURIComponent(id)}`,
        label,
    };
}
/**
 * Deep fact harvest beyond the main Wikipedia page:
 * related wiki articles (war / shelling / damage / restoration), Wikidata events,
 * documentary Commons photos (ruins, scaffolding, shelling — allowed here).
 */
async function gatherDeepLandmarkContext(input) {
    const { name, titleUk, titleEn, city, emit, itemIndex } = input;
    const sources = [];
    const documentaryImages = [];
    const extrasUk = [];
    const extrasEn = [];
    const seenTitles = new Set();
    const nameKey = normalizeWikiTitle(name);
    const titleUkKey = normalizeWikiTitle(titleUk || name);
    const titleEnKey = normalizeWikiTitle(titleEn || name);
    const mentionsLandmark = (title, snippet, extract) => {
        const blob = normalizeWikiTitle(`${title} ${snippet} ${extract.slice(0, 800)}`);
        if (!blob)
            return false;
        if (nameKey && blob.includes(nameKey.slice(0, Math.min(18, nameKey.length))))
            return true;
        if (titleUkKey && blob.includes(titleUkKey.slice(0, Math.min(18, titleUkKey.length))))
            return true;
        if (titleEnKey && blob.includes(titleEnKey.slice(0, Math.min(18, titleEnKey.length))))
            return true;
        // token overlap
        const tokens = titleWords(name).filter((t) => t.length >= 4);
        const hits = tokens.filter((t) => blob.includes(t)).length;
        return tokens.length > 0 && hits >= Math.min(2, tokens.length);
    };
    await emit({
        level: 'info',
        step: 'text',
        itemIndex,
        itemName: name,
        message: 'Глибший пошук фактів: війна/обстріли/реставрація + додаткові джерела…',
    });
    const queriesUk = [
        `"${titleUk || name}" обстріл`,
        `"${titleUk || name}" пошкодження`,
        `"${name}" ${city} війна`,
        `"${titleUk || name}" реставрація`,
        `${name} ${city} історія`,
    ];
    const queriesEn = [
        `"${titleEn || name}" shelling`,
        `"${titleEn || name}" damaged`,
        `"${name}" ${city} war missile`,
        `"${titleEn || name}" restoration`,
        `${name} ${city} history architecture`,
    ];
    const harvestLang = async (lang, queries) => {
        const origin = `https://${lang}.wikipedia.org`;
        for (const q of queries) {
            const hits = await wikiSearchCandidates(q, lang, 6, 2);
            for (const h of hits.slice(0, 3)) {
                const key = `${lang}:${h.title}`;
                if (seenTitles.has(key))
                    continue;
                if (isBadWikiPage(h.title, h.snippet))
                    continue;
                // Skip bare city / list-of-war-heritage dumps unless they mention the place
                if (/список|list of|втрачен|heritage of war|cultural property destroyed/i.test(h.title) &&
                    !mentionsLandmark(h.title, h.snippet, '')) {
                    continue;
                }
                const data = await wikiExtract(origin, h.title);
                await sleep(70);
                if (data.missing || !data.extract || data.extract.length < 120)
                    continue;
                if (!mentionsLandmark(h.title, h.snippet, data.extract))
                    continue;
                seenTitles.add(key);
                const clipped = cleanWikiPlainText(data.extract).slice(0, 3500);
                if (lang === 'uk')
                    extrasUk.push(`=== ${data.pageTitle} ===\n${clipped}`);
                else
                    extrasEn.push(`=== ${data.pageTitle} ===\n${clipped}`);
                sources.push(pageUrl(origin, data.pageTitle));
                if (extrasUk.length + extrasEn.length >= 8)
                    return;
            }
            await sleep(60);
        }
    };
    await harvestLang('uk', queriesUk);
    await harvestLang('en', queriesEn);
    // Wikidata structured events (always try)
    const wd = (await wikidataSearchEntity(titleUk || name, city, 'uk')) ||
        (await wikidataSearchEntity(titleEn || name, city, 'en'));
    if (wd?.id) {
        const factsUk = await wikidataEntityFacts(wd.id, 'uk');
        const factsEn = await wikidataEntityFacts(wd.id, 'en');
        if (factsUk.text)
            extrasUk.push(`=== Wikidata ===\n${factsUk.text}`);
        if (factsEn.text)
            extrasEn.push(`=== Wikidata ===\n${factsEn.text}`);
        if (factsUk.url)
            sources.push(factsUk.url);
    }
    // Documentary Commons: war / damage / scaffolding allowed (not for hero)
    const docQueries = [
        `${titleUk || name} ${city} обстріл`,
        `${titleEn || name} ${city} shelling`,
        `${name} damaged`,
        `${name} scaffolding restoration`,
        `${name} ${city} war`,
    ];
    for (const q of docQueries) {
        if (documentaryImages.length >= 10)
            break;
        const found = await commonsSearchImages(q, 6, { documentary: true });
        for (const url of found) {
            if (!documentaryImages.includes(url))
                documentaryImages.push(url);
        }
        await sleep(100);
    }
    const mergedUk = [input.extractUk, ...extrasUk].filter(Boolean).join('\n\n');
    const mergedEn = [input.extractEn, ...extrasEn].filter(Boolean).join('\n\n');
    await emit({
        level: extrasUk.length || extrasEn.length || documentaryImages.length ? 'ok' : 'info',
        step: 'text',
        itemIndex,
        itemName: name,
        message: `Додаткові джерела: UK+${extrasUk.length} / EN+${extrasEn.length} блоків, документальних фото ${documentaryImages.length}`,
        data: { sources: sources.slice(0, 12), documentary: documentaryImages.slice(0, 8) },
    });
    return {
        extractUk: mergedUk,
        extractEn: mergedEn,
        sources: [...new Set(sources)],
        documentaryImages,
    };
}
function formatOsmStreetAddress(addr) {
    if (!addr || typeof addr !== 'object')
        return '';
    const road = addr.road ||
        addr.pedestrian ||
        addr.footway ||
        addr.square ||
        addr.neighbourhood ||
        addr.suburb ||
        '';
    const house = addr.house_number || '';
    const street = [road, house].filter(Boolean).join(', ').trim();
    return street;
}
async function nominatimLookup(name, address, city, country) {
    const q = [name, address, city, country].filter(Boolean).join(', ');
    const u = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=5&addressdetails=1&extratags=1`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 12000);
    try {
        const res = await fetch(u, {
            headers: {
                'User-Agent': UA,
                Accept: 'application/json',
            },
            signal: ac.signal,
        });
        if (!res.ok)
            return null;
        const rows = (await res.json());
        if (!Array.isArray(rows) || !rows.length)
            return null;
        const nameWords = titleWords(name);
        const placeTokens = expandPlaceTokens(city, country);
        let best = null;
        let bestScore = -1;
        for (const row of rows) {
            const display = String(row?.display_name || '');
            const n = normalizeWikiTitle(display);
            const cov = nameTitleCoverage(nameWords, n);
            const cityOk = placeTokens.some((p) => n.includes(p));
            let s = Math.round(cov * 100);
            if (cityOk)
                s += 40;
            if (row?.type === 'museum' || row?.class === 'tourism' || row?.class === 'historic')
                s += 20;
            if (s > bestScore) {
                bestScore = s;
                best = row;
            }
        }
        if (!best || bestScore < 40)
            return null;
        const lat = Number(best.lat);
        const lng = Number(best.lon);
        const extratags = best.extratags || {};
        const bits = [
            best.display_name,
            extratags.wikipedia ? `Wikipedia: ${extratags.wikipedia}` : '',
            extratags.wikidata ? `Wikidata: ${extratags.wikidata}` : '',
            extratags.description || '',
        ].filter(Boolean);
        return {
            text: bits.join('. '),
            lat: Number.isFinite(lat) ? lat : null,
            lng: Number.isFinite(lng) ? lng : null,
            url: `https://www.openstreetmap.org/${best.osm_type}/${best.osm_id}`,
            wikidataId: extratags.wikidata ? String(extratags.wikidata) : '',
            wikipediaTitle: extratags.wikipedia ? String(extratags.wikipedia) : '',
            streetAddress: formatOsmStreetAddress(best.address),
            displayName: String(best.display_name || '').trim(),
        };
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(timer);
    }
}
/**
 * When Wikipedia has no dedicated page (or our city filter missed it), keep searching:
 * Wikidata + OpenStreetMap + Commons photos + seed text for ChatGPT.
 */
async function gatherAltPlaceContext(input) {
    const { name, address, city, country, emit, itemIndex } = input;
    const sources = [];
    const images = [];
    let extractUk = '';
    let extractEn = '';
    let lat = null;
    let lng = null;
    let labelUk = name;
    let labelEn = name;
    await emit({
        level: 'info',
        step: 'search',
        itemIndex,
        itemName: name,
        message: 'Wikipedia порожня — шукаю Wikidata / OpenStreetMap / Commons…',
    });
    const wdUk = await wikidataSearchEntity(name, city, 'uk');
    await sleep(120);
    const wdEn = (await wikidataSearchEntity(name, city, 'en')) || wdUk;
    const wdId = wdUk?.id || wdEn?.id;
    if (wdId) {
        const factsUk = await wikidataEntityFacts(wdId, 'uk');
        await sleep(80);
        const factsEn = await wikidataEntityFacts(wdId, 'en');
        if (factsUk.text)
            extractUk = factsUk.text;
        if (factsEn.text)
            extractEn = factsEn.text;
        if (factsUk.label)
            labelUk = factsUk.label;
        if (factsEn.label)
            labelEn = factsEn.label;
        lat = factsUk.lat ?? factsEn.lat;
        lng = factsUk.lng ?? factsEn.lng;
        if (factsUk.url)
            sources.push(factsUk.url);
        await emit({
            level: 'ok',
            step: 'wiki',
            itemIndex,
            itemName: name,
            message: `Wikidata: ${wdId} «${labelUk || labelEn}»`,
            data: { wikidataId: wdId },
        });
    }
    const osm = await nominatimLookup(name, address, city, country);
    await sleep(1100); // Nominatim polite use
    let streetAddress = String(address || '').trim();
    if (osm) {
        if (!streetAddress && osm.streetAddress)
            streetAddress = osm.streetAddress;
        sources.push(osm.url);
        if (!extractUk)
            extractUk = osm.text;
        else
            extractUk = `${extractUk}\n\n${osm.text}`;
        if (!extractEn)
            extractEn = osm.text;
        else
            extractEn = `${extractEn}\n\n${osm.text}`;
        if (lat == null)
            lat = osm.lat;
        if (lng == null)
            lng = osm.lng;
        if (osm.wikidataId && !wdId) {
            const factsUk = await wikidataEntityFacts(osm.wikidataId, 'uk');
            const factsEn = await wikidataEntityFacts(osm.wikidataId, 'en');
            if (factsUk.text)
                extractUk = `${factsUk.text}\n\n${extractUk}`;
            if (factsEn.text)
                extractEn = `${factsEn.text}\n\n${extractEn}`;
            if (factsUk.url)
                sources.push(factsUk.url);
            if (lat == null)
                lat = factsUk.lat ?? factsEn.lat;
            if (lng == null)
                lng = factsUk.lng ?? factsEn.lng;
        }
        // OSM may point at a Wikipedia title we missed
        if (osm.wikipediaTitle) {
            const [wikiLang, ...rest] = osm.wikipediaTitle.split(':');
            const wikiTitle = rest.join(':') || osm.wikipediaTitle;
            const origin = wikiLang === 'en' ? 'https://en.wikipedia.org' : `https://${wikiLang || 'uk'}.wikipedia.org`;
            const data = await wikiExtract(origin, wikiTitle);
            if (!data.missing && data.extract.length > 80) {
                if (wikiLang === 'en')
                    extractEn = data.extract;
                else
                    extractUk = data.extract;
                sources.unshift(pageUrl(origin, data.pageTitle));
                if (lat == null)
                    lat = data.lat;
                if (lng == null)
                    lng = data.lng;
                await emit({
                    level: 'ok',
                    step: 'wiki',
                    itemIndex,
                    itemName: name,
                    message: `Wikipedia через OSM: «${data.pageTitle}»`,
                });
            }
        }
        await emit({
            level: 'ok',
            step: 'search',
            itemIndex,
            itemName: name,
            message: `OpenStreetMap: ${osm.text.slice(0, 120)}…`,
        });
    }
    // Commons photos even without a Wikipedia article
    for (const q of [`${name} ${city}`, name, `${name} museum`, `${name} fortress`].filter(Boolean)) {
        if (images.length >= 16)
            break;
        const found = await commonsSearchImages(q, 8);
        for (const url of found) {
            if (!images.includes(url))
                images.push(url);
        }
        await sleep(150);
    }
    // Seed paragraph so ChatGPT still has something grounded
    if (!extractUk && !extractEn) {
        const seedUk = [
            `${name} — визначна локація в місті ${city || 'місті'}${country ? `, ${country}` : ''}.`,
            address ? `Адреса: ${address}.` : '',
            'Опис зібрано з відкритих картографічних і енциклопедичних джерел; перевірте факти перед публікацією.',
        ]
            .filter(Boolean)
            .join(' ');
        const seedEn = [
            `${name} is a notable place in ${city || 'the city'}${country ? `, ${country}` : ''}.`,
            address ? `Address: ${address}.` : '',
            'Details were gathered from open map and encyclopedia sources; verify facts before publishing.',
        ]
            .filter(Boolean)
            .join(' ');
        extractUk = seedUk;
        extractEn = seedEn;
    }
    sources.push('https://commons.wikimedia.org/');
    return {
        extractUk: cleanWikiPlainText(extractUk),
        extractEn: cleanWikiPlainText(extractEn),
        lat,
        lng,
        sources: [...new Set(sources.filter(Boolean))],
        images: images.slice(0, 24),
        labelUk: stripCityFromTitle(labelUk, name),
        labelEn: stripCityFromTitle(labelEn, name),
        streetAddress,
    };
}
async function wikiSummaryImage(origin, title) {
    const slug = encodeURIComponent(title.replace(/ /g, '_'));
    const json = await fetchJson(`${origin}/api/rest_v1/page/summary/${slug}`, 2);
    return json?.originalimage?.source || json?.thumbnail?.source || null;
}
function personNameQueryVariants(name) {
    const n = String(name || '').trim();
    if (!n)
        return [];
    const out = [n];
    // Soften common Ukrainian/Russian genitive/instrumental endings for Wikipedia search
    const softened = n
        .replace(/\b([А-ЯІЇЄҐA-Z][а-яіїєґa-z''-]{2,})ого\b/giu, '$1ий')
        .replace(/\b([А-ЯІЇЄҐA-Z][а-яіїєґa-z''-]{2,})ому\b/giu, '$1ий')
        .replace(/\b([А-ЯІЇЄҐA-Z][а-яіїєґa-z''-]{2,})ою\b/giu, '$1а')
        .replace(/\b([А-ЯІЇЄҐA-Z][а-яіїєґa-z''-]{2,})им\b/giu, '$1ий')
        .replace(/\b([А-ЯІЇЄҐA-Z][а-яіїєґa-z''-]{2,})(а|у|ю)\b/giu, '$1')
        .replace(/\s+/g, ' ')
        .trim();
    if (softened && softened !== n)
        out.push(softened);
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        const last = parts[parts.length - 1]
            .replace(/ого$/i, 'ий')
            .replace(/ому$/i, 'ий')
            .replace(/ою$/i, 'а')
            .replace(/им$/i, 'ий');
        const first = parts[0].replace(/(а|у|ю)$/i, '');
        if (first.length >= 3 && last.length >= 3)
            out.push(`${first} ${last}`);
    }
    return [...new Set(out)];
}
async function wikiPersonSummary(name, lang) {
    const origin = `https://${lang}.wikipedia.org`;
    // Only first 2 name variants — full list is too slow for import
    for (const q of personNameQueryVariants(name).slice(0, 2)) {
        const hits = await wikiSearchCandidates(q, lang, 4, 2);
        const qKey = q
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zа-яіїєґ0-9]+/gi, ' ')
            .trim();
        let title = '';
        for (const h of hits) {
            const t = h.title;
            if (/значення|disambiguation|список|list of|категорія|category/i.test(t))
                continue;
            const tk = t
                .toLowerCase()
                .normalize('NFKD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-zа-яіїєґ0-9]+/gi, ' ')
                .trim();
            if (tk === qKey || tk.includes(qKey) || qKey.includes(tk) || tk.split(' ')[0] === qKey.split(' ')[0]) {
                title = t;
                break;
            }
        }
        if (!title && hits[0]?.title)
            title = hits[0].title;
        if (!title)
            continue;
        const slug = encodeURIComponent(title.replace(/ /g, '_'));
        const sum = await fetchJson(`${origin}/api/rest_v1/page/summary/${slug}`, 2);
        if (!sum)
            continue;
        const photo = sum?.originalimage?.source || sum?.thumbnail?.source || '';
        const extract = String(sum?.extract || '').trim().slice(0, 280);
        const desc = String(sum?.description || extract || '').toLowerCase();
        const looksHuman = /person|politician|architect|artist|painter|writer|count|граф|графіфиня|архітектор|художник|письменник|корол|prince|king|queen|bishop|engineer|scientist|composer|actor|actress|історик|поет|інженер|nobility|noble|philanthropist|меценат|засновник|founder|діяч|генерал|гетьман|граф |герба|народив|помер|польськ|українськ|російськ|син |доньк|дочка|офіцер|міністр|сенатор|посол|магнат|шляхт/i.test(desc) ||
            /\b(1[5-9]\d{2}|20[0-2]\d)\b.*\b(1[5-9]\d{2}|20[0-2]\d)\b/.test(extract);
        if (!photo)
            continue;
        const titleLooksPerson = String(sum?.title || title)
            .split(/\s+/)
            .filter(Boolean).length >= 2;
        if (!looksHuman)
            continue;
        if (/street|avenue|square|church|cathedral|building|вулиця|площа|костел|церква|храм|київ|kyiv/i.test(String(sum?.title || title) + ' ' + desc)) {
            continue;
        }
        if (!titleLooksPerson)
            continue;
        return {
            title: String(sum?.title || title).trim(),
            photoUri: String(photo),
            wikiUrl: String(sum?.content_urls?.desktop?.page || `${origin}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`),
            blurb: extract,
        };
    }
    return null;
}
/** Resolve real portrait photos for people mentioned in the guide. */
async function resolvePersonMentions(people, emit, itemIndex, itemName) {
    const list = Array.isArray(people) ? people : [];
    const out = [];
    const seen = new Set();
    const started = Date.now();
    const HARD_MS = 45000;
    // Cap people — only real person names; skip streets / places
    for (const p of list.slice(0, 6)) {
        if (Date.now() - started > HARD_MS) {
            await emit?.({
                level: 'warn',
                step: 'images',
                itemIndex,
                itemName,
                message: `Портрети: таймаут ${Math.round(HARD_MS / 1000)}с — продовжую без решти імен`,
            });
            break;
        }
        const nameUk = String(p?.nameUk || '').trim();
        const nameEn = String(p?.nameEn || '').trim();
        const key = `${nameUk}|${nameEn}`.toLowerCase();
        if (seen.has(key) || (!nameUk && !nameEn))
            continue;
        const placeRe = /\b(вул|просп|площа|майдан|street|avenue|square|park|церкв|костел|собор|музей|київ|kyiv)\b/i;
        if (placeRe.test(nameUk) || placeRe.test(nameEn))
            continue;
        const wordsUk = nameUk.split(/\s+/).filter(Boolean);
        const wordsEn = nameEn.split(/\s+/).filter(Boolean);
        if (wordsUk.length < 2 && wordsEn.length < 2)
            continue;
        seen.add(key);
        await emit?.({
            level: 'info',
            step: 'images',
            itemIndex,
            itemName,
            message: `Портрет: шукаю «${nameUk || nameEn}»…`,
        });
        let hit = null;
        try {
            hit =
                (nameUk
                    ? await withTimeout(wikiPersonSummary(nameUk, 'uk'), 8000, null, `person-uk:${nameUk}`)
                    : null) ||
                    (nameEn
                        ? await withTimeout(wikiPersonSummary(nameEn, 'en'), 8000, null, `person-en:${nameEn}`)
                        : null) ||
                    (nameUk
                        ? await withTimeout(wikiPersonSummary(nameUk, 'en'), 6000, null, `person-uk-en:${nameUk}`)
                        : null);
        }
        catch (e) {
            console.warn('[personMentions]', nameUk || nameEn, e);
            hit = null;
        }
        if (!hit?.photoUri)
            continue;
        out.push({
            nameUk: nameUk || hit.title,
            nameEn: nameEn || hit.title,
            photoUri: hit.photoUri,
            wikiUrl: hit.wikiUrl,
            blurbUk: nameUk ? hit.blurb : '',
            blurbEn: nameEn || !nameUk ? hit.blurb : hit.blurb,
        });
    }
    return out;
}
/** Ensure person full names appear as **Name** so the app can make them tappable. */
function ensurePersonNamesBold(text, people) {
    let out = String(text || '');
    if (!out || !people?.length)
        return out;
    const names = [
        ...new Set(people.flatMap((p) => [p.nameUk, p.nameEn].filter((n) => typeof n === 'string' && n.length >= 4))),
    ].sort((a, b) => b.length - a.length);
    for (const name of names) {
        if (out.includes(`**${name}**`))
            continue;
        let from = 0;
        while (from < out.length) {
            const idx = out.indexOf(name, from);
            if (idx < 0)
                break;
            const before = out.slice(Math.max(0, idx - 2), idx);
            const after = out.slice(idx + name.length, idx + name.length + 2);
            if (before === '**' || after === '**') {
                from = idx + name.length;
                continue;
            }
            out = `${out.slice(0, idx)}**${name}**${out.slice(idx + name.length)}`;
            from = idx + name.length + 4;
        }
    }
    return out;
}
async function wikiPageImages(origin, title, limit = 10) {
    const u = `${origin}/w/api.php?action=query&prop=images&titles=${encodeURIComponent(title)}&imlimit=${limit}&format=json`;
    const json = await fetchJson(u, 2);
    const page = Object.values(json?.query?.pages || {})[0];
    const files = (page?.images || [])
        .map((x) => x?.title)
        .filter((t) => t && !/icon|logo|flag|map|locator|symbol|coat|emblem/i.test(t));
    if (!files.length)
        return [];
    const infoUrl = `${origin}/w/api.php?action=query&prop=imageinfo&iiprop=url&iiurlwidth=1200&titles=${files
        .slice(0, 10)
        .map(encodeURIComponent)
        .join('|')}&format=json`;
    const infoJson = await fetchJson(infoUrl, 2);
    const urls = [];
    for (const p of Object.values(infoJson?.query?.pages || {})) {
        const url = p?.imageinfo?.[0]?.thumburl || p?.imageinfo?.[0]?.url;
        if (url &&
            /^https?:\/\//i.test(url) &&
            !/\.svg$/i.test(url) &&
            !isJunkLandmarkPhotoUrl(url)) {
            urls.push(url);
        }
    }
    return [...new Set(urls)];
}
async function commonsSearchImages(query, limit = 10, opts) {
    const u = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=${Math.max(limit, 12)}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1200&format=json`;
    const json = await fetchJson(u, 2);
    const urls = [];
    for (const p of Object.values(json?.query?.pages || {})) {
        const title = String(p?.title || '');
        if (/icon|logo|flag|map|locator|symbol|coat|emblem|diagram|plan|svg|wikidata|qr/i.test(title)) {
            continue;
        }
        const url = p?.imageinfo?.[0]?.thumburl || p?.imageinfo?.[0]?.url;
        if (!url || !/^https?:\/\//i.test(url) || /\.svg$/i.test(url))
            continue;
        if (opts?.documentary) {
            // Allow war/damage/scaffold for documentary pages — still reject icons/maps
            if (isNonPhotoJunkUrl(url))
                continue;
        }
        else if (isJunkLandmarkPhotoUrl(url)) {
            continue;
        }
        urls.push(url);
    }
    return [...new Set(urls)].slice(0, limit);
}
function inferVisitCategoryFromTexts(...parts) {
    const blob = parts.filter(Boolean).join(' ').toLowerCase();
    if (!blob.trim())
        return 'monument';
    if (/(музей|museum|галерея|gallery|pinacoteca)/i.test(blob))
        return 'museum';
    if (/(парк|park|сад|garden|ботаніч|botanic)/i.test(blob))
        return 'park';
    if (/(церкв|костел|собор|храм|каплиц|монастир|лавра|church|cathedral|chapel|basilica|abbey|monastery|temple|mosque|синагог|замок|castle|palace|фортец|форт|пам.?ят|monument|statue|tower|вежа|міст|bridge)/i.test(blob)) {
        return 'monument';
    }
    const types = detectPlaceTypeIds(blob);
    if (types.includes('museum'))
        return 'museum';
    if (types.includes('park'))
        return 'park';
    if (types.includes('church') || types.includes('monument') || types.includes('square'))
        return 'monument';
    return 'monument';
}
function cleanWikiPlainText(raw) {
    return normalizeGuideProse(String(raw || '')
        .replace(/^[=]{2,}\s*[^=]+?\s*[=]{2,}\s*$/gm, ' ')
        .replace(/^[-–—=]{3,}\s*$/gm, ' ')
        .replace(/\bhttps?:\/\/\S+/gi, ' ')
        .replace(/\[\[([^|\]]+\|)?([^\]]+)\]\]/g, '$2')
        .replace(/'{2,}/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim(), 8);
}
function stripCityFromTitle(title, fallback = '') {
    const cleaned = String(title || '')
        .replace(/\s*[\(（][^)）]{0,48}[\)）]\s*$/u, '')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned || String(fallback || title || '').trim();
}
function splitParagraphs(text) {
    const cleaned = cleanWikiPlainText(text);
    const paras = cleaned
        .split(/\n{2,}/)
        .map((p) => p.replace(/\s+/g, ' ').trim())
        .filter((p) => p.length > 40 && !/^[=-]{2,}/.test(p));
    // Split long paragraphs into sentence groups so we can fill 13 unique pages.
    const out = [];
    for (const p of paras) {
        if (p.length <= 420) {
            out.push(p);
            continue;
        }
        const sentences = splitGuideSentences(p);
        let buf = '';
        for (const s of sentences) {
            const piece = s.trim();
            if (!piece)
                continue;
            if ((buf + ' ' + piece).trim().length > 380 && buf) {
                out.push(buf.trim());
                buf = piece;
            }
            else {
                buf = (buf ? buf + ' ' : '') + piece;
            }
        }
        if (buf.trim())
            out.push(buf.trim());
    }
    return out;
}
/** Sequential unique chunks — never reuse the same paragraph across pages. */
function uniqueSequentialChunks(paragraphs, count) {
    const chunks = Array.from({ length: count }, () => '');
    const pool = paragraphs.filter(Boolean);
    for (let i = 0; i < count; i += 1) {
        if (i < pool.length)
            chunks[i] = pool[i];
    }
    // If fewer paras than pages, split remaining long ones further rather than duplicate.
    if (pool.length && pool.length < count) {
        let write = pool.length;
        for (const p of pool) {
            if (write >= count)
                break;
            if (p.length < 200)
                continue;
            const mid = Math.floor(p.length / 2);
            const cut = p.indexOf('. ', mid);
            const idx = cut > 0 ? cut + 1 : mid;
            const a = p.slice(0, idx).trim();
            const b = p.slice(idx).trim();
            if (a && b && write < count) {
                chunks[write] = b;
                write += 1;
            }
        }
    }
    return chunks;
}
function buildBody(_title, _label, text) {
    // Never prepend section titles like "Історичний контекст." — start with the story.
    return cleanWikiPlainText(text || '');
}
function stripSlideLabelLead(text) {
    const labels = new Set([...SLIDE_LABELS_UK, ...SLIDE_LABELS_EN, 'деталі', 'details'].map((s) => s.toLowerCase()));
    let raw = cleanWikiPlainText(text || '')
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
        const isLabel = labels.has(first) ||
            (dash.length === 2 && labels.has(dash[1])) ||
            (paras[0].length <= 64 &&
                !/[.!?…]/.test(paras[0].replace(/[.。…:]+$/g, '')) &&
                labels.has(first));
        if (!isLabel || paras.length < 2) {
            if (isLabel && paras.length === 1)
                return '';
            break;
        }
        raw = paras.slice(1).join('\n\n').trim();
    }
    return raw;
}
function pageUrl(origin, title) {
    return `${origin}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}
async function collectImages(item, city, enHit, ukHit, enTitle, ukTitle, emit, itemIndex) {
    const images = [];
    const push = (url, source) => {
        if (url && !images.includes(url)) {
            images.push(url);
            void emit({
                level: 'info',
                step: 'images',
                itemIndex,
                itemName: item.name,
                message: `Фото з ${source}`,
                data: { url, count: images.length },
            });
        }
    };
    for (const [origin, title, label] of [
        ['https://en.wikipedia.org', enTitle, 'EN summary'],
        ['https://uk.wikipedia.org', ukTitle, 'UK summary'],
    ]) {
        push(await wikiSummaryImage(origin, title), label);
        await sleep(120);
    }
    if (enHit)
        for (const url of await wikiPageImages(enHit.origin, enTitle))
            push(url, 'EN page images');
    if (ukHit)
        for (const url of await wikiPageImages(ukHit.origin, ukTitle))
            push(url, 'UK page images');
    const queries = [
        `${item.name} ${city} exterior`,
        `${item.name} ${city}`,
        `${enTitle} ${city}`,
        item.name,
        `${item.name} interior`,
        `${item.name} architecture`,
    ].filter(Boolean);
    let emptyStreak = 0;
    for (const q of queries) {
        if (images.length >= 24)
            break;
        if (images.length >= 12 && emptyStreak >= 2)
            break;
        const found = await commonsSearchImages(q.trim());
        await emit({
            level: 'info',
            step: 'images',
            itemIndex,
            itemName: item.name,
            message: `Commons пошу: «${q.trim()}» → ${found.length}`,
            data: { query: q.trim(), found: found.length },
        });
        if (!found.length) {
            emptyStreak += 1;
            if (emptyStreak >= 3 && images.length >= 8)
                break;
            continue;
        }
        emptyStreak = 0;
        for (const url of found)
            push(url, 'Commons');
        await sleep(120);
    }
    // Attractive exteriors first; keep unattractive only as later story/compare filler.
    return rankImagesForHero(images).slice(0, 24);
}
/** Dedicated Commons search for real historic photos (postcards, archives, 19th–early 20th c.). */
async function collectHistoricImages(item, city, enTitle, ukTitle, emit, itemIndex) {
    const out = [];
    const push = (url) => {
        if (url && !out.includes(url) && scoreHistoricPhotoUrl(url) >= 10)
            out.push(url);
    };
    const queries = [
        `${item.name} ${city} postcard`,
        `${item.name} ${city} historic`,
        `${item.name} ${city} 1910`,
        `${item.name} ${city} 1900`,
        `${item.name} old photo`,
        `${enTitle} ${city} postcard`,
        `${enTitle} historic photograph`,
        `${ukTitle} ${city} листівка`,
        `${ukTitle} історичне фото`,
        `${item.name} engraving`,
        `${item.name} 19th century`,
    ].filter(Boolean);
    for (const q of queries) {
        if (out.length >= 12)
            break;
        const found = await commonsSearchImages(q.trim(), 8);
        await emit({
            level: 'info',
            step: 'images',
            itemIndex,
            itemName: item.name,
            message: `Історичні фото: «${q.trim()}» → ${found.length}`,
            data: { query: q.trim(), found: found.length },
        });
        for (const url of found)
            push(url);
        await sleep(150);
    }
    return out.sort((a, b) => scoreHistoricPhotoUrl(b) - scoreHistoricPhotoUrl(a));
}
/**
 * Page-3 pair: bottom = real historic (or AI reconstruction), top = beautiful modern.
 * Never two modern photos.
 */
async function resolvePage3ComparePair(input) {
    const newUri = input.modernUri ||
        input.allImages.find((u) => u && !isUnattractiveLandmarkPhotoUrl(u) && scoreHistoricPhotoUrl(u) < 25) ||
        input.allImages[0] ||
        '';
    const historicPool = [...input.historicImages, ...input.allImages];
    const historicRef = pickBestHistoricPhoto(historicPool, 30);
    // Don't reuse the modern hero as historic reference
    const historicRefUri = historicRef && newUri && historicRef !== newUri ? historicRef : pickBestHistoricPhoto(historicPool.filter((u) => u && u !== newUri), 20);
    if (historicRefUri) {
        await input.emit({
            level: 'ok',
            step: 'images',
            itemIndex: input.itemIndex,
            itemName: input.itemName,
            message: `Стор.3: знайдено архівне/старе фото (референс епохи)`,
            data: { historicRefUri, newUri, historicScore: scoreHistoricPhotoUrl(historicRefUri) },
        });
    }
    await input.emit({
        level: 'info',
        step: 'images',
        itemIndex: input.itemIndex,
        itemName: input.itemName,
        message: historicRefUri
            ? 'Стор.3: генерую стару версію з ТОГО САМОГО ракурсу, що сучасне фото (архів як стиль)…'
            : 'Стор.3: генерую стару версію з того самого ракурсу, що сучасне фото Вікіпедії…',
    });
    const aiOld = await withTimeout(generateLandmarkHistoricCompareImage({
        titleUk: input.titleUk,
        titleEn: input.titleEn,
        city: input.city,
        country: input.country,
        modernUri: newUri || undefined,
        historicRefUri: historicRefUri || undefined,
        modernViewHint: 'Match the modern Wikipedia/Commons photo viewpoint EXACTLY: same facade angle, towers, crop. Vertical 9:16 phone frame for a before/after slider.',
    }), 120000, null, 'historic-compare-ai');
    if (aiOld && aiOld !== newUri) {
        await input.emit({
            level: 'ok',
            step: 'images',
            itemIndex: input.itemIndex,
            itemName: input.itemName,
            message: 'Стор.3: AI-історичне фото готове (той самий ракурс, що сучасне — для слайдера вгору/вниз)',
            data: { oldUri: aiOld, newUri, historicRefUri: historicRefUri || '' },
        });
        return { oldUri: aiOld, newUri };
    }
    // Fallback: real historic photo if AI failed (slider may not align perfectly)
    if (historicRefUri && historicRefUri !== newUri) {
        await input.emit({
            level: 'warn',
            step: 'images',
            itemIndex: input.itemIndex,
            itemName: input.itemName,
            message: 'Стор.3: AI не згенерував — ставлю реальне архівне фото (ракурс може відрізнятися)',
            data: { oldUri: historicRefUri, newUri },
        });
        return { oldUri: historicRefUri, newUri };
    }
    await input.emit({
        level: 'warn',
        step: 'images',
        itemIndex: input.itemIndex,
        itemName: input.itemName,
        message: 'Стор.3: немає пари було/стало — йду далі без compare',
    });
    const weak = pickBestHistoricPhoto(historicPool.filter((u) => u && u !== newUri), 5);
    return { oldUri: weak && weak !== newUri ? weak : '', newUri };
}
/** Assign photos for story slots. Prefer unique attractive URLs; cycle only as last resort. */
function assignUniquePhotos(images, need, used) {
    const pool = [...new Set((images || []).filter((u) => u && !isJunkLandmarkPhotoUrl(u)))];
    const taken = used || new Set();
    if (!pool.length) {
        const raw = [...new Set((images || []).filter(Boolean))];
        if (!raw.length)
            return Array.from({ length: need }, () => '');
        return Array.from({ length: need }, (_, i) => raw[i % raw.length] || '');
    }
    const out = [];
    for (let i = 0; i < need; i += 1) {
        let picked = '';
        for (let k = 0; k < pool.length; k += 1) {
            const u = pool[(i + k) % pool.length];
            if (u && !taken.has(u)) {
                picked = u;
                taken.add(u);
                break;
            }
        }
        if (!picked) {
            // All unique used — cycle real photos rather than blank / icon fallback in the app
            picked = pool[i % pool.length] || '';
            if (picked)
                taken.add(picked);
        }
        out.push(picked);
    }
    return out;
}
/** Pick one unused photo: preferred first, then pools in order. Never repeats a URL already in `used`. */
function takeNextUniquePhoto(preferred, pools, used) {
    const tryOne = (raw) => {
        const s = typeof raw === 'string' ? raw.trim() : '';
        if (!s || used.has(s) || isJunkLandmarkPhotoUrl(s))
            return '';
        used.add(s);
        return s;
    };
    const fromPref = tryOne(preferred);
    if (fromPref)
        return fromPref;
    for (const pool of pools) {
        for (const u of pool || []) {
            const hit = tryOne(u);
            if (hit)
                return hit;
        }
    }
    return '';
}
function uniquePhotoList(urls) {
    const out = [];
    const seen = new Set();
    for (const raw of urls) {
        const s = typeof raw === 'string' ? raw.trim() : '';
        if (!s || seen.has(s) || isJunkLandmarkPhotoUrl(s))
            continue;
        seen.add(s);
        out.push(s);
    }
    return out;
}
function scoreHistoricUri(url) {
    const u = String(url || '').toLowerCase();
    let s = 0;
    if (/historic|history|old|vintage|postcard|engraving|archive|antique|sepia|black.?white|bw_|drawing|etching|lithograph|painting|історич|старий|доревол|листівк/i.test(u))
        s += 6;
    if (/\b(1[6-9]\d{2}|190\d|191\d|192\d|193\d|194\d)\b/.test(u))
        s += 4;
    if (/modern|aerial|drone|202\d|201\d|facade|exterior|today|view_from/i.test(u))
        s -= 3;
    return s;
}
function scoreModernUri(url) {
    const u = String(url || '').toLowerCase();
    let s = 0;
    if (/modern|aerial|drone|202\d|201\d|facade|exterior|panorama|view|today|night|sunset/i.test(u))
        s += 5;
    if (/historic|old|vintage|postcard|engraving|archive|sepia|painting|історич|старий/i.test(u))
        s -= 4;
    if (/\b(1[6-9]\d{2}|190\d|191\d|192\d)\b/.test(u))
        s -= 3;
    return s;
}
/** Old (bottom) + new (top) for page-3 compare slider — two distinct photos. */
function pickBeforeAfterPair(images, used) {
    const pool = images.filter((u) => u && !used.has(u));
    if (pool.length < 2) {
        const fallback = images.filter(Boolean);
        const oldUri = fallback[1] || fallback[0] || '';
        const newUri = fallback.find((u) => u && u !== oldUri) || fallback[0] || '';
        if (oldUri)
            used.add(oldUri);
        if (newUri)
            used.add(newUri);
        return { oldUri, newUri };
    }
    const byHistoric = [...pool].sort((a, b) => scoreHistoricUri(b) - scoreHistoricUri(a));
    const oldUri = byHistoric[0];
    const byModern = pool
        .filter((u) => u !== oldUri)
        .sort((a, b) => scoreModernUri(b) - scoreModernUri(a));
    const newUri = byModern[0] || pool.find((u) => u !== oldUri) || '';
    if (oldUri)
        used.add(oldUri);
    if (newUri)
        used.add(newUri);
    return { oldUri, newUri };
}
function isPlaceholderQuizOption(text) {
    return /^(варіант|вариант|option)\s*\d+$/i.test(String(text || '').trim());
}
function normalizeQuizQuestionPack(raw) {
    if (!raw || typeof raw !== 'object')
        return null;
    const options = (Array.isArray(raw.options) ? raw.options : [])
        .map((o) => ({
        textUk: String(o?.textUk || o?.textEn || '')
            .trim()
            .slice(0, 42),
        textEn: String(o?.textEn || o?.textUk || '')
            .trim()
            .slice(0, 42),
        correct: !!o?.correct,
    }))
        .filter((o) => (o.textUk || o.textEn) &&
        !isPlaceholderQuizOption(o.textUk) &&
        !isPlaceholderQuizOption(o.textEn))
        .slice(0, 4);
    // Strict: exactly 4 real options and exactly one correct — never invent placeholders.
    if (options.length !== 4)
        return null;
    const correctCount = options.filter((o) => o.correct).length;
    if (correctCount !== 1) {
        if (correctCount === 0)
            options[0].correct = true;
        else {
            let seen = false;
            for (const o of options) {
                if (o.correct && seen)
                    o.correct = false;
                else if (o.correct)
                    seen = true;
            }
        }
    }
    const questionUk = String(raw.questionUk || raw.questionEn || '')
        .trim()
        .slice(0, 90);
    const questionEn = String(raw.questionEn || raw.questionUk || '')
        .trim()
        .slice(0, 90);
    if (!questionUk && !questionEn)
        return null;
    if (/як називається ця локація|what is the name of this location/i.test(`${questionUk} ${questionEn}`)) {
        return null;
    }
    const correct = options.find((o) => o.correct);
    let multiHintUk = String(raw.multiHintUk || '').trim().slice(0, 140);
    let multiHintEn = String(raw.multiHintEn || '').trim().slice(0, 140);
    const correctUk = correct.textUk || correct.textEn;
    const correctEn = correct.textEn || correct.textUk;
    if (!multiHintUk && correctUk)
        multiHintUk = `Правильна відповідь: **${correctUk}**.`;
    if (!multiHintEn && correctEn)
        multiHintEn = `Correct answer: **${correctEn}**.`;
    // Soft repair: if hint never mentions the correct fact, append it.
    if (correctUk && multiHintUk && !multiHintUk.toLowerCase().includes(correctUk.toLowerCase().slice(0, 12))) {
        multiHintUk = `${multiHintUk} (**${correctUk}**)`.slice(0, 140);
    }
    if (correctEn && multiHintEn && !multiHintEn.toLowerCase().includes(correctEn.toLowerCase().slice(0, 12))) {
        multiHintEn = `${multiHintEn} (**${correctEn}**)`.slice(0, 140);
    }
    return {
        questionUk,
        questionEn,
        options,
        multiHintUk,
        multiHintEn,
    };
}
function extractBoldPeople(text) {
    const names = [];
    const re = /\*\*([^*]{4,64})\*\*/g;
    let m;
    const src = String(text || '');
    while ((m = re.exec(src)) !== null) {
        const n = String(m[1] || '').replace(/\s+/g, ' ').trim();
        if (n && !names.includes(n))
            names.push(n);
        if (names.length >= 6)
            break;
    }
    return names;
}
function distractorYears(year) {
    const y = Number(year);
    if (!Number.isFinite(y))
        return ['1886', '1917', '1964'];
    const pool = [y - 31, y + 47, y - 12, y + 19, y - 55, y + 8, y - 7, y + 23]
        .map((n) => String(n))
        .filter((n) => n !== String(y) && /^(1[0-9]{3}|20[0-2][0-9])$/.test(n));
    const uniq = [...new Set(pool)];
    while (uniq.length < 3)
        uniq.push(String(1700 + uniq.length * 37));
    return uniq.slice(0, 3);
}
/** Build up to 3 solid quiz questions from full guide prose (not only short desc). */
function fallbackQuizQuestions(titleUk, titleEn, storyUk, storyEn) {
    const blob = `${storyEn}\n${storyUk}`;
    const years = [...blob.matchAll(/\b(1[0-9]{3}|20[0-2][0-9])\b/g)].map((m) => m[1]);
    const uniqYears = [...new Set(years)];
    const people = extractBoldPeople(blob);
    const out = [];
    const seenQ = new Set();
    const push = (q) => {
        if (!q)
            return;
        const fp = `${q.questionUk}|${q.questionEn}`.toLowerCase().slice(0, 80);
        if (seenQ.has(fp))
            return;
        seenQ.add(fp);
        out.push(q);
    };
    if (uniqYears[0]) {
        const year = uniqYears[0];
        const wrong = distractorYears(year);
        push(normalizeQuizQuestionPack({
            questionUk: `Який рік справді повʼязаний з історією «${titleUk}»?`,
            questionEn: `Which year is truly tied to the story of "${titleEn}"?`,
            options: [
                { textUk: year, textEn: year, correct: true },
                { textUk: wrong[0], textEn: wrong[0], correct: false },
                { textUk: wrong[1], textEn: wrong[1], correct: false },
                { textUk: wrong[2], textEn: wrong[2], correct: false },
            ],
            multiHintUk: `У тексті гіда є рік **${year}**.`,
            multiHintEn: `The guide text mentions **${year}**.`,
        }));
    }
    if (people[0]) {
        const person = people[0].slice(0, 36);
        push(normalizeQuizQuestionPack({
            questionUk: `Хто згадується в історії «${titleUk}»?`,
            questionEn: `Who is mentioned in the story of "${titleEn}"?`,
            options: [
                { textUk: person, textEn: person, correct: true },
                { textUk: 'Інший майстер епохи', textEn: 'Another master of the era', correct: false },
                { textUk: 'Міський інженер', textEn: 'A city engineer', correct: false },
                { textUk: 'Невідомий меценат', textEn: 'An unknown patron', correct: false },
            ],
            multiHintUk: `У гідові імʼя виділене: **${person}**.`,
            multiHintEn: `The guide highlights this name: **${person}**.`,
        }));
    }
    if (uniqYears[1] && uniqYears[1] !== uniqYears[0]) {
        const year = uniqYears[1];
        const wrong = distractorYears(year);
        push(normalizeQuizQuestionPack({
            questionUk: `Яка ще дата важлива для «${titleUk}»?`,
            questionEn: `Which other date matters for "${titleEn}"?`,
            options: [
                { textUk: year, textEn: year, correct: true },
                { textUk: wrong[0], textEn: wrong[0], correct: false },
                { textUk: wrong[1], textEn: wrong[1], correct: false },
                { textUk: wrong[2], textEn: wrong[2], correct: false },
            ],
            multiHintUk: `Друга ключова дата в тексті — **${year}**.`,
            multiHintEn: `Another key date in the text is **${year}**.`,
        }));
    }
    const styleHit = blob.match(/\b(неоготик\w*|neo-?gothic|барок\w*|baroque|ренесанс\w*|renaissance|модерн\w*|art nouveau|готик\w*|gothic|класици\w*|classicis\w*)\b/i);
    if (styleHit) {
        const style = String(styleHit[0]);
        const styleUk = /неоготик|готик/i.test(style)
            ? /нео/i.test(style)
                ? 'Неоготика'
                : 'Готика'
            : /барок/i.test(style)
                ? 'Бароко'
                : /ренесанс|renaiss/i.test(style)
                    ? 'Ренесанс'
                    : /модерн|nouveau/i.test(style)
                        ? 'Модерн'
                        : 'Класицизм';
        const styleEn = /neo-?gothic|неоготик/i.test(style)
            ? 'Neo-Gothic'
            : /gothic|готик/i.test(style)
                ? 'Gothic'
                : /baroque|барок/i.test(style)
                    ? 'Baroque'
                    : /renaiss|ренесанс/i.test(style)
                        ? 'Renaissance'
                        : /nouveau|модерн/i.test(style)
                            ? 'Art Nouveau'
                            : 'Classicism';
        push(normalizeQuizQuestionPack({
            questionUk: `Який архітектурний стиль згадує гід?`,
            questionEn: `Which architectural style does the guide mention?`,
            options: [
                { textUk: styleUk, textEn: styleEn, correct: true },
                { textUk: 'Бруталізм', textEn: 'Brutalism', correct: false },
                { textUk: 'Хай-тек', textEn: 'High-tech', correct: false },
                { textUk: 'Деконструктивізм', textEn: 'Deconstructivism', correct: false },
            ],
            multiHintUk: `У тексті є стиль **${styleUk}**.`,
            multiHintEn: `The text mentions **${styleEn}**.`,
        }));
    }
    push(normalizeQuizQuestionPack({
        questionUk: `Що найточніше описує «${titleUk}»?`,
        questionEn: `What best describes "${titleEn}"?`,
        options: [
            {
                textUk: 'Культурна/історична памʼятка',
                textEn: 'A cultural/historical landmark',
                correct: true,
            },
            { textUk: 'Спортивна арена', textEn: 'A sports arena', correct: false },
            { textUk: 'Бізнес-центр', textEn: 'A business center', correct: false },
            { textUk: 'Торговий порт', textEn: 'A trade port', correct: false },
        ],
        multiHintUk: `${titleUk} має історичну або культурну цінність.`,
        multiHintEn: `${titleEn} has historical or cultural value.`,
    }));
    push(normalizeQuizQuestionPack({
        questionUk: `Навіщо уважно читати гід про «${titleUk}»?`,
        questionEn: `Why read the guide about "${titleEn}" carefully?`,
        options: [
            {
                textUk: 'Щоб помітити деталі на місці',
                textEn: 'To notice details on site',
                correct: true,
            },
            { textUk: 'Щоб пропустити історію', textEn: 'To skip the history', correct: false },
            { textUk: 'Щоб знайти лише кафе', textEn: 'To find only cafés', correct: false },
            { textUk: 'Щоб ігнорувати дати', textEn: 'To ignore the dates', correct: false },
        ],
        multiHintUk: 'Гід підказує, на що дивитись — деталі, дати й імена.',
        multiHintEn: 'The guide tells you what to look for — details, dates, and names.',
    }));
    return out.slice(0, 3);
}
function buildStory(input) {
    const guide = input.guide;
    const people = Array.isArray(guide?.people) ? guide.people : [];
    const titleUk = stripCityFromTitle(guide?.titleUk || input.titleUk, input.titleUk);
    const titleEn = stripCityFromTitle(guide?.titleEn || input.titleEn, input.titleEn);
    const parasUk = splitParagraphs(input.descUk);
    const parasEn = splitParagraphs(input.descEn || input.descUk);
    const boldPeople = (t) => ensurePersonNamesBold(t, people);
    const globalUsedKeys = new Set();
    const densifyPage = (raw, pool, minChars = 900) => {
        let t = ensureMinGuideParagraphs(stripSlideLabelLead(cleanWikiPlainText(raw || '')), 5, 6);
        // Drop paragraphs already used on earlier pages
        t = t
            .split(/\n{2,}/)
            .map((p) => p.trim())
            .filter(Boolean)
            .filter((p) => {
            const key = p.toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
            if (!key)
                return false;
            if ([...globalUsedKeys].some((u) => u === key || (u.length > 36 && (key.startsWith(u) || u.startsWith(key))))) {
                return false;
            }
            return true;
        })
            .join('\n\n');
        if (t.length >= minChars) {
            t.split(/\n{2,}/)
                .map((p) => p.trim())
                .filter(Boolean)
                .forEach((p) => globalUsedKeys.add(p.toLowerCase().replace(/\s+/g, ' ').slice(0, 80)));
            return t;
        }
        const used = new Set(globalUsedKeys);
        t.split(/\n{2,}/)
            .map((p) => p.trim())
            .filter(Boolean)
            .forEach((p) => used.add(p.toLowerCase().replace(/\s+/g, ' ').slice(0, 80)));
        const extras = [];
        for (const p of pool) {
            const clean = stripSlideLabelLead(cleanWikiPlainText(p || ''));
            if (!clean || clean.length < 60)
                continue;
            const key = clean.toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
            if ([...used].some((u) => u.includes(key.slice(0, 40)) || key.includes(String(u).slice(0, 40)))) {
                continue;
            }
            used.add(key);
            extras.push(clean);
            const joined = [t, ...extras].filter(Boolean).join('\n\n');
            if (joined.length >= minChars && extras.length + (t ? 1 : 0) >= 4) {
                const out = ensureMinGuideParagraphs(joined, 5, 6);
                out
                    .split(/\n{2,}/)
                    .map((x) => x.trim())
                    .filter(Boolean)
                    .forEach((x) => globalUsedKeys.add(x.toLowerCase().replace(/\s+/g, ' ').slice(0, 80)));
                return out;
            }
        }
        if (extras.length) {
            const out = ensureMinGuideParagraphs([t, ...extras].filter(Boolean).join('\n\n'), 5, 6);
            out
                .split(/\n{2,}/)
                .map((x) => x.trim())
                .filter(Boolean)
                .forEach((x) => globalUsedKeys.add(x.toLowerCase().replace(/\s+/g, ' ').slice(0, 80)));
            return out;
        }
        if (t) {
            t.split(/\n{2,}/)
                .map((p) => p.trim())
                .filter(Boolean)
                .forEach((p) => globalUsedKeys.add(p.toLowerCase().replace(/\s+/g, ' ').slice(0, 80)));
        }
        return t;
    };
    // Page 1 + 12 pages = 13 total (matches app Maidan-style guides).
    const page1Uk = boldPeople(densifyPage(cleanWikiPlainText(guide?.introPage1Uk || '') ||
        cleanWikiPlainText(parasUk.slice(0, 6).join('\n\n') || input.descUk || titleUk), [...parasUk, ...(guide?.pagesUk || []), input.descUk || ''], 1000));
    const page1En = boldPeople(densifyPage(cleanWikiPlainText(guide?.introPage1En || '') ||
        cleanWikiPlainText(parasEn.slice(0, 6).join('\n\n') || input.descEn || titleEn), [...parasEn, ...(guide?.pagesEn || []), input.descEn || input.descUk || ''], 1000));
    const bodiesUkRaw = guide?.pagesUk?.some(Boolean)
        ? guide.pagesUk.map((t) => boldPeople(densifyPage(t, [...parasUk, input.descUk || '', page1Uk], 900)))
        : uniqueSequentialChunks(parasUk.slice(1), 12).map((t, i) => densifyPage(buildBody(titleUk, SLIDE_LABELS_UK[i] || 'деталі', t), [...parasUk, input.descUk || '', page1Uk], 700));
    const bodiesEnRaw = guide?.pagesEn?.some(Boolean)
        ? guide.pagesEn.map((t) => boldPeople(densifyPage(t, [...parasEn, input.descEn || '', page1En], 900)))
        : uniqueSequentialChunks(parasEn.slice(1), 12).map((t, i) => densifyPage(buildBody(titleEn, SLIDE_LABELS_EN[i] || 'details', t), [...parasEn, input.descEn || '', page1En], 700));
    const hasRichAiGuide = !!((guide?.pagesUk?.filter((t) => cleanWikiPlainText(t).length >= 280) || []).length >= 6);
    const fallbackDescUk = cleanWikiPlainText(input.descUk || titleUk);
    const fallbackDescEn = cleanWikiPlainText(input.descEn || input.descUk || titleEn);
    // Prefer real AI pages. Without AI: only keep pages with unique substance (app skips empties).
    const bodiesUk = Array.from({ length: 12 }, (_, i) => {
        const t = densifyPage(bodiesUkRaw[i] || '', [...parasUk, fallbackDescUk, page1Uk], 850);
        if (t && t !== page1Uk && t.length >= 320)
            return t;
        if (hasRichAiGuide) {
            const alt = parasUk[i + 1] || parasUk[i + 2] || '';
            const altClean = densifyPage(alt, [...parasUk, fallbackDescUk], 700);
            if (altClean && altClean !== page1Uk && altClean.length >= 120)
                return altClean;
            return densifyPage(buildBody(titleUk, SLIDE_LABELS_UK[i] || 'деталі', parasUk[Math.min(i + 1, Math.max(0, parasUk.length - 1))] || fallbackDescUk || titleUk), [...parasUk, fallbackDescUk], 700);
        }
        // Page index 1 = then/now under compare slider — always keep a real body
        if (i === 1) {
            return densifyPage([
                `Це місце змінювалось разом із містом: фасад, вулиця й атмосфера довкола розповідають різні епохи.`,
                '',
                fallbackDescUk.slice(0, 900) ||
                    `Сьогодні ${titleUk} залишається однією з визначних локацій для мандрівників.`,
                '',
                `Те, що збереглося, і те, що додало місто навколо, — саме в цьому контрасті читається жива історія ${titleUk}.`,
            ].join('\n'), [...parasUk, fallbackDescUk, page1Uk], 700);
        }
        return '';
    });
    const bodiesEn = Array.from({ length: 12 }, (_, i) => {
        const t = densifyPage(bodiesEnRaw[i] || '', [...parasEn, fallbackDescEn, page1En], 850);
        if (t && t !== page1En && t.length >= 320)
            return t;
        if (hasRichAiGuide) {
            const alt = parasEn[i + 1] || parasEn[i + 2] || '';
            const altClean = densifyPage(alt, [...parasEn, fallbackDescEn], 700);
            if (altClean && altClean !== page1En && altClean.length >= 120)
                return altClean;
            return densifyPage(buildBody(titleEn, SLIDE_LABELS_EN[i] || 'details', parasEn[Math.min(i + 1, Math.max(0, parasEn.length - 1))] || fallbackDescEn || titleEn), [...parasEn, fallbackDescEn], 700);
        }
        if (i === 1) {
            return densifyPage([
                `This place changed with the city: facade, street and atmosphere around it speak for different eras.`,
                '',
                fallbackDescEn.slice(0, 900) || `Today ${titleEn} remains a landmark worth visiting.`,
                '',
                `What survived and what the city added around it — that contrast is where the living history of ${titleEn} comes into focus.`,
            ].join('\n'), [...parasEn, fallbackDescEn, page1En], 700);
        }
        return '';
    });
    const ranked = rankImagesForHero(input.images.filter((u) => !isJunkLandmarkPhotoUrl(u) || isDocumentaryDamagePhotoUrl(u)));
    const attractive = ranked.filter((u) => !isUnattractiveLandmarkPhotoUrl(u) && !isJunkLandmarkPhotoUrl(u));
    const documentary = uniquePhotoList(input.images.filter((u) => isDocumentaryDamagePhotoUrl(u) && !isNonPhotoJunkUrl(u)));
    const poolForStory = uniquePhotoList([
        ...(ranked.length ? ranked : input.images.filter((u) => !isJunkLandmarkPhotoUrl(u))),
        ...documentary,
    ]);
    const aiPagePhotos = Array.isArray(input.pagePhotos) ? input.pagePhotos : [];
    // Every story page must get a different photo (AI + real Commons). Never silently reuse hero.
    const usedPhotos = new Set();
    const heroUri = (typeof input.heroUri === 'string' && input.heroUri.trim()) ||
        attractive[0] ||
        poolForStory.find((u) => !isUnattractiveLandmarkPhotoUrl(u)) ||
        '';
    if (heroUri)
        usedPhotos.add(heroUri);
    const aiPool = uniquePhotoList([
        typeof input.page1PhotoUri === 'string' ? input.page1PhotoUri : '',
        ...aiPagePhotos,
    ]);
    // Attractive first; documentary war/damage photos stay available for later story pages
    const realPool = uniquePhotoList([
        ...(attractive.length ? attractive : poolForStory.filter((u) => !isUnattractiveLandmarkPhotoUrl(u))),
        ...documentary,
    ]);
    // Prefer real Wikipedia/Commons first (St Nicholas quality), AI only as fill
    const fillPools = [realPool, aiPool];
    // Page 3: prefer explicit historic/modern pair from enrich pipeline
    let compareOldUri = (typeof input.compareOldUri === 'string' && input.compareOldUri.trim()) || '';
    let compareNew = (typeof input.compareNewUri === 'string' && input.compareNewUri.trim()) || '';
    if (!compareOldUri || !compareNew || compareOldUri === compareNew) {
        const { oldUri: pairOld, newUri: pairNew } = pickBeforeAfterPair(poolForStory, usedPhotos);
        if (!compareOldUri)
            compareOldUri = pairOld;
        if (!compareNew)
            compareNew = pairNew || '';
        const betterNew = attractive.find((u) => u && u !== compareOldUri && !usedPhotos.has(u) && u !== heroUri);
        if (betterNew && (!compareNew || scoreHistoricUri(compareNew) > 2)) {
            compareNew = betterNew;
        }
    }
    if (!compareNew)
        compareNew = heroUri;
    if (compareOldUri)
        usedPhotos.add(compareOldUri);
    if (compareNew)
        usedPhotos.add(compareNew);
    const introPagesUk = bodiesUk.map((body, i) => {
        const layout = { heroFit: 'cover', ...(INTRO_PAGE_LAYOUTS[i] || {}) };
        if (i === 1 && compareOldUri && compareNew && compareOldUri !== compareNew) {
            return {
                body,
                compareBeforeUri: compareOldUri,
                compareAfterUri: compareNew,
                ...COMPARE_PAGE3_LAYOUT,
                ...layout,
                heroFit: 'cover',
            };
        }
        // Commons-first via fillPools; only soft-prefer page-1 AI cover when provided
        const preferred = i === 0 && typeof input.page1PhotoUri === 'string' && input.page1PhotoUri.trim()
            ? input.page1PhotoUri.trim()
            : '';
        const photoUri = takeNextUniquePhoto(preferred, fillPools, usedPhotos);
        const wantsSecondary = Number(layout.secondaryHeroHeightRatio) > 0 ||
            Number(layout.secondaryHeroHeightMax) > 0;
        const secondaryPhotoUri = wantsSecondary
            ? takeNextUniquePhoto('', fillPools, usedPhotos)
            : '';
        return {
            body,
            ...(photoUri ? { photoUri } : {}),
            ...(secondaryPhotoUri ? { secondaryPhotoUri } : {}),
            ...layout,
            heroFit: 'cover',
        };
    });
    // EN pages must mirror UK media 1:1 (same unique photos), not re-pick from pools
    const introPagesEn = bodiesEn.map((body, i) => {
        const layout = { heroFit: 'cover', ...(INTRO_PAGE_LAYOUTS[i] || {}) };
        const ukPage = introPagesUk[i] || {};
        if (i === 1 && ukPage.compareBeforeUri && ukPage.compareAfterUri) {
            return {
                body,
                compareBeforeUri: ukPage.compareBeforeUri,
                compareAfterUri: ukPage.compareAfterUri,
                ...COMPARE_PAGE3_LAYOUT,
                ...layout,
                heroFit: 'cover',
            };
        }
        const photoUri = typeof ukPage.photoUri === 'string' ? ukPage.photoUri : '';
        const secondaryPhotoUri = typeof ukPage.secondaryPhotoUri === 'string'
            ? ukPage.secondaryPhotoUri
            : '';
        return {
            body,
            ...(photoUri ? { photoUri } : {}),
            ...(secondaryPhotoUri ? { secondaryPhotoUri } : {}),
            ...layout,
            heroFit: 'cover',
        };
    });
    const page1Photo = (typeof introPagesUk[0]?.photoUri === 'string' && introPagesUk[0].photoUri) ||
        takeNextUniquePhoto(typeof input.page1PhotoUri === 'string' ? input.page1PhotoUri : '', fillPools, usedPhotos) ||
        '';
    const thumbUri = heroUri || page1Photo || '';
    const shortIntroUk = cleanWikiPlainText(guide?.shortIntroUk || parasUk[0] || input.descUk || titleUk).slice(0, 500);
    const shortIntroEn = cleanWikiPlainText(guide?.shortIntroEn || parasEn[0] || input.descEn || titleEn).slice(0, 500);
    const descUk = cleanWikiPlainText(guide?.descUk || parasUk[0] || input.descUk || titleUk).slice(0, 700);
    const descEn = cleanWikiPlainText(guide?.descEn || parasEn[0] || input.descEn || titleEn).slice(0, 700);
    const distinctMiniPreview = (mini, shortIntro, desc, altParas) => {
        const m = cleanWikiPlainText(mini).slice(0, 180);
        const s = cleanWikiPlainText(shortIntro);
        const d = cleanWikiPlainText(desc);
        const norm = (t) => t.replace(/\s+/g, ' ').trim().toLowerCase();
        if (m &&
            norm(m) !== norm(s) &&
            !norm(s).startsWith(norm(m)) &&
            !norm(m).startsWith(norm(s).slice(0, 60))) {
            return m;
        }
        // Prefer a different sentence from desc / other wiki para — never clone shortIntro
        const pool = [d, ...altParas.map((p) => cleanWikiPlainText(p))].filter(Boolean);
        for (const p of pool) {
            if (!p || norm(p) === norm(s))
                continue;
            if (norm(s).startsWith(norm(p).slice(0, 50)))
                continue;
            const sentence = p.split(/(?<=[.!?…])\s+/)[0] || p;
            const clipped = sentence.slice(0, 180).trim();
            if (clipped && norm(clipped) !== norm(s))
                return clipped;
        }
        return '';
    };
    const guideQuiz = guide?.quiz && typeof guide.quiz === 'object' ? guide.quiz : null;
    const questionsFromGuide = [];
    if (Array.isArray(guideQuiz?.questions)) {
        for (const q of guideQuiz.questions) {
            const n = normalizeQuizQuestionPack(q);
            if (n)
                questionsFromGuide.push(n);
            if (questionsFromGuide.length >= 3)
                break;
        }
    }
    if (!questionsFromGuide.length) {
        const legacy = normalizeQuizQuestionPack(guideQuiz);
        if (legacy)
            questionsFromGuide.push(legacy);
    }
    const storyBlobUk = [page1Uk, ...bodiesUk, descUk].filter(Boolean).join('\n\n');
    const storyBlobEn = [page1En, ...bodiesEn, descEn].filter(Boolean).join('\n\n');
    const fallbackQs = fallbackQuizQuestions(titleUk, titleEn, storyBlobUk, storyBlobEn);
    const quizQuestions = [];
    const seenQuiz = new Set();
    for (const q of [...questionsFromGuide, ...fallbackQs]) {
        if (!q)
            continue;
        const fp = `${q.questionUk}|${q.questionEn}`.toLowerCase().slice(0, 80);
        if (seenQuiz.has(fp))
            continue;
        seenQuiz.add(fp);
        quizQuestions.push(q);
        if (quizQuestions.length >= 3)
            break;
    }
    if (!quizQuestions.length) {
        const emergency = normalizeQuizQuestionPack({
            questionUk: `Що найточніше описує «${titleUk}»?`,
            questionEn: `What best describes "${titleEn}"?`,
            options: [
                {
                    textUk: 'Культурна/історична памʼятка',
                    textEn: 'A cultural/historical landmark',
                    correct: true,
                },
                { textUk: 'Спортивна арена', textEn: 'A sports arena', correct: false },
                { textUk: 'Бізнес-центр', textEn: 'A business center', correct: false },
                { textUk: 'Торговий порт', textEn: 'A trade port', correct: false },
            ],
            multiHintUk: `${titleUk} має історичну або культурну цінність.`,
            multiHintEn: `${titleEn} has historical or cultural value.`,
        });
        if (emergency)
            quizQuestions.push(emergency);
    }
    const quiz = {
        ...quizQuestions[0],
        questions: quizQuestions.slice(0, 3),
        xpPerCorrect: 5,
    };
    const audioUk = [page1Uk, ...bodiesUk].filter(Boolean).join('\n\n');
    const audioEn = [page1En, ...bodiesEn].filter(Boolean).join('\n\n');
    return {
        builtAt: new Date().toISOString(),
        shortIntroUk,
        shortIntroEn,
        miniPreviewUk: distinctMiniPreview(guide?.miniPreviewUk || '', shortIntroUk, descUk, [
            parasUk[1] || '',
            parasUk[0] || '',
        ]),
        miniPreviewEn: distinctMiniPreview(guide?.miniPreviewEn || '', shortIntroEn, descEn, [
            parasEn[1] || '',
            parasEn[0] || '',
        ]),
        introPage1Uk: page1Uk,
        introPage1En: page1En,
        ...(page1Photo ? { introPage1PhotoUri: page1Photo } : {}),
        introPagesUk,
        introPagesEn,
        quiz,
        photoFact: {
            bgUri: heroUri || attractive[0] || thumbUri || assignUniquePhotos(input.images, 1, usedPhotos)[0] || '',
            titleUk: `Цікаво знати`,
            titleEn: `Did you know?`,
            bodyUk: clampGuideParagraphs(cleanWikiPlainText(pickClosingWowFact([
                guide?.descUk || '',
                parasUk[1] || '',
                parasUk[2] || '',
                parasUk[0] || '',
                descUk || '',
                ...(Array.isArray(guide?.pagesUk) ? guide.pagesUk.slice(2, 8) : []),
            ])), 3).slice(0, 520),
            bodyEn: clampGuideParagraphs(cleanWikiPlainText(pickClosingWowFact([
                guide?.descEn || '',
                parasEn[1] || '',
                parasEn[2] || '',
                parasEn[0] || '',
                descEn || '',
                ...(Array.isArray(guide?.pagesEn) ? guide.pagesEn.slice(2, 8) : []),
            ])), 3).slice(0, 520),
        },
        beforeAfter: {
            oldUri: compareOldUri || '',
            newUri: compareNew || thumbUri,
        },
        // Closing wow-fact for the post-quiz card — NOT a sources bibliography
        // (sources stay in sourceUrls → final actions «Джерела» button).
        secondFact: {
            titleUk: `Ще один штрих`,
            titleEn: `One more detail`,
            bodyUk: clampGuideParagraphs(cleanWikiPlainText(pickClosingWowFact([
                ...(Array.isArray(guide?.pagesUk) ? [...guide.pagesUk].reverse() : []),
                parasUk[3] || '',
                parasUk[2] || '',
                parasUk[1] || '',
                page1Uk,
                descUk,
            ])), 3).slice(0, 520),
            bodyEn: clampGuideParagraphs(cleanWikiPlainText(pickClosingWowFact([
                ...(Array.isArray(guide?.pagesEn) ? [...guide.pagesEn].reverse() : []),
                parasEn[3] || '',
                parasEn[2] || '',
                parasEn[1] || '',
                page1En,
                descEn,
            ])), 3).slice(0, 520),
        },
        // Closing wow-fact — never a Save/Share / Sources CTA (headphones + Sources live in UI chrome)
        closingUk: clampGuideParagraphs(cleanWikiPlainText(pickClosingWowFact([
            parasUk[4] || '',
            parasUk[5] || '',
            ...(Array.isArray(guide?.pagesUk) ? guide.pagesUk.slice(-3) : []),
            page1Uk,
        ])), 2).slice(0, 420) ||
            `Коли стоїте біля ${titleUk}, зверніть увагу на деталі, які важко помітити з першого погляду.`,
        closingEn: clampGuideParagraphs(cleanWikiPlainText(pickClosingWowFact([
            parasEn[4] || '',
            parasEn[5] || '',
            ...(Array.isArray(guide?.pagesEn) ? guide.pagesEn.slice(-3) : []),
            page1En,
        ])), 2).slice(0, 420) ||
            `When you stand by ${titleEn}, notice the details that are easy to miss at first glance.`,
        audioScriptUk: audioUk,
        audioScriptEn: audioEn,
        ttsEnabled: true,
        sourceUrls: input.sources,
        wikipediaUrl: input.sources[0] || '',
        personMentions: Array.isArray(input.personMentions) ? input.personMentions : [],
        _wikiGenerated: true,
        _meta: {
            pageCount: 13,
            photoCount: input.images.length,
            guideFromOpenAI: !!guide,
            thumbUri,
            personMentions: Array.isArray(input.personMentions) ? input.personMentions.length : 0,
        },
    };
}
/** Prefer a concrete, surprising paragraph — skip source lists / thin stubs. */
function pickClosingWowFact(candidates) {
    const scored = (candidates || [])
        .map((raw) => cleanWikiPlainText(String(raw || '').trim()))
        .filter(Boolean)
        .map((t) => {
        const first = t
            .split(/\n\n+/)
            .map((p) => p.trim())
            .find((p) => p.length >= 80) || t.slice(0, 420);
        let score = first.length;
        if (/\b(1[0-9]{3}|20[0-2][0-9])\b/.test(first))
            score += 40;
        if (/\*\*[^*]{4,}\*\*/.test(first))
            score += 30;
        if (/метр|meter|тонн|тон|шпиль|spire|орган|organ|вітраж|stained|обстріл|shell|ракет/i.test(first))
            score += 35;
        if (/матеріал зібрано|wikipedia|джерела та контекст|sources and context/i.test(first))
            score -= 200;
        return { text: first, score };
    })
        .filter((x) => x.score > 40 && x.text.length >= 60)
        .sort((a, b) => b.score - a.score);
    return scored[0]?.text || '';
}
function emptyItemTrace(index, item) {
    return {
        index,
        name: item.name,
        address: item.address || '',
        status: 'pending',
        queries: [],
        wikiEn: null,
        wikiUk: null,
        extractUkPreview: '',
        extractEnPreview: '',
        extractUkChars: 0,
        extractEnChars: 0,
        lat: null,
        lng: null,
        imagesFound: [],
        imagesHosted: [],
        thumbUri: '',
        sources: [],
        translatedLangs: [],
        published: false,
    };
}
export async function enrichLocationsFromVerifiedSources(input) {
    const country = String(input.country || '').trim();
    const city = String(input.city || '').trim();
    const rehostImages = input.rehostImages !== false;
    const items = input.items
        .map((item) => ({ name: String(item.name || '').trim(), address: String(item.address || '').trim() }))
        .filter((item) => item.name)
        .slice(0, 100);
    const emit = async (partial) => {
        await input.onEvent?.({ ...partial, ts: nowIso() });
    };
    const wasRemoved = (itemIndex) => input.shouldSkipItem?.(itemIndex) === true;
    const abortIfRemoved = async (itemIndex, itemName, trace) => {
        if (!wasRemoved(itemIndex))
            return false;
        trace.status = 'removed';
        trace.skipReason = 'видалено в інспекторі';
        await input.onItemTrace?.(trace);
        await emit({
            level: 'warn',
            step: 'skip',
            itemIndex,
            itemName,
            message: `Видалено з імпорту: «${itemName}»`,
        });
        return true;
    };
    await emit({
        level: 'info',
        step: 'start',
        message: `Старт імпорту: ${items.length} локацій · ${city || '—'}, ${country || '—'}`,
        data: { total: items.length, city, country },
    });
    const landmarks = [];
    for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (await abortIfRemoved(i, item.name, emptyItemTrace(i, item)))
            continue;
        const trace = emptyItemTrace(i, item);
        trace.status = 'running';
        await input.onItemTrace?.(trace);
        await input.onProgress?.({
            done: i + 1,
            total: items.length,
            currentName: item.name,
            phase: 'enrich',
        });
        await emit({
            level: 'info',
            step: 'start',
            itemIndex: i,
            itemName: item.name,
            message: `Локація ${i + 1}/${items.length}: «${item.name}»${item.address ? ` — ${item.address}` : ''}`,
        });
        try {
            if (await abortIfRemoved(i, item.name, trace))
                continue;
            const placeCtx = { name: item.name, address: item.address, city, country };
            const queries = [
                `"${item.name}" ${city}`,
                `${item.name} ${city}`,
                `${item.name} (${city})`,
                item.address ? `${item.name} ${item.address} ${city}` : '',
                `${item.name} ${city} ${country}`.trim(),
            ].filter(Boolean);
            trace.queries = queries;
            await emit({
                level: 'info',
                step: 'search',
                itemIndex: i,
                itemName: item.name,
                message: `Пошук лише в межах «${city || '—'}», ${country || '—'} (не інші міста)`,
                data: { queries, city, country },
            });
            let ukHit = await resolveWikiHitForPlace({ ...placeCtx, lang: 'uk' });
            await emit({
                level: ukHit ? 'ok' : 'warn',
                step: 'wiki',
                itemIndex: i,
                itemName: item.name,
                message: ukHit
                    ? `UK обрано «${ukHit.title}» (прив’язка до ${city || 'міста'})`
                    : `UK: не знайдено сторінку саме для ${city || 'міста'}`,
                data: { lang: 'uk', selected: ukHit?.title || null, candidates: ukHit?.candidates || [] },
            });
            let enHit = null;
            // Prefer EN langlink from the correct UK page — avoids wrong EN war/culture articles
            if (ukHit) {
                const enTitle = await wikiLangLink(ukHit.origin, ukHit.title, 'en');
                if (enTitle) {
                    const enData = await wikiExtract('https://en.wikipedia.org', enTitle);
                    if (!enData.missing && enData.extract.length > 80 && !isBadWikiPage(enData.pageTitle, enData.extract)) {
                        enHit = {
                            origin: 'https://en.wikipedia.org',
                            title: enData.pageTitle,
                            data: enData,
                            candidates: [enData.pageTitle],
                        };
                        await emit({
                            level: 'ok',
                            step: 'wiki',
                            itemIndex: i,
                            itemName: item.name,
                            message: `EN через langlink з UK: «${enHit.title}»`,
                            data: { lang: 'en', selected: enHit.title },
                        });
                    }
                }
            }
            if (!enHit) {
                enHit = await resolveWikiHitForPlace({ ...placeCtx, lang: 'en' });
                await emit({
                    level: enHit ? 'ok' : 'warn',
                    step: 'wiki',
                    itemIndex: i,
                    itemName: item.name,
                    message: enHit
                        ? `EN обрано «${enHit.title}» (прив’язка до ${city || 'міста'})`
                        : `EN: не знайдено сторінку саме для ${city || 'міста'}`,
                    data: { lang: 'en', selected: enHit?.title || null, candidates: enHit?.candidates || [] },
                });
            }
            if (!ukHit && enHit) {
                const ukTitle = await wikiLangLink(enHit.origin, enHit.title, 'uk');
                if (ukTitle) {
                    const ukData = await wikiExtract('https://uk.wikipedia.org', ukTitle);
                    if (!ukData.missing && ukData.extract.length > 80 && !isBadWikiPage(ukData.pageTitle, ukData.extract)) {
                        ukHit = {
                            origin: 'https://uk.wikipedia.org',
                            title: ukData.pageTitle,
                            data: ukData,
                            candidates: [ukData.pageTitle],
                        };
                    }
                }
                if (!ukHit)
                    ukHit = await resolveWikiHitForPlace({ ...placeCtx, lang: 'uk' });
            }
            const enData = enHit?.data ||
                (enHit
                    ? await wikiExtract(enHit.origin, enHit.title)
                    : { extract: '', pageTitle: item.name, lat: null, lng: null });
            const ukData = ukHit?.data ||
                (ukHit
                    ? await wikiExtract(ukHit.origin, ukHit.title)
                    : { extract: '', pageTitle: item.name, lat: null, lng: null });
            const titleEnRaw = enData.pageTitle || item.name;
            const titleUkRaw = ukData.pageTitle || item.name;
            let extractUk = cleanWikiPlainText(String(ukData.extract || ''));
            let extractEn = cleanWikiPlainText(String(enData.extract || ''));
            let titleEn = stripCityFromTitle(titleEnRaw, item.name);
            let titleUk = stripCityFromTitle(titleUkRaw, item.name);
            if (enHit) {
                trace.wikiEn = {
                    title: titleEnRaw,
                    url: pageUrl(enHit.origin, enData.pageTitle || enHit.title),
                    candidates: enHit.candidates || [titleEnRaw],
                };
            }
            if (ukHit) {
                trace.wikiUk = {
                    title: titleUkRaw,
                    url: pageUrl(ukHit.origin, ukData.pageTitle || ukHit.title),
                    candidates: ukHit.candidates || [titleUkRaw],
                };
            }
            trace.extractUkPreview = previewText(extractUk);
            trace.extractEnPreview = previewText(extractEn);
            trace.extractUkChars = extractUk.length;
            trace.extractEnChars = extractEn.length;
            trace.lat = ukData.lat ?? enData.lat ?? null;
            trace.lng = ukData.lng ?? enData.lng ?? null;
            await input.onItemTrace?.(trace);
            await emit({
                level: extractUk || extractEn ? 'ok' : 'warn',
                step: 'text',
                itemIndex: i,
                itemName: item.name,
                message: `Текст: UK ${extractUk.length} симв., EN ${extractEn.length} симв.${trace.lat != null ? ` · coords ${trace.lat}, ${trace.lng}` : ''}`,
                data: {
                    titleUk,
                    titleEn,
                    extractUkPreview: previewText(extractUk, 280),
                    extractEnPreview: previewText(extractEn, 280),
                    lat: trace.lat,
                    lng: trace.lng,
                },
            });
            let altImages = [];
            let altSources = [];
            let resolvedStreetAddress = String(item.address || '').trim();
            if (!extractUk && !extractEn) {
                const alt = await gatherAltPlaceContext({
                    name: item.name,
                    address: item.address,
                    city,
                    country,
                    emit,
                    itemIndex: i,
                });
                extractUk = alt.extractUk;
                extractEn = alt.extractEn;
                titleUk = alt.labelUk || titleUk;
                titleEn = alt.labelEn || titleEn;
                altImages = alt.images;
                altSources = alt.sources;
                if (!resolvedStreetAddress && alt.streetAddress) {
                    resolvedStreetAddress = String(alt.streetAddress).trim();
                }
                if (trace.lat == null)
                    trace.lat = alt.lat;
                if (trace.lng == null)
                    trace.lng = alt.lng;
                // If OSM/Wikidata pointed at a Wikipedia page, surface it in the inspector
                const wikiSrc = alt.sources.find((s) => /wikipedia\.org\/wiki\//i.test(s));
                if (wikiSrc && !trace.wikiUk && !trace.wikiEn) {
                    const isEn = /\/en\.wikipedia\.org\//i.test(wikiSrc);
                    const titleFromUrl = decodeURIComponent(wikiSrc.split('/wiki/')[1] || item.name).replace(/_/g, ' ');
                    if (isEn) {
                        trace.wikiEn = { title: titleFromUrl, url: wikiSrc, candidates: [titleFromUrl] };
                    }
                    else {
                        trace.wikiUk = { title: titleFromUrl, url: wikiSrc, candidates: [titleFromUrl] };
                    }
                }
                trace.extractUkPreview = previewText(extractUk);
                trace.extractEnPreview = previewText(extractEn);
                trace.extractUkChars = extractUk.length;
                trace.extractEnChars = extractEn.length;
                await input.onItemTrace?.(trace);
                await emit({
                    level: extractUk || extractEn ? 'ok' : 'warn',
                    step: 'text',
                    itemIndex: i,
                    itemName: item.name,
                    message: `Альтернативні джерела: UK ${extractUk.length} / EN ${extractEn.length} симв., фото ${altImages.length}`,
                    data: {
                        sources: altSources,
                        extractUkPreview: previewText(extractUk, 280),
                        extractEnPreview: previewText(extractEn, 280),
                    },
                });
            }
            if (!extractUk && !extractEn) {
                trace.status = 'skipped';
                trace.skipReason = 'не знайдено матеріалів ні у Wikipedia, ні у Wikidata/OSM';
                await input.onItemTrace?.(trace);
                await emit({
                    level: 'warn',
                    step: 'skip',
                    itemIndex: i,
                    itemName: item.name,
                    message: trace.skipReason,
                });
                await sleep(120);
                continue;
            }
            // Always deepen: related wiki pages (war/shelling/restoration), Wikidata events, documentary photos
            const deep = await gatherDeepLandmarkContext({
                name: item.name,
                titleUk,
                titleEn,
                city,
                country,
                extractUk,
                extractEn,
                emit,
                itemIndex: i,
            });
            extractUk = deep.extractUk;
            extractEn = deep.extractEn;
            altSources = [...new Set([...altSources, ...deep.sources])];
            const documentaryImages = deep.documentaryImages || [];
            trace.extractUkPreview = previewText(extractUk);
            trace.extractEnPreview = previewText(extractEn);
            trace.extractUkChars = extractUk.length;
            trace.extractEnChars = extractEn.length;
            await input.onItemTrace?.(trace);
            // Always resolve street for actions page (even when Wikipedia already matched)
            if (!resolvedStreetAddress) {
                await emit({
                    level: 'info',
                    step: 'search',
                    itemIndex: i,
                    itemName: item.name,
                    message: 'Шукаю вулицю / адресу в OpenStreetMap…',
                });
                const osmAddr = await nominatimLookup(item.name, item.address, city, country);
                await sleep(1100);
                if (osmAddr?.streetAddress) {
                    resolvedStreetAddress = osmAddr.streetAddress;
                }
                else if (osmAddr?.displayName) {
                    // First 1–2 OSM parts are usually street + house / neighbourhood
                    resolvedStreetAddress = osmAddr.displayName
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean)
                        .slice(0, 2)
                        .join(', ');
                }
                if (osmAddr?.lat != null && trace.lat == null)
                    trace.lat = osmAddr.lat;
                if (osmAddr?.lng != null && trace.lng == null)
                    trace.lng = osmAddr.lng;
                if (osmAddr?.url)
                    altSources.push(osmAddr.url);
                await emit({
                    level: resolvedStreetAddress ? 'ok' : 'warn',
                    step: 'search',
                    itemIndex: i,
                    itemName: item.name,
                    message: resolvedStreetAddress
                        ? `Адреса: ${resolvedStreetAddress}`
                        : 'Вулицю не знайдено — на actions буде місто + країна',
                    data: { address: resolvedStreetAddress || null },
                });
                await input.onItemTrace?.(trace);
            }
            const images = [
                ...altImages,
                ...(await collectImages(item, city, enHit, ukHit, titleEn, titleUk, emit, i)),
            ].filter((u, idx, arr) => u && arr.indexOf(u) === idx);
            const historicImages = await collectHistoricImages(item, city, titleEn, titleUk, emit, i);
            const imagesWithHistoric = [...historicImages, ...images, ...documentaryImages].filter((u, idx, arr) => u && arr.indexOf(u) === idx);
            trace.imagesFound = imagesWithHistoric.slice();
            await input.onItemTrace?.(trace);
            await emit({
                level: imagesWithHistoric.length ? 'ok' : 'warn',
                step: 'images',
                itemIndex: i,
                itemName: item.name,
                message: `Зібрано фото: ${images.length} + історичних ${historicImages.length} + документальних ${documentaryImages.length}`,
                data: {
                    images: imagesWithHistoric.slice(0, 16),
                    historic: historicImages.slice(0, 8),
                    documentary: documentaryImages.slice(0, 8),
                },
            });
            const sources = [
                enHit ? pageUrl(enHit.origin, enData.pageTitle) : '',
                ukHit ? pageUrl(ukHit.origin, ukData.pageTitle) : '',
                ...altSources,
                'https://commons.wikimedia.org/',
            ].filter(Boolean);
            trace.sources = [...new Set(sources)];
            await input.onProgress?.({
                done: i + 1,
                total: items.length,
                currentName: item.name,
                phase: 'translate',
            });
            await emit({
                level: 'info',
                step: 'translate',
                itemIndex: i,
                itemName: item.name,
                message: landmarkGuideUsesClaude()
                    ? 'Claude: 13 багатих сторінок (по 4 абзаци + реальні факти) + питання…'
                    : 'ChatGPT: 13 багатих сторінок (по 4 абзаци + реальні факти) + питання…',
            });
            const guide = await openaiBuildLandmarkGuide({
                titleUk,
                titleEn,
                cityUk: city,
                cityEn: city,
                extractUk: extractUk || extractEn,
                extractEn: extractEn || extractUk,
            });
            await emit({
                level: guide ? 'ok' : 'warn',
                step: 'translate',
                itemIndex: i,
                itemName: item.name,
                message: guide
                    ? landmarkGuideUsesClaude()
                        ? 'Гід зібрано через Claude (5–6 абзаців/сторінка, щільні факти, без wiki-копіпасту)'
                        : 'Гід зібрано через ChatGPT (5–6 абзаців/сторінка, щільні факти)'
                    : 'ШІ недоступний — збираю з очищеної Wikipedia',
            });
            // Commons/Wikipedia first for cinematic uniqueness; AI hero optional cover fill
            await emit({
                level: 'info',
                step: 'images',
                itemIndex: i,
                itemName: item.name,
                message: 'AI Images: обкладинка (Commons залишаються основними фото сторінок)…',
            });
            const aiPack = await generateLandmarkStoryPageImages({
                titleUk,
                titleEn,
                city,
                country,
                onProgress: async (label, done, total) => {
                    await emit({
                        level: 'info',
                        step: 'images',
                        itemIndex: i,
                        itemName: item.name,
                        message: `AI-фото ${done}/${total}: ${label}`,
                    });
                },
            });
            let imagesForStory = rankImagesForHero(imagesWithHistoric);
            const aiHero = aiPack.hero || '';
            const aiPage1 = aiPack.page1 || aiHero;
            const aiPagePhotos = aiPack.pages || [];
            const aiAll = [aiHero, aiPage1, ...aiPagePhotos].filter(Boolean);
            if (aiAll.length) {
                // Real photos lead the pool; AI only fills gaps (St Nicholas recipe)
                imagesForStory = [...imagesForStory.filter((u) => !aiAll.includes(u)), ...aiAll];
                await emit({
                    level: 'ok',
                    step: 'images',
                    itemIndex: i,
                    itemName: item.name,
                    message: `Пул фото: Commons ${imagesForStory.length - aiAll.length} + AI ${aiAll.length}`,
                    data: { heroUri: aiHero || null, aiCount: aiAll.length, pool: imagesForStory.length },
                });
            }
            else {
                await emit({
                    level: 'warn',
                    step: 'images',
                    itemIndex: i,
                    itemName: item.name,
                    message: 'AI-фото недоступні — беру реальні Wikipedia/Commons (без руїн/риштувань)',
                });
            }
            const commonsHero = imagesForStory.find((u) => !isUnattractiveLandmarkPhotoUrl(u) && !aiAll.includes(u)) ||
                imagesForStory.find((u) => !isUnattractiveLandmarkPhotoUrl(u)) ||
                imagesForStory[0] ||
                '';
            const heroUri = commonsHero || aiHero || '';
            const comparePair = await resolvePage3ComparePair({
                titleUk,
                titleEn,
                city,
                country,
                modernUri: heroUri,
                allImages: imagesForStory,
                historicImages,
                emit,
                itemIndex: i,
                itemName: item.name,
            });
            if (comparePair.oldUri && !imagesForStory.includes(comparePair.oldUri)) {
                imagesForStory = [comparePair.oldUri, ...imagesForStory];
            }
            await emit({
                level: 'info',
                step: 'images',
                itemIndex: i,
                itemName: item.name,
                message: 'Шукаю реальні фото людей, згаданих у гіда…',
            });
            const personMentions = await withTimeout(resolvePersonMentions(guide?.people, emit, i, item.name), 50000, [], 'person-mentions');
            await emit({
                level: personMentions.length ? 'ok' : 'info',
                step: 'images',
                itemIndex: i,
                itemName: item.name,
                message: personMentions.length
                    ? `Знайдено портрети: ${personMentions.length} (${personMentions.map((p) => p.nameUk || p.nameEn).join(', ')})`
                    : 'Окремих портретів не знайдено (імена все одно будуть клікабельні з живим пошуком)',
            });
            trace.imagesFound = imagesForStory.slice();
            if (heroUri)
                trace.thumbUri = heroUri;
            await input.onItemTrace?.(trace);
            const story = buildStory({
                titleUk: guide?.titleUk || titleUk,
                titleEn: guide?.titleEn || titleEn,
                descUk: extractUk || extractEn || '',
                descEn: extractEn || extractUk || '',
                images: imagesForStory,
                sources,
                guide,
                heroUri,
                page1PhotoUri: heroUri || '',
                pagePhotos: aiPagePhotos,
                compareOldUri: comparePair.oldUri,
                compareNewUri: comparePair.newUri || heroUri,
                personMentions,
            });
            const finalTitleUk = stripCityFromTitle(guide?.titleUk || titleUk, titleUk);
            const finalTitleEn = stripCityFromTitle(guide?.titleEn || titleEn, titleEn);
            const thumbUri = heroUri ||
                (story._meta && typeof story._meta === 'object' && story._meta.thumbUri) ||
                imagesForStory[0] ||
                '';
            const visitCategory = inferVisitCategoryFromTexts(finalTitleUk, finalTitleEn, item.name, item.address, guide?.descUk, guide?.descEn, extractUk?.slice(0, 400), extractEn?.slice(0, 400));
            const landmarkAddress = String(item.address || resolvedStreetAddress || '').trim();
            let landmark = {
                id: slugifyId(finalTitleEn || finalTitleUk || item.name),
                titleUk: finalTitleUk,
                titleEn: finalTitleEn,
                lat: trace.lat ?? ukData.lat ?? enData.lat ?? 0,
                lng: trace.lng ?? ukData.lng ?? enData.lng ?? 0,
                minutes: 35,
                free: true,
                category: visitCategory,
                descUk: cleanWikiPlainText(guide?.descUk || splitParagraphs(extractUk)[0] || extractUk || item.address || finalTitleUk).slice(0, 700),
                descEn: cleanWikiPlainText(guide?.descEn || splitParagraphs(extractEn)[0] || extractEn || item.address || finalTitleEn).slice(0, 700),
                ...(landmarkAddress ? { address: landmarkAddress } : {}),
                thumbUri,
                galleryUris: imagesForStory.filter((u) => u && !isJunkLandmarkPhotoUrl(u)),
                sourceUrls: sources,
                story,
            };
            if (await abortIfRemoved(i, item.name, trace))
                continue;
            if (rehostImages) {
                await input.onProgress?.({
                    done: i + 1,
                    total: items.length,
                    currentName: item.name,
                    phase: 'rehost',
                });
                const toHost = Array.isArray(landmark.galleryUris) ? landmark.galleryUris.length : 0;
                await emit({
                    level: 'info',
                    step: 'rehost',
                    itemIndex: i,
                    itemName: item.name,
                    message: `Зберігаю фото на сервер (${toHost} у галереї + story)…`,
                });
                try {
                    landmark = await withTimeout(rehostLandmarkMediaFields(landmark), 180000, landmark, 'rehost-media');
                }
                catch (rehostErr) {
                    await emit({
                        level: 'warn',
                        step: 'rehost',
                        itemIndex: i,
                        itemName: item.name,
                        message: `Rehost частково не вдався: ${rehostErr?.message || rehostErr} — лишаю URL як є`,
                    });
                }
                const hosted = Array.isArray(landmark.galleryUris)
                    ? landmark.galleryUris.filter((u) => u && !/^https?:\/\/(upload\.wikimedia|commons)/i.test(u))
                    : [];
                const anyHosted = Array.isArray(landmark.galleryUris)
                    ? landmark.galleryUris.filter((u) => /^https?:\/\//i.test(u) && !/wikipedia|wikimedia/i.test(u))
                    : [];
                const hostedCount = anyHosted.length || hosted.length;
                trace.imagesHosted = Array.isArray(landmark.galleryUris) ? landmark.galleryUris.filter(Boolean) : [];
                trace.thumbUri = landmark.thumbUri || trace.imagesHosted[0] || '';
                await input.onItemTrace?.(trace);
                await emit({
                    level: hostedCount || trace.imagesHosted.length ? 'ok' : 'warn',
                    step: 'rehost',
                    itemIndex: i,
                    itemName: item.name,
                    message: `На сервері / у бандлі: ${trace.imagesHosted.length} фото`,
                    data: { images: trace.imagesHosted.slice(0, 12), thumbUri: trace.thumbUri },
                });
            }
            else {
                trace.imagesHosted = images.slice();
                trace.thumbUri = images[0] || '';
            }
            if (await abortIfRemoved(i, item.name, trace))
                continue;
            await input.onProgress?.({
                done: i + 1,
                total: items.length,
                currentName: item.name,
                phase: 'translate',
            });
            await emit({
                level: 'info',
                step: 'translate',
                itemIndex: i,
                itemName: item.name,
                message: 'Перекладаю весь гід (сторінки, квіз, факти) на всі мови застосунку — якісний літературний переклад…',
            });
            try {
                landmark = await withTimeout(localizeLandmarkForAllAppLanguages(landmark, {
                    onBatch: async (done, total, langs) => {
                        await emit({
                            level: 'info',
                            step: 'translate',
                            itemIndex: i,
                            itemName: item.name,
                            message: `Переклад батч ${done}/${total}: ${langs.join(', ')}`,
                        });
                        await input.onProgress?.({
                            done: i + 1,
                            total: items.length,
                            currentName: item.name,
                            phase: 'translate',
                        });
                    },
                }), 12 * 60 * 1000, landmark, 'localize-all-langs');
            }
            catch (trErr) {
                await emit({
                    level: 'warn',
                    step: 'translate',
                    itemIndex: i,
                    itemName: item.name,
                    message: `Переклад з помилкою: ${trErr?.message || trErr} — публікую UK/EN`,
                });
            }
            const langs = landmark?.titleI18n && typeof landmark.titleI18n === 'object' ? Object.keys(landmark.titleI18n) : [];
            const bodiesI18n = Array.isArray(landmark?.story?.introPagesBodiesI18n)
                ? landmark.story.introPagesBodiesI18n
                : [];
            const pageLangCount = bodiesI18n[0] && typeof bodiesI18n[0] === 'object' ? Object.keys(bodiesI18n[0]).length : 0;
            trace.translatedLangs = langs;
            trace.status = 'ok';
            await input.onItemTrace?.(trace);
            await emit({
                level: 'ok',
                step: 'translate',
                itemIndex: i,
                itemName: item.name,
                message: `Переклад готовий: ${langs.length} мов · ${bodiesI18n.length} сторінок гіда × ${pageLangCount || langs.length} мов`,
                data: { langs, pages: bodiesI18n.length, pageLangCount },
            });
            if (await abortIfRemoved(i, item.name, trace))
                continue;
            landmarks.push(landmark);
            await input.onLandmarkReady?.(landmark, i);
            await emit({
                level: 'ok',
                step: 'done',
                itemIndex: i,
                itemName: item.name,
                message: `Готово: «${titleUk || titleEn}»`,
                data: {
                    id: landmark.id,
                    titleUk,
                    titleEn,
                    thumbUri: landmark.thumbUri || '',
                },
            });
            await sleep(250);
        }
        catch (e) {
            trace.status = 'error';
            trace.error = e?.message || String(e);
            await input.onItemTrace?.(trace);
            await emit({
                level: 'err',
                step: 'skip',
                itemIndex: i,
                itemName: item.name,
                message: `Помилка: ${trace.error}`,
            });
        }
    }
    await input.onProgress?.({
        done: items.length,
        total: items.length,
        currentName: '',
        phase: 'enrich',
    });
    await emit({
        level: 'ok',
        step: 'done',
        message: `Імпорт завершено: ${landmarks.length}/${items.length} локацій`,
        data: { saved: landmarks.length, total: items.length },
    });
    return { landmarks };
}
//# sourceMappingURL=locationAiEnrichmentService.js.map