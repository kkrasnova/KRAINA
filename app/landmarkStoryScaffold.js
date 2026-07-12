import { buildLandmarkIntroStory } from './landmarkStoryBuilder';
import { LANDMARK_INTRO_PAGE_MEDIA_TEMPLATE } from './landmarkIntroPageMediaTemplate';
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
  const allParts = [`**${title}** — ${label}`];
  if (prefix) allParts.push(prefix);
  if (desc && desc !== prefix) allParts.push(desc);
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
    ? `Вітаємо вас біля **${titleUk}**. Зупиніться на мить, подивіться навколо й прислухайтеся. ${descUk}\n\n**Як дізнатися більше:** увімкніть аудіогід за допомогою кнопки 👆 у верхній частині екрана — і ми розповімо вам усе про цю локацію. Кожне місце має свою унікальну історію, яка чекає, щоб її почули.`
    : `Вітаємо вас біля **${titleUk}**. Зупиніться на мить, подивіться навколо й прислухайтеся. Це місце — одна з найцікавіших локацій міста.\n\n**Історія навколо вас:** увімкніть аудіогід, щоб дізнатися більше про це місце, його архітектуру, історію та значення.`;

  const introBodyEn = descEn
    ? `Welcome to **${titleEn}**. Pause for a moment, look around and listen. ${descEn}\n\n**How to learn more:** tap the audio guide button 👆 at the top of the screen — and we will tell you all about this landmark. Every place has its unique story waiting to be heard.`
    : `Welcome to **${titleEn}**. Pause for a moment, look around and listen. This place is one of the most interesting landmarks of the city.\n\n**History around you:** turn on the audio guide to learn more about this place, its architecture, history, and significance.`;

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
    pageMedia: LANDMARK_INTRO_PAGE_MEDIA_TEMPLATE,
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
      if (landmarkHasFullIntroStory(lm) && !lm.story?._scaffold) continue;
      const wikiStory = getLandmarkWikiStory(region.id, lm.id);
      if (wikiStory) {
        lm.story = wikiStory;
        continue;
      }
      if (landmarkHasFullIntroStory(lm)) continue;
      lm.story = scaffoldLandmarkIntroStory(lm);
    }
  }
  return regions;
}
