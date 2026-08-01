import { buildLandmarkIntroStory } from './landmarkStoryBuilder';
import { LANDMARK_INTRO_SLIDE_LABELS_UK } from './landmarkIntroLayoutTemplate';
import { getLandmarkWikiStory } from './landmarkWikiStories';

const SLIDE_LABELS_EN = [
  'historic context / location',
  'before / after comparison',
  'architectural details',
  'interior views',
  'cultural significance',
  'nearby attractions',
  'historical timeline',
  'local traditions',
  'modern day relevance',
  'interesting facts',
  'photo gallery',
  'closing remarks',
];

function buildPageBody(title, label, prefixUk, prefixEn, descUk, descEn, langUk) {
  const desc = langUk ? descUk : descEn;
  const prefix = langUk ? prefixUk : prefixEn;
  // No slide labels as on-screen headings — story text only
  const allParts = [];
  if (prefix) allParts.push(prefix);
  if (desc && desc !== prefix) allParts.push(desc);
  if (!allParts.length) {
    allParts.push(langUk ? `Біля **${title}** є що розповісти.` : `There is more to discover at **${title}**.`);
  }
  return allParts.join('\n\n');
}

function buildPageBodiesUk(titleUk, descUk) {
  const prefixLines = [
    `Зупиніться на мить біля **${titleUk}**. Ця локація — одна з найцікавіших у місті. Дізнайтеся більше про її історію та значення.`,
    `Погляньте, як змінювався вигляд **${titleUk}** з плином часу — порівняйте історичні знімки із сучасним виглядом.`,
    `Архітектура **${titleUk}** заслуговує на окрему увагу. Кожна деталь має свою історію.`,
    `Завітайте всередину або прогуляйтеся навколо — **${titleUk}** відкривається по-різному з кожного ракурсу.`,
    `**${titleUk}** має велике культурне значення для міста та регіону. Сюди приходять, щоб доторкнутися до історії.`,
    `Навколо **${titleUk}** є багато цікавих місць, які варто відвідати.`,
    `Історія **${titleUk}** налічує багато подій — від заснування до сьогодення.`,
    `Місцеві традиції та звичаї, пов\'язані з **${titleUk}**, роблять це місце особливим.`,
    `Сьогодні **${titleUk}** залишається важливою частиною міського життя.`,
    `Чи знаєте ви? Ось кілька цікавих фактів про **${titleUk}**.`,
    `Подивіться на фотогалерею **${titleUk}** — кожен знімок розповідає свою історію.`,
    `Дякуємо, що побували біля **${titleUk}**. Продовжуйте знайомитися з містом далі!`,
  ];
  return LANDMARK_INTRO_SLIDE_LABELS_UK.map((label, i) =>
    buildPageBody(titleUk, label, prefixLines[i] || '', '', descUk, '', true),
  );
}

function buildPageBodiesEn(titleEn, descEn) {
  const prefixLines = [
    `Stop for a moment at **${titleEn}**. This landmark is one of the most interesting in the city. Learn more about its history and significance.`,
    `See how **${titleEn}** has changed over time — compare historical images with the modern view.`,
    `The architecture of **${titleEn}** deserves special attention. Every detail has its own story.`,
    `Step inside or walk around — **${titleEn}** reveals itself differently from every angle.`,
    `**${titleEn}** holds great cultural significance for the city and region. People come here to touch history.`,
    `Around **${titleEn}** there are many interesting places worth visiting.`,
    `The history of **${titleEn}** includes many events — from its founding to the present day.`,
    `Local traditions and customs associated with **${titleEn}** make this place special.`,
    `Today **${titleEn}** remains an important part of city life.`,
    `Did you know? Here are some interesting facts about **${titleEn}**.`,
    `View the photo gallery of **${titleEn}** — each picture tells a story.`,
    `Thank you for visiting **${titleEn}**. Continue exploring the city!`,
  ];
  return SLIDE_LABELS_EN.map((label, i) =>
    buildPageBody(titleEn, label, '', prefixLines[i] || '', '', descEn, false),
  );
}

/**
 * Повний story з 13 сторінками (як Майдан): той самий layout і ті самі слоти фото,
 * placeholder-тексти під конкретну локацію.
 */
export function scaffoldLandmarkIntroStory(lm) {
  const titleUk = String(lm?.titleUk || 'Локація').trim();
  const titleEn = String(lm?.titleEn || 'Landmark').trim();
  const descUk = String(lm?.descUk || '').trim();
  const descEn = String(lm?.descEn || '').trim();

  const introBodyUk = descUk
    ? `Вітаємо вас біля **${titleUk}**. Зупиніться на мить, подивіться навколо й прислухайтеся. ${descUk}`
    : `Вітаємо вас біля **${titleUk}**. Зупиніться на мить, подивіться навколо й прислухайтеся. Це місце — одна з найцікавіших локацій міста.`;

  const introBodyEn = descEn
    ? `Welcome to **${titleEn}**. Pause for a moment, look around and listen. ${descEn}`
    : `Welcome to **${titleEn}**. Pause for a moment, look around and listen. This place is one of the most interesting landmarks of the city.`;

  const story = buildLandmarkIntroStory({
    shortIntroUk: descUk || `${titleUk} — ваш аудіогід`,
    shortIntroEn: descEn || `${titleEn} — your audio guide`,
    miniPreviewUk: descUk
      ? `${descUk.slice(0, Math.min(descUk.length, 180))}${descUk.length > 180 ? '...' : ''}`
      : `Вітаємо біля **${titleUk}**. Тут ви дізнаєтеся історію цього місця.`,
    miniPreviewEn: descEn
      ? `${descEn.slice(0, Math.min(descEn.length, 180))}${descEn.length > 180 ? '...' : ''}`
      : `Welcome to **${titleEn}**. Discover the story of this landmark.`,
    introPage1Uk: introBodyUk,
    introPage1En: introBodyEn,
    pageBodiesUk: buildPageBodiesUk(titleUk, descUk),
    pageBodiesEn: buildPageBodiesEn(titleEn, descEn),
    // Never reuse Maidan illustration/icon thumbs for other landmarks.
    // Real photoUri / gallery is filled by AI enrich or admin.
    pageMedia: (() => {
      const uris = [];
      const thumbUri = typeof lm?.thumbUri === 'string' ? lm.thumbUri.trim() : '';
      if (thumbUri) uris.push(thumbUri);
      if (Array.isArray(lm?.galleryUris)) {
        lm.galleryUris.forEach((u) => {
          const s = typeof u === 'string' ? u.trim() : '';
          if (s && !uris.includes(s)) uris.push(s);
        });
      }
      if (!uris.length) return Array.from({ length: 12 }, () => ({}));
      const used = new Set([uris[0]]); // cover / thumb reserved
      return Array.from({ length: 12 }, (_, i) => {
        if (i === 1 && uris.length >= 2) {
          const after = uris[0];
          const before = uris.find((u) => u !== after) || uris[1];
          used.add(before);
          used.add(after);
          return { compareBeforeUri: before, compareAfterUri: after };
        }
        const next = uris.find((u) => !used.has(u));
        if (next) {
          used.add(next);
          return { photoUri: next };
        }
        // Only cycle when every unique URI is already used
        return { photoUri: uris[(i + 1) % uris.length] };
      });
    })(),
    quiz: {
      questionUk: `Як називається ця локація?`,
      questionEn: `What is the name of this landmark?`,
      options: [
        { textUk: titleUk, textEn: titleEn, correct: true },
        { textUk: 'Інший варіант', textEn: 'Another option', correct: false },
        { textUk: 'Ще один варіант', textEn: 'One more option', correct: false },
      ],
      multiHintUk: `Підказка: назва локації вказана у заголовку — це **${titleUk}**.`,
      multiHintEn: `Hint: the name is in the title — it's **${titleEn}**.`,
    },
    ttsEnabled: true,
  });

  return { ...story, _scaffold: true };
}

/**
 * When a shipped wiki/CMS story has layout but missing/duplicate photos,
 * assign unique gallery images so slides do not reuse the cover (or each other).
 */
export function backfillStoryPhotosFromGallery(lm) {
  if (!lm || typeof lm !== 'object' || !lm.story || typeof lm.story !== 'object') return lm;

  const identityKey = (uri) => {
    const raw = typeof uri === 'string' ? uri.trim() : '';
    if (!raw) return '';
    try {
      const u = new URL(raw);
      let path = decodeURIComponent(u.pathname);
      const thumb = path.match(/\/wikipedia\/commons\/thumb\/.\/..\/([^/]+)\/[^/]+$/i);
      if (thumb) return thumb[1].toLowerCase();
      const full = path.match(/\/wikipedia\/commons\/.\/..\/([^/]+)$/i);
      if (full) return full[1].toLowerCase();
      return path.toLowerCase();
    } catch {
      return raw.toLowerCase();
    }
  };

  const uris = [];
  const seenKeys = new Set();
  const push = (raw) => {
    const s = typeof raw === 'string' ? raw.trim() : '';
    if (!s || !/^https?:\/\//i.test(s)) return;
    const key = identityKey(s) || s;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    uris.push(s);
  };
  push(lm.thumbUri);
  if (Array.isArray(lm.galleryUris)) lm.galleryUris.forEach(push);
  if (uris.length < 2) return lm;

  const cover = uris[0];
  const coverKey = identityKey(cover);

  const fillPages = (pages) => {
    if (!Array.isArray(pages) || !pages.length) return pages;
    const usedKeys = new Set([coverKey].filter(Boolean));
    const takeNext = (preferRe = null) => {
      if (preferRe) {
        const themed = uris.find(
          (u) => preferRe.test(u) && !usedKeys.has(identityKey(u)),
        );
        if (themed) {
          usedKeys.add(identityKey(themed));
          return themed;
        }
      }
      const next = uris.find((u) => !usedKeys.has(identityKey(u)));
      if (!next) return '';
      usedKeys.add(identityKey(next));
      return next;
    };
    const thematicRe = (body) => {
      const t = String(body || '');
      // Dec 2024 missile / blast damage — require date or attack wording, not generic "stained glass"
      if (
        /20\s*грудня\s*2024|December\s*20,?\s*2024|2024 року костел зазнав|уламк.*(ракет|збит)|missile attack|Russian (missile |airstrike )?attack|after_Russian_attack/i.test(
          t,
        ) ||
        (/2024/.test(t) && /уламк|ракет|троянд|вітраж|stained glass|blast|пошкодж/i.test(t))
      ) {
        return /after[_-]Russian[_-]attack|Destructions_in_Kyiv_after/i;
      }
      return null;
    };

    // Pass 1: keep pinned URIs + assign thematic shots so news slides match the photo
    const prepared = pages.map((page, i) => {
      if (!page || typeof page !== 'object') return page;
      if (i === 1 || page.introCompareRounded || (page.compareBeforeUri && page.compareAfterUri)) {
        return { ...page, __compare: true };
      }
      if (page.introNoHero) return page;
      const pinned =
        typeof page.photoUri === 'string' && /^https?:\/\//i.test(page.photoUri.trim())
          ? page.photoUri.trim()
          : '';
      if (pinned && !usedKeys.has(identityKey(pinned))) {
        usedKeys.add(identityKey(pinned));
        return { ...page, photoUri: pinned, __pinned: true };
      }
      const theme = thematicRe(page.body);
      if (theme) {
        const shot = takeNext(theme);
        if (shot) return { ...page, photoUri: shot, __pinned: true };
      }
      return { ...page };
    });

    // Pass 2: fill remaining slots with unique gallery shots
    return prepared.map((page, i) => {
      if (!page || typeof page !== 'object') return page;
      if (page.__compare) {
        // Bottom = then (historic postcard/leaflet), top = now (modern photo)
        const historicRe = /MIKO|листівк|postcard|Bezbozhnik|1931|vintage|old/i;
        const modernRe = /Kiev-StNicholas|Kyiv_3|Kyiv_8|Kostel|Cathedral|2017|2019|Nickolas|Neo-Gothic|JohanSilver/i;
        const before =
          takeNext(historicRe) || takeNext() || uris[1];
        const after =
          takeNext(modernRe) || takeNext() || uris[2] || uris[1];
        const next = { ...page };
        delete next.__compare;
        delete next.photoUri;
        return {
          ...next,
          compareBeforeUri: page.compareBeforeUri && /^https?:\/\//i.test(page.compareBeforeUri)
            ? page.compareBeforeUri
            : before,
          compareAfterUri: page.compareAfterUri && /^https?:\/\//i.test(page.compareAfterUri)
            ? page.compareAfterUri
            : after,
        };
      }
      if (page.introNoHero || page.__pinned) {
        const next = { ...page };
        delete next.__pinned;
        delete next.secondaryPhotoUri;
        return next;
      }
      const nextPhoto = takeNext();
      if (!nextPhoto) {
        const fallback = uris[(i % (uris.length - 1)) + 1] || cover;
        return { ...page, photoUri: fallback };
      }
      const cleaned = { ...page, photoUri: nextPhoto };
      delete cleaned.secondaryPhotoUri;
      return cleaned;
    });
  };

  lm.story = {
    ...lm.story,
    introPagesUk: fillPages(lm.story.introPagesUk),
    introPagesEn: fillPages(lm.story.introPagesEn),
  };
  return lm;
}

/** Чи вже є повноцінний intro-гід (не placeholder). */
export function landmarkHasFullIntroStory(lm) {
  const story = lm?.story;
  if (!story) return false;
  if (story._scaffold || story._introBuilt) return true;
  const pages = story.introPagesUk;
  return Array.isArray(pages) && pages.length >= 11;
}

/**
 * Додає 13-сторінковий гід усім пам’яткам без готового контенту.
 * Майдан і інші з реальним текстом не чіпає.
 */
export function applyIntroStoryScaffoldToRegions(regions) {
  if (!regions || typeof regions !== 'object') return regions;
  for (const region of Object.values(regions)) {
    if (!Array.isArray(region?.landmarks)) continue;
    for (const lm of region.landmarks) {
      if (landmarkHasFullIntroStory(lm) && !lm.story?._scaffold) {
        backfillStoryPhotosFromGallery(lm);
        continue;
      }
      const wikiStory = getLandmarkWikiStory(region.id, lm.id);
      if (wikiStory) {
        lm.story = wikiStory;
        backfillStoryPhotosFromGallery(lm);
        continue;
      }
      if (landmarkHasFullIntroStory(lm)) {
        backfillStoryPhotosFromGallery(lm);
        continue;
      }
      lm.story = scaffoldLandmarkIntroStory(lm);
      backfillStoryPhotosFromGallery(lm);
    }
  }
  return regions;
}
