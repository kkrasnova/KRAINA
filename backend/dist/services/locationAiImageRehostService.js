import { aiRouteConfig, geminiConfig, landmarkImageProviderOrder } from '../config.js';
import { saveLandmarkMedia } from './landmarkContentAdminService.js';
const UA = 'KRAINA-LocationEnrichment/1.0 (admin verified-source import)';
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
function extFromUrlOrType(url, contentType) {
    const ct = String(contentType || '').toLowerCase();
    if (ct.includes('png') || /\.png(\?|$)/i.test(url))
        return '.png';
    if (ct.includes('webp') || /\.webp(\?|$)/i.test(url))
        return '.webp';
    if (ct.includes('gif') || /\.gif(\?|$)/i.test(url))
        return '.gif';
    return '.jpg';
}
export function isAlreadyHostedLandmarkMedia(url) {
    const u = String(url || '');
    return /\/static\/landmark-content\//i.test(u) || /landmark-content\/media\//i.test(u);
}
/** Icons/maps only — war/damage photos allowed for documentary story pages. */
export function isNonPhotoJunkUrl(url) {
    const u = String(url || '').toLowerCase();
    if (!u)
        return true;
    return /\/icon|icon_|_icon|logo|flag|map_|_map|locator|symbol|coat.?of.?arms|emblem|diagram|floor.?plan|site.?plan|wikidata|qr.?code|\.svg($|\?)|signage|plaque|infobox|commons-logo|edit.?button|speaker.?icon|padlock/i.test(u);
}
/** Reject war / scaffold / ruins URLs for hero & card covers. */
export function isUnattractiveLandmarkPhotoUrl(url) {
    const u = String(url || '').toLowerCase();
    return /scaffold|scaffolding|destroyed|destruction|ruin|rubble|damage|damaged|war_|_war|bombard|missile|shelling|fire_damage|burned|burnt|collapse|construction_fence|covered_in|netting|ukraine.?war|russian.?invasion|руїн|разруш|обстріл|обстрел|риштуван/i.test(u);
}
/** Reject icons, maps, diagrams and other non-photo junk for story pages. */
export function isJunkLandmarkPhotoUrl(url) {
    const u = String(url || '').toLowerCase();
    if (!u)
        return true;
    if (isUnattractiveLandmarkPhotoUrl(u))
        return true;
    return isNonPhotoJunkUrl(u);
}
/** True when URL looks like war / damage / ruin documentation (for story pages). */
export function isDocumentaryDamagePhotoUrl(url) {
    const u = String(url || '').toLowerCase();
    return /destroyed|destruction|ruin|rubble|damage|damaged|war_|_war|bombard|missile|shelling|fire_damage|burned|burnt|collapse|ukraine.?war|russian.?invasion|руїн|разруш|обстріл|обстрел|scaffold|scaffolding|риштуван/i.test(u);
}
/** Prefer inviting travel photos for main card / page 1. */
export function scoreAttractivePhotoUrl(url) {
    const u = String(url || '').toLowerCase();
    if (!u)
        return -999;
    let s = 0;
    if (isJunkLandmarkPhotoUrl(u))
        s -= 200;
    if (/exterior|facade|façade|front|panorama|aerial|drone|sunset|sunrise|night.?view|illuminat|golden|beautiful|view_of|cathedral|church|castle|palace|square/i.test(u))
        s += 40;
    if (/interior|museum.?exhibit|plaque|sign|map|diagram|plan|drawing|engraving|postcard|bw_|black.?white|sepia/i.test(u))
        s -= 25;
    if (/1280px|1920px|2048px/i.test(u))
        s += 5;
    return s;
}
export function rankImagesForHero(urls) {
    return [...new Set((urls || []).filter(Boolean))].sort((a, b) => scoreAttractivePhotoUrl(b) - scoreAttractivePhotoUrl(a));
}
/**
 * Generate a historical (100–200 years ago) version of the landmark for page-3 compare.
 * Same viewpoint as the modern photo — archival sepia / early photo look.
 */
/**
 * Build a same-angle historic twin of a modern landmark photo for the
 * vertical then/now slider (9:16, identical framing).
 *
 * Prefer OpenAI gpt-image edits with the modern photo as reference (+ optional
 * historic postcard as style cue). Fall back to text-only generation.
 */
export async function generateLandmarkHistoricCompareImage(input) {
    const title = String(input.titleEn || input.titleUk || '').trim();
    const place = [input.city, input.country].filter(Boolean).join(', ');
    const hint = String(input.modernViewHint || '').trim();
    const modernUri = String(input.modernUri || '').trim();
    const historicRefUri = String(input.historicRefUri || '').trim();
    const prompt = [
        `Create a historical archival photograph (circa 1890–1930) of "${title}"${place ? ` in ${place}` : ''}.`,
        'CRITICAL GEOMETRY: match the REFERENCE modern photo EXACTLY — same camera angle, same lens distance, same framing, same vertical 9:16 crop, same position of towers/facade/horizon in the frame.',
        'Only change the era: period materials, street life (horses, carts, period clothing), NO cars, NO asphalt highways, NO modern signs, NO scaffolding, NO war damage.',
        historicRefUri
            ? 'Use the optional historic reference only for era atmosphere (sepia/B&W grain, clothing, street) — NOT for a different camera angle.'
            : 'Authentic early photography: sepia or black-and-white, slight grain, looks like a real archive print.',
        hint || 'Main exterior facade / towers, full building readable in frame.',
        'Photoreal photograph only — not an illustration, painting, or AI fantasy rebuild.',
    ].join(' ');
    // 1) Image-conditioned edit from the modern photo (best slider alignment)
    if (modernUri) {
        const edited = await generateHistoricCompareViaOpenAIEdit({
            prompt,
            modernUri,
            historicRefUri: historicRefUri || undefined,
            fileHint: 'compare-historic-match.png',
        });
        if (edited)
            return edited;
    }
    // 2) Text-only fallback (Imagen / gpt-image generations)
    return generateLandmarkSceneImage({
        titleUk: input.titleUk,
        titleEn: input.titleEn,
        city: input.city,
        country: input.country,
        scene: prompt,
        fileHint: 'compare-historic-ai.png',
    });
}
async function fetchImageBytesForEdit(url) {
    const src = String(url || '').trim();
    if (!/^https?:\/\//i.test(src))
        return null;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 25000);
    try {
        const res = await fetch(src, {
            headers: { 'User-Agent': UA, Accept: 'image/*,*/*' },
            signal: ac.signal,
            redirect: 'follow',
        });
        if (!res.ok)
            return null;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 80 || buf.length > 12 * 1024 * 1024)
            return null;
        const ct = String(res.headers.get('content-type') || '').toLowerCase();
        const ext = extFromUrlOrType(src, ct);
        const mime = ct.includes('png') || ext === '.png'
            ? 'image/png'
            : ct.includes('webp') || ext === '.webp'
                ? 'image/webp'
                : 'image/jpeg';
        return { buf, mime, name: `ref${ext}` };
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(timer);
    }
}
/**
 * OpenAI Images Edits (gpt-image-1): modern photo → same-angle historic twin.
 * Optionally attach a real historic postcard as a second reference for period style.
 */
async function generateHistoricCompareViaOpenAIEdit(input) {
    const apiKey = aiRouteConfig.apiKey;
    if (!apiKey)
        return null;
    const model = process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-1';
    if (!/^gpt-image/i.test(model) && !/^dall-e-2$/i.test(model)) {
        // edits API is primarily for gpt-image / dall-e-2
    }
    const modern = await fetchImageBytesForEdit(input.modernUri);
    if (!modern)
        return null;
    const endpoint = `${aiRouteConfig.baseUrl.replace(/\/$/, '')}/images/edits`;
    const size = process.env.OPENAI_IMAGE_SIZE?.trim() || '1024x1536';
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 180000);
    try {
        const form = new FormData();
        form.append('model', model);
        form.append('prompt', input.prompt.slice(0, 3200));
        form.append('n', '1');
        form.append('size', size);
        if (/^gpt-image/i.test(model)) {
            form.append('quality', process.env.OPENAI_IMAGE_QUALITY?.trim() || 'high');
        }
        form.append('image', new Blob([new Uint8Array(modern.buf)], { type: modern.mime }), modern.name);
        if (input.historicRefUri) {
            const hist = await fetchImageBytesForEdit(input.historicRefUri);
            if (hist) {
                // gpt-image-1 accepts multiple reference images under the same field name
                form.append('image', new Blob([new Uint8Array(hist.buf)], { type: hist.mime }), `historic-${hist.name}`);
            }
        }
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
            body: form,
            signal: ac.signal,
        });
        const raw = await res.text();
        if (!res.ok) {
            console.warn('[landmarkImage:openai-edit]', res.status, raw.slice(0, 320));
            // Retry once without historic ref / with square size if portrait rejected
            if (res.status === 400 || res.status === 422) {
                const form2 = new FormData();
                form2.append('model', model);
                form2.append('prompt', input.prompt.slice(0, 3200));
                form2.append('n', '1');
                form2.append('size', '1024x1024');
                if (/^gpt-image/i.test(model)) {
                    form2.append('quality', process.env.OPENAI_IMAGE_QUALITY?.trim() || 'high');
                }
                form2.append('image', new Blob([new Uint8Array(modern.buf)], { type: modern.mime }), modern.name);
                const res2 = await fetch(endpoint, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${apiKey}` },
                    body: form2,
                    signal: ac.signal,
                });
                const raw2 = await res2.text();
                if (!res2.ok) {
                    console.warn('[landmarkImage:openai-edit-retry]', res2.status, raw2.slice(0, 280));
                    return null;
                }
                let json2 = null;
                try {
                    json2 = JSON.parse(raw2);
                }
                catch {
                    return null;
                }
                return persistGeneratedImage(json2, input.fileHint);
            }
            return null;
        }
        let json = null;
        try {
            json = JSON.parse(raw);
        }
        catch {
            console.warn('[landmarkImage:openai-edit] bad JSON', raw.slice(0, 180));
            return null;
        }
        return persistGeneratedImage(json, input.fileHint);
    }
    catch (e) {
        console.warn('[landmarkImage:openai-edit] error', e);
        return null;
    }
    finally {
        clearTimeout(timer);
    }
}
/**
 * Score how likely a Commons/Wiki URL is a real historic (pre-1950) photo.
 */
export function scoreHistoricPhotoUrl(url) {
    const u = String(url || '').toLowerCase();
    if (!u)
        return -999;
    let s = 0;
    if (/postcard|engraving|lithograph|etching|drawing|painting|archive|antique|vintage|sepia|black.?white|bw_|історич|старий|листівк|доревол/i.test(u))
        s += 50;
    if (/historic|history|old.?photo|19th|18th|1910|1900|1890|1880|1870|1920|1930|1940/i.test(u))
        s += 35;
    if (/\b(1[6-8]\d{2}|19[0-4]\d)\b/.test(u))
        s += 40;
    if (/modern|aerial|drone|202\d|201\d|200\d|facade.?today|night.?view|iphone|samsung/i.test(u))
        s -= 40;
    if (isUnattractiveLandmarkPhotoUrl(u))
        s -= 30;
    return s;
}
export function pickBestHistoricPhoto(urls, minScore = 25) {
    const ranked = [...new Set((urls || []).filter(Boolean))].sort((a, b) => scoreHistoricPhotoUrl(b) - scoreHistoricPhotoUrl(a));
    const best = ranked[0] || '';
    if (!best || scoreHistoricPhotoUrl(best) < minScore)
        return '';
    return best;
}
function buildLandmarkPhotoPrompt(input) {
    const title = String(input.titleEn || input.titleUk || '').trim();
    const city = String(input.city || '').trim();
    const country = String(input.country || '').trim();
    const place = [city, country].filter(Boolean).join(', ');
    const scene = String(input.scene || '').trim();
    return [
        `Photorealistic travel photograph of the real landmark "${title}"${place ? ` in ${place}` : ''}.`,
        scene || 'Show the landmark architecture looking beautiful and inviting.',
        'Must look like a real camera photo of this specific building/place — correct architecture if known.',
        'Sharp details, cinematic composition, vertical phone-friendly framing.',
        'No scaffolding, no construction nets, no war damage, no ruins, no rubble, no text watermarks, no logos.',
        'FORBIDDEN: icons, logos, clipart, maps, diagrams, paintings, illustrations, cartoons, 3D toys, religious icons on flat gold background.',
        'Photorealistic photograph only.',
    ].join(' ');
}
async function persistBase64Image(b64, fileName = 'scene-ai.png') {
    const raw = String(b64 || '').replace(/^data:image\/\w+;base64,/, '').trim();
    if (!raw)
        return null;
    const buf = Buffer.from(raw, 'base64');
    if (buf.length < 80)
        return null;
    const name = fileName.endsWith('.png') || fileName.endsWith('.jpg') ? fileName : `${fileName}.png`;
    const saved = await saveLandmarkMedia(buf, name);
    return saved.url;
}
/** Google Imagen 4 via Gemini API — best photorealism / price for landmarks. */
async function generateLandmarkImageViaGemini(prompt, fileHint) {
    const apiKey = geminiConfig.apiKey;
    if (!apiKey)
        return null;
    const model = geminiConfig.imagenModel || 'imagen-4.0-generate-001';
    const aspect = process.env.GEMINI_IMAGE_ASPECT?.trim() || '9:16';
    const imageSize = process.env.GEMINI_IMAGE_SIZE?.trim() || '1K';
    const endpoint = `${geminiConfig.baseUrl}/v1beta/models/${encodeURIComponent(model)}:predict`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 180000);
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
            },
            body: JSON.stringify({
                instances: [{ prompt }],
                parameters: {
                    sampleCount: 1,
                    aspectRatio: aspect,
                    ...(model.includes('fast') ? {} : { imageSize }),
                    personGeneration: 'allow_adult',
                },
            }),
            signal: ac.signal,
        });
        const raw = await res.text();
        if (!res.ok) {
            console.warn('[landmarkImage:gemini]', res.status, raw.slice(0, 280));
            return null;
        }
        let json = null;
        try {
            json = JSON.parse(raw);
        }
        catch {
            console.warn('[landmarkImage:gemini] bad JSON', raw.slice(0, 180));
            return null;
        }
        const pred = Array.isArray(json?.predictions) ? json.predictions[0] : null;
        const b64 = (typeof pred?.bytesBase64Encoded === 'string' && pred.bytesBase64Encoded) ||
            (typeof pred?.image?.bytesBase64Encoded === 'string' && pred.image.bytesBase64Encoded) ||
            '';
        if (!b64) {
            console.warn('[landmarkImage:gemini] no image bytes in response');
            return null;
        }
        return persistBase64Image(b64, fileHint);
    }
    catch (e) {
        console.warn('[landmarkImage:gemini] error', e);
        return null;
    }
    finally {
        clearTimeout(timer);
    }
}
async function generateLandmarkImageViaOpenAI(prompt, fileHint) {
    const apiKey = aiRouteConfig.apiKey;
    if (!apiKey)
        return null;
    const model = process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-1';
    const endpoint = `${aiRouteConfig.baseUrl.replace(/\/$/, '')}/images/generations`;
    const isGptImage = /^gpt-image/i.test(model);
    const isDalle = /^dall-e/i.test(model);
    const buildBody = (size) => {
        const body = {
            model,
            prompt,
            n: 1,
            size,
        };
        if (isDalle) {
            body.quality = process.env.OPENAI_IMAGE_QUALITY?.trim() || 'standard';
            if (model === 'dall-e-3')
                body.style = 'natural';
            body.response_format = 'url';
        }
        else if (isGptImage) {
            body.quality = process.env.OPENAI_IMAGE_QUALITY?.trim() || 'high';
        }
        return body;
    };
    const preferredSize = isGptImage
        ? process.env.OPENAI_IMAGE_SIZE?.trim() || '1024x1536'
        : process.env.OPENAI_IMAGE_SIZE?.trim() || '1024x1792';
    const fallbackSize = '1024x1024';
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 180000);
    try {
        const attempt = async (size) => {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(buildBody(size)),
                signal: ac.signal,
            });
            const raw = await res.text();
            if (!res.ok)
                return { ok: false, status: res.status, raw };
            let json = null;
            try {
                json = JSON.parse(raw);
            }
            catch {
                return { ok: false, status: res.status, raw: raw.slice(0, 240) };
            }
            return { ok: true, json };
        };
        let result = await attempt(preferredSize);
        if (!result.ok && (result.status === 400 || result.status === 422)) {
            result = await attempt(fallbackSize);
        }
        if (!result.ok) {
            console.warn('[landmarkImage:openai]', result.status, String(result.raw || '').slice(0, 280));
            return null;
        }
        return persistGeneratedImage(result.json, fileHint);
    }
    catch (e) {
        console.warn('[landmarkImage:openai] error', e);
        return null;
    }
    finally {
        clearTimeout(timer);
    }
}
/**
 * Generate a photorealistic scene image for a landmark story page.
 * Prefer Google Imagen 4 (Gemini API) when configured; OpenAI gpt-image as fallback.
 */
export async function generateLandmarkSceneImage(input) {
    const title = String(input.titleEn || input.titleUk || '').trim();
    if (!title)
        return null;
    const prompt = buildLandmarkPhotoPrompt(input);
    const fileHint = input.fileHint || 'scene-ai.png';
    const order = landmarkImageProviderOrder();
    for (const provider of order) {
        if (provider === 'gemini') {
            if (!geminiConfig.apiKey)
                continue;
            const url = await generateLandmarkImageViaGemini(prompt, fileHint);
            if (url)
                return url;
            continue;
        }
        if (provider === 'openai') {
            if (!aiRouteConfig.apiKey)
                continue;
            const url = await generateLandmarkImageViaOpenAI(prompt, fileHint);
            if (url)
                return url;
        }
    }
    console.warn('[landmarkImage] all providers failed — set GEMINI_API_KEY (Imagen) and/or OPENAI_API_KEY (gpt-image-1)');
    return null;
}
/** Cover / home-card hero (beautiful inviting shot). */
export async function generateLandmarkHeroImage(input) {
    return generateLandmarkSceneImage({
        ...input,
        scene: 'Travel magazine cover: beautiful sunny or golden-hour exterior so tourists want to visit. At most tiny distant people.',
        fileHint: 'hero-ai.png',
    });
}
/**
 * Beautiful AI covers + optional per-page photoreal scenes (Imagen / OpenAI).
 * LANDMARK_AI_PAGE_IMAGES:
 *   hero  — only cover + welcome (default; page bodies use unique Commons)
 *   all   — cover + welcome + each intro page (except compare slot)
 *   0/off — skip AI images entirely
 */
export async function generateLandmarkStoryPageImages(input) {
    const mode = String(process.env.LANDMARK_AI_PAGE_IMAGES || 'hero')
        .trim()
        .toLowerCase();
    if (mode === '0' || mode === 'off' || mode === 'false' || mode === 'none') {
        return { hero: '', page1: '', pages: Array.from({ length: 12 }, () => '') };
    }
    const pageScenes = [
        'Historic context: photoreal exterior of the landmark with period atmosphere, soft daylight, real architecture — NOT a painting, NOT an icon.',
        '', // page index 1 = then/now compare (real historic + modern / AI historic pair)
        'People & events: photoreal detail of a facade, portal, or courtyard where visitors stand; tiny distant people OK; real photo look.',
        'Cultural meaning: beautiful photoreal wide shot of the landmark in the city skyline or square, golden hour.',
        'Interesting fact angle: close photoreal architectural detail (tower, window, sculpture, roof) of THIS landmark only.',
        'Today: modern photoreal street-level view of the landmark looking inviting and well-kept.',
        'Nearby: photoreal view looking toward the landmark from an adjacent street or park.',
        'Legends mood: photoreal twilight/blue-hour exterior with gentle lights, cinematic but realistic.',
        'Symbols: photoreal distinctive feature of the building (spire, dome, facade ornament) filling the frame.',
        'Practical visit: photoreal approach path / entrance area, clear and welcoming.',
        'Atmosphere: photoreal interior or cloister/courtyard if typical for this place, else serene exterior morning light.',
        'Farewell: photoreal postcard-worthy full view of the landmark, sunny, sharp, travel-magazine quality.',
    ];
    const genPages = mode === 'all' || mode === '1' || mode === 'true' || mode === 'yes';
    const pageJobs = genPages ? pageScenes.filter((s) => s).length : 0;
    const total = 2 + pageJobs;
    let done = 0;
    let okCount = 0;
    const mark = async (label, uri) => {
        done += 1;
        if (uri)
            okCount += 1;
        await input.onProgress?.(uri ? `${label} ✓` : `${label} ✗`, done, total);
    };
    const hero = (await generateLandmarkHeroImage(input)) || '';
    await mark('hero', hero);
    await sleep(350);
    const page1Raw = (await generateLandmarkSceneImage({
        ...input,
        scene: 'Photorealistic travel photo of the landmark exterior, natural light, inviting for visitors. Real photograph look, NOT an icon, NOT a logo, NOT a drawing, NOT a religious painting, NOT a map. Different framing than a classic postcard hero — slightly closer or angled.',
        fileHint: 'page1-ai.png',
    })) || '';
    // Never silently reuse hero for page1 — callers assign a different real/AI photo instead.
    const page1 = page1Raw;
    await mark('page1', page1);
    if (!page1Raw && hero) {
        /* leave page1 empty so enrich can pick a distinct Commons/AI URL */
    }
    const pages = Array.from({ length: 12 }, () => '');
    if (genPages) {
        for (let i = 0; i < pageScenes.length; i += 1) {
            const scene = pageScenes[i];
            if (!scene)
                continue; // compare slot
            await sleep(400);
            const uri = (await generateLandmarkSceneImage({
                ...input,
                scene,
                fileHint: `page${i + 2}-ai.png`,
            })) || '';
            pages[i] = uri;
            await mark(`page${i + 2}`, uri);
        }
    }
    if (okCount === 0) {
        console.warn('[landmarkImage] all generations failed — set GEMINI_API_KEY (Imagen 4) and/or OPENAI_API_KEY (gpt-image-1)');
    }
    else {
        console.info(`[landmarkImage] generated ${okCount}/${total} images via ${landmarkImageProviderOrder().join('→')}`);
    }
    return { hero, page1: page1Raw || '', pages };
}
async function persistGeneratedImage(json, fileName = 'hero-ai.png') {
    const row = Array.isArray(json?.data) ? json.data[0] : null;
    if (!row)
        return null;
    if (typeof row.b64_json === 'string' && row.b64_json) {
        const buf = Buffer.from(row.b64_json, 'base64');
        if (buf.length < 80)
            return null;
        const saved = await saveLandmarkMedia(buf, fileName.endsWith('.png') ? fileName : `${fileName}.png`);
        return saved.url;
    }
    const remote = typeof row.url === 'string' ? row.url.trim() : '';
    if (!remote)
        return null;
    return rehostRemoteImage(remote);
}
export async function rehostRemoteImage(url) {
    const src = String(url || '').trim();
    if (!/^https?:\/\//i.test(src))
        return null;
    if (isAlreadyHostedLandmarkMedia(src))
        return src;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 22000);
        try {
            const res = await fetch(src, {
                headers: { 'User-Agent': UA, Accept: 'image/*,*/*' },
                signal: ac.signal,
                redirect: 'follow',
            });
            if (res.status === 429) {
                await sleep(900 * (attempt + 1));
                continue;
            }
            if (!res.ok)
                return null;
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length < 80 || buf.length > 12 * 1024 * 1024)
                return null;
            const ext = extFromUrlOrType(src, res.headers.get('content-type') || '');
            const saved = await saveLandmarkMedia(buf, `wiki${ext}`);
            return saved.url;
        }
        catch {
            await sleep(400 * (attempt + 1));
        }
        finally {
            clearTimeout(timer);
        }
    }
    return null;
}
export async function rehostImageList(urls, limit = 12) {
    const out = [];
    for (const url of urls.slice(0, limit)) {
        const hosted = await rehostRemoteImage(url);
        if (hosted && !out.includes(hosted))
            out.push(hosted);
        await sleep(80);
    }
    return out;
}
function rewriteUri(map, uri) {
    const u = typeof uri === 'string' ? uri.trim() : '';
    if (!u)
        return u;
    return map.get(u) || u;
}
export async function rehostLandmarkMediaFields(landmark) {
    if (!landmark || typeof landmark !== 'object')
        return landmark;
    const next = JSON.parse(JSON.stringify(landmark));
    const candidates = new Set();
    const add = (u) => {
        const s = typeof u === 'string' ? u.trim() : '';
        if (/^https?:\/\//i.test(s))
            candidates.add(s);
    };
    add(next.thumbUri);
    (Array.isArray(next.galleryUris) ? next.galleryUris : []).forEach(add);
    const story = next.story && typeof next.story === 'object' ? next.story : null;
    if (story) {
        add(story.photoFact?.bgUri);
        add(story.beforeAfter?.oldUri);
        add(story.beforeAfter?.newUri);
        add(story.introPage1PhotoUri);
        for (const pagesKey of ['introPagesUk', 'introPagesEn']) {
            const pages = Array.isArray(story[pagesKey]) ? story[pagesKey] : [];
            for (const page of pages) {
                add(page?.photoUri);
                add(page?.secondaryPhotoUri);
                add(page?.compareBeforeUri);
                add(page?.compareAfterUri);
                add(page?.illustrationUri);
            }
        }
        const people = Array.isArray(story.personMentions) ? story.personMentions : [];
        for (const person of people) {
            add(person?.photoUri);
        }
    }
    const map = new Map();
    for (const url of candidates) {
        const hosted = await rehostRemoteImage(url);
        if (hosted)
            map.set(url, hosted);
        await sleep(60);
    }
    if (next.thumbUri)
        next.thumbUri = rewriteUri(map, next.thumbUri);
    if (Array.isArray(next.galleryUris)) {
        next.galleryUris = next.galleryUris.map((u) => rewriteUri(map, u)).filter(Boolean);
    }
    if (story) {
        if (story.photoFact?.bgUri)
            story.photoFact.bgUri = rewriteUri(map, story.photoFact.bgUri);
        if (story.beforeAfter?.oldUri)
            story.beforeAfter.oldUri = rewriteUri(map, story.beforeAfter.oldUri);
        if (story.beforeAfter?.newUri)
            story.beforeAfter.newUri = rewriteUri(map, story.beforeAfter.newUri);
        if (story.introPage1PhotoUri)
            story.introPage1PhotoUri = rewriteUri(map, story.introPage1PhotoUri);
        for (const pagesKey of ['introPagesUk', 'introPagesEn']) {
            const pages = Array.isArray(story[pagesKey]) ? story[pagesKey] : [];
            for (const page of pages) {
                if (!page || typeof page !== 'object')
                    continue;
                for (const key of ['photoUri', 'secondaryPhotoUri', 'compareBeforeUri', 'compareAfterUri', 'illustrationUri']) {
                    if (page[key])
                        page[key] = rewriteUri(map, page[key]);
                }
            }
        }
        if (Array.isArray(story.personMentions)) {
            story.personMentions = story.personMentions.map((person) => {
                if (!person || typeof person !== 'object')
                    return person;
                return {
                    ...person,
                    photoUri: person.photoUri ? rewriteUri(map, person.photoUri) : person.photoUri,
                };
            });
        }
        next.story = story;
    }
    return next;
}
//# sourceMappingURL=locationAiImageRehostService.js.map