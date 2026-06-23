/**
 * Пам’ятки згруповані лише всередині одного регіону (місто).
 * Генератор маршруту ніколи не змішує регіони.
 */
const T1 = require('./assets/kling_20260405_IMAGE____________5495_1.webp');
const T2 = require('./assets/screenshot_2026-04-05_15.52.15.webp');
const T3 = require('./assets/screenshot_2026-04-05_15.55.36.webp');
const T4 = require('./assets/screenshot_2026-04-05_15.59.46.webp');
const T_MAIDAN_HOME = require('./assets/maidan-home-thumb.webp');
const T_SOPHIA_HOME = require('./assets/sophia-cathedral-hero.webp');
const T_LAVRA_HOME = require('./assets/lavra-panorama-dnipro.webp');
const T_KHANENKO_HOME = require('./assets/khanenko-museum-facade.webp');
const T_KHANENKO_ASIAN = require('./assets/khanenko-bellini-madonna.webp'); // Fallback: Asian art collection
const T_KYIV = require('./assets/kyiv-main-hero.webp');
const {
  MAIDAN_SHORT_INTRO_UK,
  MAIDAN_MINI_PREVIEW_UK,
  MAIDAN_INTRO_PAGE1_UK,
  MAIDAN_INTRO_PAGE_BODIES_UK,
} = require('./landmarkAudioScripts/maidan');
const {
  SOPHIA_SHORT_INTRO_UK,
  SOPHIA_MINI_PREVIEW_UK,
  SOPHIA_INTRO_PAGE1_UK,
  SOPHIA_INTRO_PAGE_BODIES_UK,
  SOPHIA_INTRO_PAGE5_BEFORE_UK,
  SOPHIA_INTRO_PAGE5_AFTER_UK,
} = require('./landmarkAudioScripts/sophia');
const {
  LAVRA_SHORT_INTRO_UK,
  LAVRA_MINI_PREVIEW_UK,
  LAVRA_INTRO_PAGE1_UK,
  LAVRA_INTRO_PAGE_BODIES_UK,
} = require('./landmarkAudioScripts/lavra');
const {
  KHANENKO_SHORT_INTRO_UK,
  KHANENKO_MINI_PREVIEW_UK,
  KHANENKO_INTRO_PAGE1_UK,
  KHANENKO_INTRO_PAGE_BODIES_UK,
} = require('./landmarkAudioScripts/khanenko');
const { buildLandmarkIntroStory } = require('./landmarkStoryBuilder');
const { LANDMARK_INTRO_PAGE_MEDIA_TEMPLATE } = require('./landmarkIntroPageMediaTemplate');
const { applyIntroStoryScaffoldToRegions } = require('./landmarkStoryScaffold');
const T_LIVIV = require('./assets/lviv-main-hero.webp');
const T_ODESA = require('./assets/odesa-main-hero.webp');
const T_KHARKIV = require('./assets/kharkiv-main-hero.webp');
const T_DNIPRO = require('./assets/dnipro-main-hero.webp');
const T_ZAPORIZHZHIA = require('./assets/zaporizhzhia-main-hero.webp');
const T_KRYVYI_RIH = require('./assets/kryvyi-rih-main-hero.webp');
const T_MARIUPOL = require('./assets/mariupol-main-hero.webp');
const T_MYKOLAIV = require('./assets/mykolaiv-main-hero.webp');
const T_VINNYTSIA = require('./assets/vinnytsia-main-hero.webp');
const T_CHERNIHIV = require('./assets/chernihiv-main-hero.webp');
const T_POLTAVA = require('./assets/poltava-main-hero.webp');
const T_CHERKASY = require('./assets/cherkasy-main-hero.webp');
const T_SUMY = require('./assets/sumy-main-hero.webp');
const T_ZHYTOMYR = require('./assets/zhytomyr-main-hero.webp');
const T_KHMELNYTSKYI = require('./assets/khmelnytskyi-main-hero.webp');
const T_RIVNE = require('./assets/rivne-main-hero.webp');
const T_IVANO_FRANKIVSK = require('./assets/ivano-frankivsk-main-hero.webp');
const T_TERNOPIL = require('./assets/ternopil-main-hero.webp');
const T_LUTSK = require('./assets/lutsk-main-hero.webp');
const T_UZHHOROD = require('./assets/uzhhorod-main-hero.webp');
const T_CHERNIVTSI = require('./assets/chernivtsi-main-hero.webp');
const T_KROPYVNYTSKYI = require('./assets/kropyvnytskyi-main-hero.webp');
const T_KREMENCHUK = require('./assets/kremenchuk-main-hero.webp');
const T_KRAMATORSK = require('./assets/kramatorsk-main-hero.webp');
const T_BERDYANSK = require('./assets/berdyansk-main-hero.webp');
const T_UMAN = require('./assets/uman-main-hero.webp');
const T_KAMIANETS_PODILSKYI = require('./assets/kamianets-podilskyi-main-hero.webp');
const T_MUKACHEVO = require('./assets/mukachevo-main-hero.webp');
const T_DROHOBYCH = require('./assets/drohobych-main-hero.webp');
const T_KONOTOP = require('./assets/konotop-main-hero.webp');
const T_NIZHYN = require('./assets/nizhyn-main-hero.webp');
const T_SLOVIANSK = require('./assets/sloviansk-main-hero.webp');
const T_BILA_TSERKVA = require('./assets/bila-tserkva-main-hero.webp');
const T_BROVARY = require('./assets/brovary-main-hero.webp');
const T_PARIS = require('./assets/paris-main-hero.webp');
const T_ROME = require('./assets/rome-main-hero.webp');
const T_BERLIN = require('./assets/berlin-main-hero.webp');
const T_WARSAW = require('./assets/warsaw-main-hero.webp');
const T_AMSTERDAM = require('./assets/amsterdam-main-hero.webp');
const T_WAALWIJK = require('./assets/waalwijk-main-hero.webp');
const T_DEN_BOSCH = require('./assets/den-bosch-main-hero.webp');
const T_VLIJMEN = require('./assets/vlijmen-main-hero.webp');
const T_BUCHAREST = require('./assets/bucharest-main-hero.webp');
const T_VILNIUS = require('./assets/vilnius-main-hero.webp');
const T_RIGA = require('./assets/riga-main-hero.webp');
const T_YEREVAN = require('./assets/yerevan-main-hero.webp');
const T_MADRID = require('./assets/madrid-main-hero.webp');

/** Ключі фото для 12 слайдів — ідентична структура як у шаблоні Майдану. */
const MAIDAN_PAGE_MEDIA = LANDMARK_INTRO_PAGE_MEDIA_TEMPLATE;

const MAIDAN_STORY = buildLandmarkIntroStory({
  shortIntroUk: MAIDAN_SHORT_INTRO_UK,
  shortIntroEn: 'A heart beating in unison with Ukraine',
  miniPreviewUk: MAIDAN_MINI_PREVIEW_UK,
  introPage1Uk: MAIDAN_INTRO_PAGE1_UK,
  pageBodiesUk: MAIDAN_INTRO_PAGE_BODIES_UK,
  pageMedia: MAIDAN_PAGE_MEDIA,
  quiz: {
    questionUk: 'Що стоїть на вершині Монументу Незалежності на Майдані?',
    questionEn: 'What stands atop the Independence Monument on Maidan?',
    options: [
      { textUk: 'Оранта-Україна', textEn: 'Oranta-Ukraine', correct: true },
      { textUk: 'Золотий Архангел Михаїл', textEn: 'Golden Archangel Michael', correct: false },
      { textUk: 'Червона зірка', textEn: 'Red star', correct: false },
    ],
    multiHintUk: 'Погляньте на білу колону в центрі площі — там дівчина з калиновою гілкою.',
    multiHintEn: 'Look at the white column in the square — a woman with a viburnum branch.',
  },
  ttsEnabled: true,
});

const SOPHIA_PAGE_MEDIA = [
  { heroThumb: 'sophiaBellTowerSquare' },
  {
    compareBeforeThumb: 'sophiaHistoric1911',
    compareAfterThumb: 'sophiaModernBaroque',
  },
  { heroThumb: 'sophiaInteriorOranta' },
  { heroThumb: 'sophiaMosaicOranta' },
  { heroThumb: 'sophiaMosaicEucharist' },
  { heroThumb: 'sophiaInteriorOranta' },
  { heroThumb: 'sophiaMosaicChristEmmanuel' },
  { heroThumb: 'sophiaHistoric1911' },
  { heroThumb: 'sophiaAerialComplex' },
  { heroThumb: 'sophia' },
  { heroThumb: 'sophiaBellTowerSquare' },
];

const SOPHIA_STORY = buildLandmarkIntroStory({
  shortIntroUk: SOPHIA_SHORT_INTRO_UK,
  shortIntroEn: 'The heart of ancient Kyiv — where Ukraine begins',
  miniPreviewUk: SOPHIA_MINI_PREVIEW_UK,
  introPage1Uk: SOPHIA_INTRO_PAGE1_UK,
  pageBodiesUk: SOPHIA_INTRO_PAGE_BODIES_UK,
  pageMedia: SOPHIA_PAGE_MEDIA,
  quiz: {
    questionUk: 'Скільки відтінків налічує палітра мозаїк Софійського собору?',
    questionEn: 'How many shades does the mosaic palette of Saint Sophia Cathedral contain?',
    options: [
      { textUk: '77', textEn: '77', correct: false },
      { textUk: '177', textEn: '177', correct: true },
      { textUk: '277', textEn: '277', correct: false },
    ],
    multiHintUk: 'Підказка: додайте відтінки зеленого, золотого, синього та червоного зі слайду про мозаїки.',
    multiHintEn: 'Hint: add up the green, gold, blue, and red shades from the mosaics slide.',
  },
  ttsEnabled: false,
});

if (Array.isArray(SOPHIA_STORY.introPagesUk) && SOPHIA_STORY.introPagesUk[0]) {
  Object.assign(SOPHIA_STORY.introPagesUk[0], {
    heroThumb: 'sophiaBellTowerSquare',
    introHeroInsetRounded: true,
    heroHeightRatio: 0.58,
    heroHeightMax: 520,
    heroStackGap: 22,
    heroPosition: { left: '50%', top: '45%' },
    heroFit: 'cover',
  });
  delete SOPHIA_STORY.introPagesUk[0].illustrationThumb;
  delete SOPHIA_STORY.introPagesUk[0].compareBeforeThumb;
  delete SOPHIA_STORY.introPagesUk[0].compareAfterThumb;
  delete SOPHIA_STORY.introPagesUk[0].compareBeforePosition;
  delete SOPHIA_STORY.introPagesUk[0].compareAfterPosition;
  delete SOPHIA_STORY.introPagesUk[0].introCompareRounded;
  delete SOPHIA_STORY.introPagesUk[0].compareHeroHeightRatio;
  delete SOPHIA_STORY.introPagesUk[0].compareHeroHeightMax;
  delete SOPHIA_STORY.introPagesUk[0].compareHeroTopInset;
  delete SOPHIA_STORY.introPagesUk[0].introHeroBleedTop;
}

if (Array.isArray(SOPHIA_STORY.introPagesUk) && SOPHIA_STORY.introPagesUk[1]) {
  Object.assign(SOPHIA_STORY.introPagesUk[1], {
    introCompareRounded: true,
    compareHeroTopInset: 22,
    heroStackGap: 22,
    compareHeroHeightRatio: 0.6,
    compareHeroHeightMax: 540,
    compareBeforePosition: { left: '50%', top: '42%' },
    compareAfterPosition: { left: '50%', top: '42%' },
  });
  delete SOPHIA_STORY.introPagesUk[1].introHeroBleedTop;
}

if (Array.isArray(SOPHIA_STORY.introPagesUk) && SOPHIA_STORY.introPagesUk[2]) {
  Object.assign(SOPHIA_STORY.introPagesUk[2], {
    introHeroBleedTop: false,
    introHeroInsetRounded: true,
    heroHeightRatio: 0.34,
    heroHeightMax: 320,
    heroFit: 'cover',
    heroStackGap: 14,
    heroPosition: { left: '50%', top: '45%' },
  });
}

if (Array.isArray(SOPHIA_STORY.introPagesUk) && SOPHIA_STORY.introPagesUk[3]) {
  Object.assign(SOPHIA_STORY.introPagesUk[3], {
    body: SOPHIA_INTRO_PAGE5_BEFORE_UK,
    bodyAfterHero: SOPHIA_INTRO_PAGE5_AFTER_UK,
    introHeroAfterText: true,
    introHeroBleedTop: false,
    introHeroInsetRounded: true,
    heroHeightRatio: 0.5,
    heroHeightMax: 460,
    heroFit: 'cover',
    heroStackGap: 4,
    heroPosition: { left: '50%', top: '42%' },
  });
}

if (Array.isArray(SOPHIA_STORY.introPagesUk) && SOPHIA_STORY.introPagesUk[4]) {
  Object.assign(SOPHIA_STORY.introPagesUk[4], {
    introHeroBleedTop: false,
    introHeroInsetRounded: true,
    heroHeightRatio: 0.38,
    heroHeightMax: 320,
    secondaryHeroHeightRatio: 0.24,
    secondaryHeroHeightMax: 200,
    heroStackGap: 14,
    secondaryStackGap: 12,
    heroFit: 'cover',
    heroPosition: { left: '50%', top: '42%' },
    secondaryHeroPosition: { left: '50%', top: '40%' },
  });
}

if (Array.isArray(SOPHIA_STORY.introPagesUk) && SOPHIA_STORY.introPagesUk[8]) {
  Object.assign(SOPHIA_STORY.introPagesUk[8], {
    heroThumb: 'sophiaAerialComplex',
    introHeroAfterText: true,
    introHeroBleedTop: false,
    introHeroInsetRounded: true,
    heroHeightRatio: 0.44,
    heroHeightMax: 380,
    heroFit: 'cover',
    heroStackGap: 14,
  });
  delete SOPHIA_STORY.introPagesUk[8].introNoHero;
  delete SOPHIA_STORY.introPagesUk[8].secondaryHeroThumb;
}

const LAVRA_PAGE_MEDIA = [
  { heroThumb: 'lavraGoldenDomes' },
  { compareBeforeThumb: 'lavraAnthonyHermit', compareAfterThumb: 'lavraBrotherhoodMonastery' },
  { heroThumb: 'lavraNearCaves' },
  { heroThumb: 'lavraFarCaves', secondaryHeroThumb: 'lavraFarCavesRelics' },
  {
    heroThumb: 'lavraAssumptionCathedral',
    secondaryHeroThumb: 'lavraAssumptionRuins',
  },
  { heroThumb: 'lavraBellTower' },
  { heroThumb: 'lavraChronicles' },
  { heroThumb: 'lavraFeudalEstates' },
  {
    heroThumb: 'lavraSovietClosure',
    secondaryHeroThumb: 'lavraCathedralExplosion',
  },
  { heroThumb: 'lavraSecretNun' },
  { heroThumb: 'lavraUnesco' },
  { heroThumb: 'lavraModernReflection' },
];

const LAVRA_STORY = buildLandmarkIntroStory({
  shortIntroUk: LAVRA_SHORT_INTRO_UK,
  shortIntroEn: 'Golden domes over the Dnipro — where Ukrainian monasticism was born',
  miniPreviewUk: LAVRA_MINI_PREVIEW_UK,
  introPage1Uk: LAVRA_INTRO_PAGE1_UK,
  pageBodiesUk: LAVRA_INTRO_PAGE_BODIES_UK,
  pageMedia: LAVRA_PAGE_MEDIA,
  quiz: {
    questionUk: 'У якому році засновано Лавру?',
    questionEn: 'In what year was the Lavra founded?',
    options: [
      { textUk: '988', textEn: '988', correct: false },
      { textUk: '1051', textEn: '1051', correct: true },
      { textUk: '1240', textEn: '1240', correct: false },
    ],
    multiHintUk: 'Пам’ятайте рік заснування — він згадується на другому слайді про ченця Антонія.',
    multiHintEn: 'Recall the founding year — it appears on slide 2 about monk Anthony.',
  },
  ttsEnabled: true,
});

if (Array.isArray(LAVRA_STORY.introPagesUk) && LAVRA_STORY.introPagesUk[11]) {
  Object.assign(LAVRA_STORY.introPagesUk[11], {
    heroThumb: 'lavraModernReflection',
    introHeroInsetRounded: true,
    introHeroBleedTop: false,
    heroHeightRatio: 0.44,
    heroHeightMax: 380,
    heroPosition: { left: '50%', top: '40%' },
    heroFit: 'cover',
    heroStackGap: 22,
  });
}

if (Array.isArray(LAVRA_STORY.introPagesUk) && LAVRA_STORY.introPagesUk[10]) {
  Object.assign(LAVRA_STORY.introPagesUk[10], {
    heroThumb: 'lavraUnesco',
    introHeroBleedTop: false,
    introHeroInsetRounded: true,
    heroHeightRatio: 0.46,
    heroHeightMax: 400,
    heroPosition: { left: '58%', top: '38%' },
    heroFit: 'cover',
    heroStackGap: 28,
  });
}

if (Array.isArray(LAVRA_STORY.introPagesUk) && LAVRA_STORY.introPagesUk[9]) {
  Object.assign(LAVRA_STORY.introPagesUk[9], {
    heroThumb: 'lavraSecretNun',
    introFactCard: true,
  });
}

if (Array.isArray(LAVRA_STORY.introPagesUk) && LAVRA_STORY.introPagesUk[8]) {
  Object.assign(LAVRA_STORY.introPagesUk[8], {
    heroThumb: 'lavraCathedralExplosion',
    introHeroBleedTop: false,
    introHeroInsetRounded: true,
    heroHeightRatio: 0.46,
    heroHeightMax: 400,
    heroPosition: { left: '50%', top: '42%' },
    heroFit: 'cover',
    heroStackGap: 28,
  });
  delete LAVRA_STORY.introPagesUk[8].secondaryHeroThumb;
}

if (Array.isArray(LAVRA_STORY.introPagesUk) && LAVRA_STORY.introPagesUk[7]) {
  Object.assign(LAVRA_STORY.introPagesUk[7], {
    heroThumb: 'lavraFeudalEstates',
    introHeroAfterText: true,
    introHeroBleedTop: false,
    introHeroInsetRounded: true,
    heroHeightRatio: 0.4,
    heroHeightMax: 320,
    heroFit: 'cover',
    heroPosition: { left: '50%', top: '50%' },
    heroStackGap: 16,
  });
}

if (Array.isArray(LAVRA_STORY.introPagesUk) && LAVRA_STORY.introPagesUk[6]) {
  Object.assign(LAVRA_STORY.introPagesUk[6], {
    heroThumb: 'lavraChronicles',
    introHeroBleedTop: true,
    introHeroInsetRounded: false,
    heroHeightRatio: 0.46,
    heroHeightMax: 400,
    heroPosition: { left: '50%', top: '45%' },
    heroFit: 'cover',
    heroStackGap: 0,
  });
}

if (Array.isArray(LAVRA_STORY.introPagesUk) && LAVRA_STORY.introPagesUk[5]) {
  Object.assign(LAVRA_STORY.introPagesUk[5], {
    heroThumb: 'lavraBellTower',
    introHeroBleedTop: true,
    introHeroInsetRounded: false,
    heroHeightRatio: 0.52,
    heroHeightMax: 480,
    heroPosition: { left: '50%', top: '35%' },
    heroFit: 'cover',
    heroStackGap: 0,
  });
}

if (Array.isArray(LAVRA_STORY.introPagesUk) && LAVRA_STORY.introPagesUk[4]) {
  Object.assign(LAVRA_STORY.introPagesUk[4], {
    heroThumb: 'lavraAssumptionCathedral',
    introHeroBleedTop: true,
    introHeroInsetRounded: false,
    heroHeightRatio: 0.44,
    heroHeightMax: 380,
    heroPosition: { left: '50%', top: '42%' },
    heroStackGap: 0,
    heroFit: 'cover',
  });
  delete LAVRA_STORY.introPagesUk[4].secondaryHeroThumb;
}

if (Array.isArray(LAVRA_STORY.introPagesUk) && LAVRA_STORY.introPagesUk[3]) {
  Object.assign(LAVRA_STORY.introPagesUk[3], {
    heroThumb: 'lavraFarCaves',
    secondaryHeroThumb: 'lavraFarCavesRelics',
    introHeroBleedTop: false,
    introHeroInsetRounded: true,
    heroHeightRatio: 0.38,
    heroHeightMax: 320,
    heroPosition: { left: '42%', top: '50%' },
    secondaryHeroHeightRatio: 0.3,
    secondaryHeroHeightMax: 260,
    secondaryHeroPosition: { left: '50%', top: '50%' },
    heroStackGap: 16,
    secondaryStackGap: 0,
    heroFit: 'cover',
  });
}

if (Array.isArray(LAVRA_STORY.introPagesUk) && LAVRA_STORY.introPagesUk[2]) {
  Object.assign(LAVRA_STORY.introPagesUk[2], {
    heroPosition: { left: '54%', top: '50%' },
    heroFit: 'cover',
    heroHeightRatio: 0.46,
    heroHeightMax: 420,
  });
}

if (Array.isArray(LAVRA_STORY.introPagesUk) && LAVRA_STORY.introPagesUk[1]) {
  Object.assign(LAVRA_STORY.introPagesUk[1], {
    compareBeforePosition: { left: '54%', top: '50%' },
  });
}

if (Array.isArray(LAVRA_STORY.introPagesUk) && LAVRA_STORY.introPagesUk[0]) {
  Object.assign(LAVRA_STORY.introPagesUk[0], {
    heroThumb: 'lavraGoldenDomes',
    introHeroBleedTop: true,
    introHeroInsetRounded: false,
    heroHeightRatio: 0.58,
    heroHeightMax: 520,
    heroFit: 'cover',
    heroPosition: { left: '50%', top: '42%' },
  });
}

const KHANENKO_PAGE_MEDIA = [
  {
    heroThumb: 'khanenkoBohdanPortrait',
    secondaryHeroThumb: 'khanenkoVarvaraPortrait',
    introHeroSideBySide: true,
    illustrationThumb: 'khanenkoHanenkoMemoir',
    illustrationLinkUk: 'Спогади Богдана Ханенка про історію колекції',
    illustrationCaptionUk: 'З архіву музею',
  },
  { compareBeforeThumb: 'khanenkoHistoric', compareAfterThumb: 'khanenkoModern' },
  {
    heroThumb: 'khanenkoRubensBacchanalia',
    secondaryHeroThumb: 'khanenkoBelliniMadonna',
    illustrationThumb: 'khanenkoDavidHoche',
    illustrationLinkUk: 'Жак-Луї Давід, «Портрет Лазаря Гоша», 1793',
    illustrationCaptionUk: 'Жак-Луї Давід, «Портрет Лазаря Гоша», 1793',
    introHeroSideBySide: true,
    heroCaptionUk: 'Річард Ерлом, за композицією П.П. Рубенса, «Bacchanalia»',
    heroCaptionEn: 'Richard Earlom, after P.P. Rubens, «Bacchanalia»',
    secondaryHeroCaptionUk: 'Коло Джованні Белліні, «Madonna with Child»',
    secondaryHeroCaptionEn: 'Circle of Giovanni Bellini, «Madonna with Child»',
  },
  { heroThumb: 'khanenkoVelazquez' },
  { heroThumb: 'khanenkoAsianArt' },
  {
    heroThumb: 'khanenkoIconVirginChild',
    secondaryHeroThumb: 'khanenkoIconSergiusBacchus',
    tertiaryHeroThumb: 'khanenkoIconJohnBaptist',
    introHeroSideBySide: true,
    heroCaptionUk: 'Богородиця з немовлям, VI ст.',
    heroCaptionEn: 'Virgin with Child, 6th c.',
    secondaryHeroCaptionUk: 'Святі Сергій та Вакх, VII ст.',
    secondaryHeroCaptionEn: 'Saints Sergius and Bacchus, 7th c.',
    tertiaryHeroCaptionUk: 'Іоан Предтеча, VI ст.',
    tertiaryHeroCaptionEn: 'John the Baptist, 6th c.',
  },
  { heroThumb: 'khanenkoSalon' },
  { heroThumb: 'khanenkoVarvaraPortrait' },
  { heroThumb: 'khanenkoLosses' },
  { heroThumb: 'khanenkoWorldTour' },
  { heroThumb: 'khanenkoStorage' },
  { heroThumb: 'khanenkoClosing' },
];

const KHANENKO_STORY = buildLandmarkIntroStory({
  shortIntroUk: KHANENKO_SHORT_INTRO_UK,
  shortIntroEn: 'Rubens, Bellini, Byzantine icons of the 6th century — all in Kyiv',
  miniPreviewUk: KHANENKO_MINI_PREVIEW_UK,
  introPage1Uk: KHANENKO_INTRO_PAGE1_UK,
  pageBodiesUk: KHANENKO_INTRO_PAGE_BODIES_UK,
  pageMedia: KHANENKO_PAGE_MEDIA,
  quiz: {
    questionUk: 'Скільки предметів налічують фонди Музею Ханенків?',
    questionEn: 'How many items are in the Khanenko Museum collection?',
    options: [
      { textUk: '5 000', textEn: '5,000', correct: false },
      { textUk: '25 000', textEn: '25,000', correct: true },
      { textUk: '100 000', textEn: '100,000', correct: false },
    ],
    multiHintUk:
      'Пам’ятайте число зі слайду про фонди — воно згадується і на вступному, і на слайді «Цікавий факт».',
    multiHintEn:
      'Recall the number from the slide about the museum funds — it appears on the intro and the “Interesting fact” slide.',
  },
  ttsEnabled: true,
});

Object.assign(KHANENKO_STORY, {
  homeHeroHeightRatio: 1,
  homeHeroHeightMax: 9999,
  homeHeroContentFit: 'cover',
  homeHeroContentPosition: 'center',
});

if (Array.isArray(KHANENKO_STORY.introPagesUk) && KHANENKO_STORY.introPagesUk[0]) {
  Object.assign(KHANENKO_STORY.introPagesUk[0], {
    heroThumb: 'khanenkoBohdanPortrait',
    secondaryHeroThumb: 'khanenkoVarvaraPortrait',
    introHeroSideBySide: true,
    introHeroInsetRounded: true,
    heroStackGap: 22,
    heroHeightRatio: 0.36,
    heroHeightMax: 340,
    heroFit: 'contain',
    heroPosition: { left: '50%', top: '50%' },
    secondaryHeroPosition: { left: '50%', top: '50%' },
    heroCaptionUk: 'Богдан Ханенко, 1900-ті рр. З архіву НХМУ.',
    heroCaptionEn: 'Bohdan Khanenko, 1900s. From the NHMU archive.',
    secondaryHeroCaptionUk:
      'Варвара Ханенко. Фоторепродукція портрета пензля О. Харламова, 1896 р. З архіву Музею Ханенків',
    secondaryHeroCaptionEn:
      'Varvara Khanenko. Photo reproduction of a portrait by O. Kharlamov, 1896. From the Khanenko Museum archive',
    illustrationThumb: 'khanenkoHanenkoMemoir',
    illustrationLinkUk: 'Спогади Богдана Ханенка про історію колекції',
    illustrationLinkEn: 'Bohdan Khanenko’s memoir on the collection history',
    illustrationCaptionUk: 'З архіву музею',
    illustrationCaptionEn: 'From the museum archive',
  });
  delete KHANENKO_STORY.introPagesUk[0].compareBeforeThumb;
  delete KHANENKO_STORY.introPagesUk[0].compareAfterThumb;
  delete KHANENKO_STORY.introPagesUk[0].introCompareRounded;
  delete KHANENKO_STORY.introPagesUk[0].compareHeroTopInset;
  delete KHANENKO_STORY.introPagesUk[0].compareHeroHeightRatio;
  delete KHANENKO_STORY.introPagesUk[0].compareHeroHeightMax;
}

if (Array.isArray(KHANENKO_STORY.introPagesUk) && KHANENKO_STORY.introPagesUk[2]) {
  Object.assign(KHANENKO_STORY.introPagesUk[2], {
    heroThumb: 'khanenkoRubensBacchanalia',
    secondaryHeroThumb: 'khanenkoBelliniMadonna',
    illustrationThumb: 'khanenkoDavidHoche',
    illustrationLinkUk: 'Жак-Луї Давід, «Портрет Лазаря Гоша», 1793',
    illustrationCaptionUk: 'Жак-Луї Давід, «Портрет Лазаря Гоша», 1793',
    introHeroSideBySide: true,
    introHeroBleedTop: false,
    introHeroInsetRounded: true,
    heroHeightRatio: 0.34,
    heroHeightMax: 280,
    heroFit: 'contain',
    heroPosition: { left: '50%', top: '50%' },
    heroStackGap: 22,
    heroTextGap: 22,
    secondaryHeroPosition: { left: '50%', top: '50%' },
    heroCaptionUk: 'Річард Ерлом, за композицією П.П. Рубенса, «Bacchanalia»',
    heroCaptionEn: 'Richard Earlom, after P.P. Rubens, «Bacchanalia»',
    secondaryHeroCaptionUk: 'Коло Джованні Белліні, «Madonna with Child»',
    secondaryHeroCaptionEn: 'Circle of Giovanni Bellini, «Madonna with Child»',
  });
  delete KHANENKO_STORY.introPagesUk[2].secondaryHeroHeightRatio;
  delete KHANENKO_STORY.introPagesUk[2].secondaryHeroHeightMax;
}

if (Array.isArray(KHANENKO_STORY.introPagesUk) && KHANENKO_STORY.introPagesUk[3]) {
  Object.assign(KHANENKO_STORY.introPagesUk[3], {
    heroThumb: 'khanenkoVelazquez',
    introHeroBleedTop: false,
    introHeroInsetRounded: true,
    heroHeightRatio: 0.46,
    heroHeightMax: 380,
    heroFit: 'contain',
    heroPosition: { left: '50%', top: '50%' },
    heroStackGap: 28,
    heroCaptionUk: '«Інфанта Маргарита» — картина, яку довго вважали роботою Веласкеса',
    heroCaptionEn: '«Infanta Margarita» — long attributed to Velázquez',
  });
}

if (Array.isArray(KHANENKO_STORY.introPagesUk) && KHANENKO_STORY.introPagesUk[4]) {
  Object.assign(KHANENKO_STORY.introPagesUk[4], {
    heroThumb: 'khanenkoAsianArt',
    photoAsset: T_KHANENKO_ASIAN,
    introHeroBleedTop: false,
    introHeroInsetRounded: true,
    heroHeightRatio: 0.42,
    heroHeightMax: 360,
    heroFit: 'contain',
    heroPosition: { left: '50%', top: '50%' },
    heroStackGap: 20,
    heroCaptionUk: 'Будда Вайрочана. Експозиція мистецтва Азії',
    heroCaptionEn: 'Buddha Vairochana. Asian art exhibition',
  });
  delete KHANENKO_STORY.introPagesUk[4].secondaryHeroThumb;
  delete KHANENKO_STORY.introPagesUk[4].secondaryHeroHeightRatio;
  delete KHANENKO_STORY.introPagesUk[4].secondaryHeroHeightMax;
  delete KHANENKO_STORY.introPagesUk[4].secondaryStackGap;
  delete KHANENKO_STORY.introPagesUk[4].secondaryHeroPosition;
}

if (Array.isArray(KHANENKO_STORY.introPagesUk) && KHANENKO_STORY.introPagesUk[5]) {
  Object.assign(KHANENKO_STORY.introPagesUk[5], {
    heroThumb: 'khanenkoIconVirginChild',
    secondaryHeroThumb: 'khanenkoIconSergiusBacchus',
    tertiaryHeroThumb: 'khanenkoIconJohnBaptist',
    introHeroSideBySide: true,
    introHeroInsetRounded: true,
    introHeroBleedTop: false,
    heroHeightRatio: 0.38,
    heroHeightMax: 300,
    heroFit: 'contain',
    heroPosition: { left: '50%', top: '50%' },
    secondaryHeroPosition: { left: '50%', top: '50%' },
    tertiaryHeroPosition: { left: '50%', top: '50%' },
    heroStackGap: 10,
    sideBySideCellGap: 2,
    sideBySideRowPaddingHorizontal: 12,
    sideBySideOuterFlex: 1.18,
    sideBySideCenterFlex: 0.68,
    sideBySideCenterOffsetTop: 34,
    heroCaptionUk: 'Богородиця з немовлям, VI ст.',
    heroCaptionEn: 'Virgin with Child, 6th c.',
    secondaryHeroCaptionUk: 'Святі Сергій та Вакх, VII ст.',
    secondaryHeroCaptionEn: 'Saints Sergius and Bacchus, 7th c.',
    tertiaryHeroCaptionUk: 'Іоан Предтеча, VI ст.',
    tertiaryHeroCaptionEn: 'John the Baptist, 6th c.',
  });
}

if (Array.isArray(KHANENKO_STORY.introPagesUk) && KHANENKO_STORY.introPagesUk[1]) {
  Object.assign(KHANENKO_STORY.introPagesUk[1], {
    compareBeforeThumb: 'khanenkoHistoric',
    compareAfterThumb: 'khanenkoModern',
    introHeroBleedTop: false,
    heroStackGap: 22,
    compareHeroTopInset: 32,
    compareHeroHeightRatio: 0.36,
    compareHeroHeightMax: 320,
    introCompareRounded: true,
    compareBeforePosition: { left: '50%', top: '42%' },
    compareAfterPosition: { left: '50%', top: '42%' },
  });
}

if (Array.isArray(KHANENKO_STORY.introPagesUk) && KHANENKO_STORY.introPagesUk[6]) {
  Object.assign(KHANENKO_STORY.introPagesUk[6], {
    heroThumb: 'khanenkoSalon',
    introHeroBleedTop: true,
    introHeroInsetRounded: false,
    heroHeightRatio: 0.42,
    heroHeightMax: 320,
    heroFit: 'cover',
    heroPosition: { left: '50%', top: '42%' },
    heroStackGap: 22,
  });
}

if (Array.isArray(KHANENKO_STORY.introPagesUk) && KHANENKO_STORY.introPagesUk[8]) {
  Object.assign(KHANENKO_STORY.introPagesUk[8], {
    heroThumb: 'khanenkoLosses',
    introHeroBleedTop: true,
    introHeroInsetRounded: false,
    heroHeightRatio: 0.4,
    heroHeightMax: 300,
    heroFit: 'cover',
    heroPosition: { left: '50%', top: '45%' },
    heroStackGap: 22,
  });
  delete KHANENKO_STORY.introPagesUk[8].secondaryHeroThumb;
  delete KHANENKO_STORY.introPagesUk[8].secondaryHeroHeightRatio;
  delete KHANENKO_STORY.introPagesUk[8].secondaryHeroHeightMax;
}

if (Array.isArray(KHANENKO_STORY.introPagesUk) && KHANENKO_STORY.introPagesUk[9]) {
  Object.assign(KHANENKO_STORY.introPagesUk[9], {
    heroThumb: 'khanenkoWorldTour',
    introHeroBleedTop: true,
    introHeroInsetRounded: false,
    heroHeightRatio: 0.4,
    heroHeightMax: 300,
    heroFit: 'cover',
    heroPosition: { left: '50%', top: '45%' },
    heroStackGap: 22,
  });
}

if (Array.isArray(KHANENKO_STORY.introPagesUk) && KHANENKO_STORY.introPagesUk[10]) {
  Object.assign(KHANENKO_STORY.introPagesUk[10], {
    heroThumb: 'khanenkoStorage',
    introHeroBleedTop: true,
    introHeroInsetRounded: false,
    heroHeightRatio: 0.4,
    heroHeightMax: 300,
    heroFit: 'cover',
    heroPosition: { left: '50%', top: '45%' },
    heroStackGap: 22,
  });
  delete KHANENKO_STORY.introPagesUk[10].introFactCard;
}

/** @typedef {{ id: string, titleUk: string, titleEn: string, lat: number, lng: number, minutes: number, free: boolean, thumb: number, descUk?: string, descEn?: string, distKm?: number, story?: object }} Landmark */

/** @type {Record<string, { id: string, titleUk: string, titleEn: string, flag: string, center: { latitude: number, longitude: number, latitudeDelta: number, longitudeDelta: number }, landmarks: Landmark[] }>} */
export const ROUTE_REGIONS = {
  paris: {
    id: 'paris',
    titleUk: 'Париж',
    titleEn: 'Paris',
    countryUk: 'Франція',
    countryEn: 'France',
    flag: '🇫🇷',
    heroThumb: T_PARIS,
    center: {
      latitude: 48.8566,
      longitude: 2.3522,
      latitudeDelta: 0.09,
      longitudeDelta: 0.09,
    },
    landmarks: [
      {
        id: 'eiffel',
        titleUk: 'Ейфелева вежа',
        titleEn: 'Eiffel Tower',
        lat: 48.8584,
        lng: 2.2945,
        minutes: 40,
        free: true,
        thumb: T1,
        distKm: 0.3,
        descUk: 'Символ Парижа й чудова панорама міста з оглядових майданчиків.',
        descEn: 'Paris icon with great city views from its observation decks.',
      },
      {
        id: 'louvre',
        titleUk: 'Лувр',
        titleEn: 'Louvre Museum',
        lat: 48.8606,
        lng: 2.3376,
        minutes: 60,
        free: false,
        thumb: T2,
        distKm: 0.7,
        descUk: 'Один із найвідвідуваніших музеїв світу та палацова архітектура.',
        descEn: 'One of the world’s most visited museums and historic palace architecture.',
      },
      {
        id: 'sainte',
        titleUk: 'Сен-Шапель',
        titleEn: 'Sainte-Chapelle',
        lat: 48.8554,
        lng: 2.345,
        minutes: 40,
        free: false,
        thumb: T3,
        distKm: 0.9,
        descUk: 'Готична каплиця з вітражами, які варто побачити в сонячний день.',
        descEn: 'Gothic chapel famous for its stained-glass windows in sunlight.',
      },
      {
        id: 'arc',
        titleUk: 'Тріумфальна арка',
        titleEn: 'Arc de Triomphe',
        lat: 48.8738,
        lng: 2.295,
        minutes: 30,
        free: true,
        thumb: T4,
        distKm: 1.2,
        descUk: 'Монумент на Єлисейських полях із видом на дванадцять проспектів.',
        descEn: 'Champs-Élysées monument with views along twelve avenues.',
      },
    ],
  },
  rome: {
    id: 'rome',
    titleUk: 'Рим',
    titleEn: 'Rome',
    countryUk: 'Італія',
    countryEn: 'Italy',
    flag: '🇮🇹',
    heroThumb: T_ROME,
    center: {
      latitude: 41.9028,
      longitude: 12.4964,
      latitudeDelta: 0.12,
      longitudeDelta: 0.12,
    },
    landmarks: [
      {
        id: 'colosseum',
        titleUk: 'Колізей',
        titleEn: 'Colosseum',
        lat: 41.8902,
        lng: 12.4922,
        minutes: 50,
        free: true,
        thumb: T1,
        distKm: 0.2,
        descUk:
          'Неймовірне місце в Римі — обов’язково завітайте на захід сонця біля Колізею. Символ імперського Риму та амфітеатр на тисячі глядачів.',
        descEn:
          'An incredible spot in Rome — visit at sunset near the Colosseum. Icon of imperial Rome and its giant amphitheatre.',
      },
      {
        id: 'trevi',
        titleUk: 'Фонтан Треві',
        titleEn: 'Trevi Fountain',
        lat: 41.9009,
        lng: 12.4833,
        minutes: 25,
        free: true,
        thumb: T2,
        distKm: 0.5,
        descUk: 'Бароковий шедевр і традиція кинути монетку, щоб повернутися в Рим.',
        descEn: 'Baroque masterpiece and the coin tradition to return to Rome.',
      },
      {
        id: 'pantheon',
        titleUk: 'Пантеон',
        titleEn: 'Pantheon',
        lat: 41.8986,
        lng: 12.4769,
        minutes: 35,
        free: false,
        thumb: T3,
        distKm: 0.8,
        descUk: 'Античний храм із куполом-ротондою й дощовим отвором у вершині.',
        descEn: 'Ancient temple with a domed rotunda and open oculus at the top.',
      },
      {
        id: 'vatican',
        titleUk: 'Площа Святого Петра',
        titleEn: "St. Peter's Square",
        lat: 41.9022,
        lng: 12.4539,
        minutes: 55,
        free: true,
        thumb: T4,
        distKm: 1.5,
        descUk: 'Колонада Берніні та серце Ватикану — старт огляду святинь.',
        descEn: "Bernini's colonnade and the heart of Vatican visits.",
      },
    ],
  },
  kyiv: {
    id: 'kyiv',
    titleUk: 'Київ',
    titleEn: 'Kyiv',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_KYIV,
    center: {
      latitude: 50.45,
      longitude: 30.5233,
      latitudeDelta: 0.1,
      longitudeDelta: 0.1,
    },
    landmarks: [
      {
        id: 'sophia',
        titleUk: 'Софійський собор',
        titleEn: "Saint Sophia's Cathedral",
        lat: 50.4529,
        lng: 30.5145,
        minutes: 45,
        free: false,
        thumb: T_SOPHIA_HOME,
        distKm: 0.4,
        descUk:
          'Серце стародавнього Києва: мозаїки XI століття, тиша внутрішнього двору й дзвіниця з панорамою, від якої реально перехоплює подих.',
        descEn:
          'The heart of ancient Kyiv: 11th-century mosaics, calm inner yard, and a bell tower view that truly takes your breath away.',
        story: SOPHIA_STORY,
      },
      {
        id: 'lavra',
        titleUk: 'Києво-Печерська лавра',
        titleEn: 'Kyiv Pechersk Lavra',
        lat: 50.4346,
        lng: 30.5562,
        minutes: 60,
        free: false,
        thumb: T_LAVRA_HOME,
        distKm: 1.1,
        descUk: 'Монастирський комплекс із печерами та панорамою на Дніпро.',
        descEn: 'Monastery complex with caves and Dnipro river views.',
        story: LAVRA_STORY,
      },
      {
        id: 'maidan',
        titleUk: 'Майдан Незалежності',
        titleEn: 'Independence Square',
        lat: 50.4501,
        lng: 30.5234,
        minutes: 25,
        free: true,
        thumb: T_MAIDAN_HOME,
        distKm: 0.2,
        descUk: 'Центральна площа столиці — події, фонтани та прогулянки.',
        descEn: 'Central square of the capital — fountains and city walks.',
        story: MAIDAN_STORY,
      },
      {
        id: 'motherland',
        titleUk: 'Батьківщина-Мати',
        titleEn: 'Motherland Monument',
        lat: 50.3945,
        lng: 30.5633,
        minutes: 40,
        free: true,
        thumb: T4,
        distKm: 2.4,
        descUk: 'Монумент на висоті з оглядом на лівобережний Київ.',
        descEn: 'Huge monument on the hills with views over Kyiv’s left bank.',
      },
      {
        id: 'kyiv_sahara',
        titleUk: 'Київська Сахара',
        titleEn: 'Kyiv Sahara Dunes',
        lat: 50.394,
        lng: 30.623,
        minutes: 45,
        free: true,
        thumb: T1,
        distKm: 8.0,
        descUk:
          'Піщані дюни до 10 метрів посеред житлових масивів Позняків — майже невідома «пустеля» Києва.',
        descEn:
          'Sand dunes up to 10 meters high hidden among Pozniaky blocks — a little‑known urban “desert” in Kyiv.',
      },
      {
        id: 'kosyi_kaponir',
        titleUk: 'Косий капонір',
        titleEn: 'Kosyi Kaponir Fortress Prison',
        lat: 50.427,
        lng: 30.536,
        minutes: 60,
        free: false,
        thumb: T2,
        distKm: 1.8,
        descUk:
          'Єдина збережена частина Київської фортеці та підземна в’язниця XIX століття з автентичними камерами.',
        descEn:
          'Only preserved part of Kyiv fortress — a 19th‑century underground prison with original cells.',
      },
      {
        id: 'ar_rahma_mosque',
        titleUk: 'Мечеть «Ар‑Рахма»',
        titleEn: 'Ar‑Rahma Mosque',
        lat: 50.470,
        lng: 30.476,
        minutes: 40,
        free: true,
        thumb: T3,
        distKm: 3.5,
        descUk:
          'Перша мечеть Києва з мінаретом і реліквією — волосом Пророка Мухаммада; відкрита для всіх відвідувачів.',
        descEn:
          'Kyiv’s first mosque with a minaret and a sacred hair relic of Prophet Muhammad; open to all visitors.',
      },
      {
        id: 'kytaiv_caves',
        titleUk: 'Китаївські печери',
        titleEn: 'Kytaiv Cave Monastery',
        lat: 50.368,
        lng: 30.549,
        minutes: 70,
        free: true,
        thumb: T4,
        distKm: 7.2,
        descUk:
          'Печерний монастир XII–XIV століть у лісі з озерами та джерелом, частина Голосіївського нацпарку.',
        descEn:
          'Cave monastery from the 12th–14th centuries in forest and lakes — part of Holosiivskyi National Park.',
      },
      {
        id: 'khanenko_museum',
        titleUk: 'Музей Ханенків',
        titleEn: 'Khanenko Art Museum',
        lat: 50.440,
        lng: 30.516,
        minutes: 60,
        free: false,
        thumb: T_KHANENKO_HOME,
        distKm: 0.9,
        descUk:
          'Особняк на Терещенківській з однією з найбільших колекцій світового мистецтва в Україні — від візантійських ікон до японських гравюр.',
        descEn:
          'A Tereshchenkivska mansion with one of Ukraine’s greatest art collections — from Byzantine icons to Japanese prints.',
        story: KHANENKO_STORY,
      },
      {
        id: 'pokrovsky_monastery',
        titleUk: 'Свято‑Покровський монастир',
        titleEn: 'St. Pokrovskiy Convent',
        lat: 50.465,
        lng: 30.488,
        minutes: 45,
        free: true,
        thumb: T2,
        distKm: 3.0,
        descUk:
          'Тихий жіночий монастир кінця XIX століття на Лук’янівці з квітучим садом і архітектурою українського зодчества.',
        descEn:
          'Calm 19th‑century women’s convent on Lukianivka with a flower garden and Ukrainian church architecture.',
      },
      {
        id: 'babyn_yar_mirror_field',
        titleUk: 'Дзеркальне поле Бабиного Яру',
        titleEn: 'Babyn Yar Mirror Field',
        lat: 50.469,
        lng: 30.452,
        minutes: 50,
        free: true,
        thumb: T3,
        distKm: 4.0,
        descUk:
          'Аудіовізуальна інсталяція «Дерево Життя» на місці трагедії Бабиного Яру, частина великого меморіалу Голокосту.',
        descEn:
          'Audio‑visual “Tree of Life” installation at the Babyn Yar tragedy site, part of a major Holocaust memorial.',
      },
      {
        id: 'vydubychi_monastery',
        titleUk: 'Видубицький монастир',
        titleEn: 'Vydubychi Monastery',
        lat: 50.408,
        lng: 30.559,
        minutes: 60,
        free: true,
        thumb: T4,
        distKm: 3.8,
        descUk:
          'Давній монастир XI століття на схилах Дніпра з легендою про ідола Перуна та краєвидом на ботанічний сад.',
        descEn:
          'Ancient 11th‑century monastery on Dnipro hills with the Perun idol legend and views to the botanical garden.',
      },
      {
        id: 'st_nicholas_cathedral',
        titleUk: 'Костел Святого Миколая',
        titleEn: 'St. Nicholas Roman Catholic Cathedral',
        lat: 50.425,
        lng: 30.516,
        minutes: 50,
        free: true,
        thumb: T1,
        distKm: 1.5,
        descUk:
          'Неоготичний костел початку XX століття архітектора Городецького з вежами 58 метрів та органною залою.',
        descEn:
          'Early 20th‑century neo‑Gothic cathedral by architect Horodetskyi, 58‑meter towers and famous organ hall.',
      },
      {
        id: 'lysa_hora',
        titleUk: 'Лиса гора',
        titleEn: 'Lysa Hora Hill',
        lat: 50.402,
        lng: 30.563,
        minutes: 70,
        free: true,
        thumb: T2,
        distKm: 4.5,
        descUk:
          'Язичницьке місце сили з легендами про відьом, фортецею XIX століття, тунелями та панорамою на Дніпро.',
        descEn:
          'Pagan “place of power” with witch legends, a 19th‑century fortress, tunnels and panoramic Dnipro views.',
      },
    ],
  },
  lviv: {
    id: 'lviv',
    titleUk: 'Львів',
    titleEn: 'Lviv',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_LIVIV,
    center: { latitude: 49.8397, longitude: 24.0297, latitudeDelta: 0.1, longitudeDelta: 0.1 },
    landmarks: [
      {
        id: 'lviv_rynok',
        titleUk: 'Площа Ринок',
        titleEn: 'Rynok Square',
        lat: 49.8413,
        lng: 24.0315,
        minutes: 45,
        free: true,
        thumb: T1,
        distKm: 0.2,
        descUk: 'Історичне серце Львова — ЮНЕСКО, ратуша й кав’ярні.',
        descEn: 'UNESCO Old Town heart — town hall and cafés.',
      },
      {
        id: 'lviv_opera',
        titleUk: 'Львівська опера',
        titleEn: 'Lviv Opera',
        lat: 49.844,
        lng: 24.026,
        minutes: 40,
        free: false,
        thumb: T2,
        distKm: 0.4,
        descUk: 'Театр опери та балету — неоренесанс і вечірні вистави.',
        descEn: 'Opera house — neo-Renaissance architecture.',
      },
      {
        id: 'lviv_high_castle',
        titleUk: 'Високий замок',
        titleEn: 'High Castle Park',
        lat: 49.8483,
        lng: 24.0397,
        minutes: 50,
        free: true,
        thumb: T3,
        distKm: 1.1,
        descUk: 'Парк на горі з панорамою на все місто й руїнами замку.',
        descEn: 'Hilltop park with a full-city panorama and castle ruins.',
      },
      {
        id: 'lviv_svobody',
        titleUk: 'Проспект Свободи',
        titleEn: 'Svobody Avenue',
        lat: 49.8419,
        lng: 24.0283,
        minutes: 35,
        free: true,
        thumb: T4,
        distKm: 0.3,
        descUk: 'Головна вулиця Львова — театр, університет і кав’ярні.',
        descEn: 'Lviv’s main avenue — theatre, university and cafés.',
      },
      {
        id: 'lviv_dom_sobor',
        titleUk: 'Домініканський собор',
        titleEn: 'Dominican Cathedral',
        lat: 49.8436,
        lng: 24.0342,
        minutes: 35,
        free: true,
        thumb: T1,
        distKm: 0.5,
        descUk: 'Бароковий собор XVIII століття в центрі Старого міста.',
        descEn: '18th-century Baroque cathedral in the Old Town centre.',
      },
      {
        id: 'lviv_lychakiv',
        titleUk: 'Личаківський цвинтар',
        titleEn: 'Lychakiv Cemetery',
        lat: 49.8322,
        lng: 24.0567,
        minutes: 55,
        free: true,
        thumb: T2,
        distKm: 2.4,
        descUk: 'Історичний некрополь з меморіалами видатних українців і поляків.',
        descEn: 'Historic cemetery with memorials to notable Ukrainians and Poles.',
      },
      {
        id: 'lviv_palace',
        titleUk: 'Палац Потоцьких',
        titleEn: 'Potocki Palace',
        lat: 49.8434,
        lng: 24.0232,
        minutes: 45,
        free: false,
        thumb: T3,
        distKm: 0.6,
        descUk: 'Палац XIX століття — сьогодні Львівська галерея мистецтв.',
        descEn: '19th-century palace — now the Lviv National Art Gallery.',
      },
    ],
  },
  odesa: {
    id: 'odesa',
    titleUk: 'Одеса',
    titleEn: 'Odesa',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_ODESA,
    center: { latitude: 46.4825, longitude: 30.7233, latitudeDelta: 0.12, longitudeDelta: 0.12 },
    landmarks: [
      {
        id: 'odesa_potemkin',
        titleUk: 'Потьомкінські сходи',
        titleEn: 'Potemkin Stairs',
        lat: 46.4885,
        lng: 30.7415,
        minutes: 35,
        free: true,
        thumb: T3,
        distKm: 0.3,
        descUk: 'Символ Одеси: сходи до порту, з кіно і видом на море.',
        descEn: 'Iconic stairs to the port — cinematic sea views.',
      },
      {
        id: 'odesa_opera',
        titleUk: 'Одеський театр опери',
        titleEn: 'Odesa Opera',
        lat: 46.485,
        lng: 30.741,
        minutes: 50,
        free: false,
        thumb: T4,
        distKm: 0.5,
        descUk: 'Бароковий театр з білого вапняку в центрі міста.',
        descEn: 'Baroque limestone opera theatre in the city centre.',
      },
    ],
  },
  kharkiv: {
    id: 'kharkiv',
    titleUk: 'Харків',
    titleEn: 'Kharkiv',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_KHARKIV,
    center: { latitude: 49.9935, longitude: 36.2304, latitudeDelta: 0.12, longitudeDelta: 0.12 },
    landmarks: [
      {
        id: 'kharkiv_freedom',
        titleUk: 'Площа Свободи',
        titleEn: 'Freedom Square',
        lat: 49.993,
        lng: 36.23,
        minutes: 40,
        free: true,
        thumb: T1,
        distKm: 0.2,
        descUk: 'Одна з найбільших площ Європи — транспорт і фонтани.',
        descEn: 'One of Europe’s largest squares — metro and fountains.',
      },
      {
        id: 'kharkiv_gorky',
        titleUk: 'Парк ім. Горького',
        titleEn: 'Gorky Park',
        lat: 50.005,
        lng: 36.25,
        minutes: 50,
        free: true,
        thumb: T2,
        distKm: 1.2,
        descUk: 'Міський парк з атракціонами й алеями.',
        descEn: 'City park with green alleys and rides.',
      },
    ],
  },
  dnipro: {
    id: 'dnipro',
    titleUk: 'Дніпро',
    titleEn: 'Dnipro',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_DNIPRO,
    center: { latitude: 48.4647, longitude: 35.0462, latitudeDelta: 0.1, longitudeDelta: 0.1 },
    landmarks: [
      {
        id: 'dnipro_embankment',
        titleUk: 'Набережна',
        titleEn: 'River embankment',
        lat: 48.455,
        lng: 35.062,
        minutes: 45,
        free: true,
        thumb: T3,
        distKm: 0.3,
        descUk: 'Прогулянка вздовж Дніпра — панорами й зони відпочинку.',
        descEn: 'Walk along the Dnipro river promenade.',
      },
      {
        id: 'dnipro_european',
        titleUk: 'Європейська площа',
        titleEn: 'European Square',
        lat: 48.459,
        lng: 35.049,
        minutes: 30,
        free: true,
        thumb: T4,
        distKm: 0.4,
        descUk: 'Центр Дніпра з фонтанами й кав’ярнями.',
        descEn: 'City centre with fountains and cafés.',
      },
    ],
  },
  zaporizhzhia: {
    id: 'zaporizhzhia',
    titleUk: 'Запоріжжя',
    titleEn: 'Zaporizhzhia',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_ZAPORIZHZHIA,
    center: { latitude: 47.8388, longitude: 35.1396, latitudeDelta: 0.1, longitudeDelta: 0.1 },
    landmarks: [
      {
        id: 'zaporizhzhia_khortytsia',
        titleUk: 'Острів Хортиця',
        titleEn: 'Khortytsia Island',
        lat: 47.85,
        lng: 35.066,
        minutes: 90,
        free: true,
        thumb: T1,
        distKm: 4.0,
        descUk: 'Найбільший річковий острів у Європі — заповідник і краєвиди Дніпра.',
        descEn: 'Europe’s largest river island — reserve and Dnipro vistas.',
      },
      {
        id: 'zaporizhzhia_dniprohes',
        titleUk: 'ДніпроГЕС',
        titleEn: 'Dnipro Hydroelectric Station',
        lat: 47.87,
        lng: 35.089,
        minutes: 40,
        free: true,
        thumb: T2,
        distKm: 6.0,
        descUk: 'Гідровузол і символ індустріального міста.',
        descEn: 'Major hydro complex and symbol of industrial Zaporizhzhia.',
      },
    ],
  },
  kryvyi_rih: {
    id: 'kryvyi_rih',
    titleUk: 'Кривий Ріг',
    titleEn: 'Kryvyi Rih',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_KRYVYI_RIH,
    center: { latitude: 47.9105, longitude: 33.3918, latitudeDelta: 0.11, longitudeDelta: 0.11 },
    landmarks: [
      {
        id: 'kryvyi_ingulets',
        titleUk: 'Парк ім. Казки',
        titleEn: 'Central city park',
        lat: 47.908,
        lng: 33.392,
        minutes: 45,
        free: true,
        thumb: T3,
        distKm: 0.5,
        descUk: 'Зелена зона в довготягненому місті — прогулянки й фонтани.',
        descEn: 'Green pocket in this elongated mining city.',
      },
      {
        id: 'kryvyi_mining',
        titleUk: 'Кар’єр Північний ГЗК',
        titleEn: 'Open-pit viewpoint',
        lat: 47.95,
        lng: 33.42,
        minutes: 50,
        free: true,
        thumb: T4,
        distKm: 8.0,
        descUk: 'Масштаб гірничого краю — краєвиди з оглядових точок.',
        descEn: 'Mining landscape scale from roadside viewpoints.',
      },
    ],
  },
  mykolaiv: {
    id: 'mykolaiv',
    titleUk: 'Миколаїв',
    titleEn: 'Mykolaiv',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_MYKOLAIV,
    center: { latitude: 46.975, longitude: 32.0029, latitudeDelta: 0.11, longitudeDelta: 0.11 },
    landmarks: [
      {
        id: 'mykolaiv_admiral',
        titleUk: 'Музей суднобудування',
        titleEn: 'Shipbuilding & Fleet Museum',
        lat: 46.966,
        lng: 31.995,
        minutes: 50,
        free: false,
        thumb: T1,
        distKm: 0.6,
        descUk: 'Історія флоту та корабелів на Інгулі.',
        descEn: 'Naval and shipyard history on the Inhul river.',
      },
      {
        id: 'mykolaiv_sobor',
        titleUk: 'Собор Касперівської ікони Божої Матері',
        titleEn: 'Admiralty area cathedral',
        lat: 46.9678,
        lng: 31.9826,
        minutes: 35,
        free: true,
        thumb: T2,
        distKm: 0.4,
        descUk: 'Набережні вулиці й історичний центр порту.',
        descEn: 'Waterfront streets near the old port quarter.',
      },
    ],
  },
  mariupol: {
    id: 'mariupol',
    titleUk: 'Маріуполь',
    titleEn: 'Mariupol',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_MARIUPOL,
    center: { latitude: 47.0956, longitude: 37.5413, latitudeDelta: 0.1, longitudeDelta: 0.1 },
    landmarks: [
      {
        id: 'mariupol_theatre',
        titleUk: 'Драматичний театр',
        titleEn: 'Drama Theatre',
        lat: 47.0968,
        lng: 37.5492,
        minutes: 40,
        free: false,
        thumb: T3,
        distKm: 0.3,
        descUk: 'Центральна площа й приазовський променад.',
        descEn: 'Central square and Azov seafront walks.',
      },
      {
        id: 'mariupol_prymorsky',
        titleUk: 'Приморський парк',
        titleEn: 'Seaside park',
        lat: 47.139,
        lng: 37.563,
        minutes: 55,
        free: true,
        thumb: T4,
        distKm: 5.0,
        descUk: 'Алеї біля Азовського моря.',
        descEn: 'Tree-lined paths along the Azov shore.',
      },
    ],
  },
  vinnytsia: {
    id: 'vinnytsia',
    titleUk: 'Вінниця',
    titleEn: 'Vinnytsia',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_VINNYTSIA,
    center: { latitude: 49.2328, longitude: 28.4809, latitudeDelta: 0.09, longitudeDelta: 0.09 },
    landmarks: [
      {
        id: 'vinnytsia_fountain',
        titleUk: 'Мультимедійні фонтани Roshen',
        titleEn: 'Roshen multimedia fountains',
        lat: 49.2339,
        lng: 28.4612,
        minutes: 50,
        free: true,
        thumb: T1,
        distKm: 1.2,
        descUk: 'Світло-музичне шоу на Бузі — візитівка міста.',
        descEn: 'Light-and-music show on the Southern Buh river.',
      },
      {
        id: 'vinnytsia_center',
        titleUk: 'Європейська площа',
        titleEn: 'European Square',
        lat: 49.234,
        lng: 28.468,
        minutes: 35,
        free: true,
        thumb: T2,
        distKm: 0.3,
        descUk: 'Пішохідний центр і кав’ярні.',
        descEn: 'Pedestrian core with cafés.',
      },
    ],
  },
  chernihiv: {
    id: 'chernihiv',
    titleUk: 'Чернігів',
    titleEn: 'Chernihiv',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_CHERNIHIV,
    center: { latitude: 51.4982, longitude: 31.2893, latitudeDelta: 0.1, longitudeDelta: 0.1 },
    landmarks: [
      {
        id: 'chernihiv_pyatnytska',
        titleUk: 'П’ятницька церква',
        titleEn: 'Pyatnytska Church',
        lat: 51.4905,
        lng: 31.3045,
        minutes: 45,
        free: true,
        thumb: T3,
        distKm: 0.8,
        descUk: 'Древній храм XII століття — частина історичного Валу.',
        descEn: '12th-century church on the historic ramparts.',
      },
      {
        id: 'chernihiv_catherine',
        titleUk: 'Катерининська церква',
        titleEn: "Catherine's Church",
        lat: 51.493,
        lng: 31.298,
        minutes: 40,
        free: true,
        thumb: T4,
        distKm: 0.5,
        descUk: 'Бароко й вид на Десну.',
        descEn: 'Baroque landmark with Desna river views.',
      },
    ],
  },
  poltava: {
    id: 'poltava',
    titleUk: 'Полтава',
    titleEn: 'Poltava',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_POLTAVA,
    center: { latitude: 49.5883, longitude: 34.5514, latitudeDelta: 0.09, longitudeDelta: 0.09 },
    landmarks: [
      {
        id: 'poltava_dumplings',
        titleUk: 'Кругла площа',
        titleEn: 'Round Square',
        lat: 49.5887,
        lng: 34.5514,
        minutes: 40,
        free: true,
        thumb: T1,
        distKm: 0.2,
        descUk: 'Унікальна кругла площа — символ міста галушок.',
        descEn: 'Distinctive round square — city landmark.',
      },
      {
        id: 'poltava_museum',
        titleUk: 'Музей історії Полтавської битви',
        titleEn: 'Poltava Battle Museum',
        lat: 49.682,
        lng: 34.711,
        minutes: 60,
        free: false,
        thumb: T2,
        distKm: 12.0,
        descUk: 'Поле Полтавської битви 1709 року.',
        descEn: 'Site and museum of the 1709 battle field.',
      },
    ],
  },
  cherkasy: {
    id: 'cherkasy',
    titleUk: 'Черкаси',
    titleEn: 'Cherkasy',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_CHERKASY,
    center: { latitude: 49.4444, longitude: 32.0598, latitudeDelta: 0.1, longitudeDelta: 0.1 },
    landmarks: [
      {
        id: 'cherkasy_hill',
        titleUk: 'Скеля «Яворниця»',
        titleEn: 'Yavornytsia rock park',
        lat: 49.445,
        lng: 32.048,
        minutes: 50,
        free: true,
        thumb: T3,
        distKm: 1.0,
        descUk: 'Зелений парк із краєвидами на Дніпро.',
        descEn: 'Hill park with Dnipro panoramas.',
      },
      {
        id: 'cherkasy_embankment',
        titleUk: 'Набережна',
        titleEn: 'River embankment',
        lat: 49.436,
        lng: 32.071,
        minutes: 45,
        free: true,
        thumb: T4,
        distKm: 1.5,
        descUk: 'Променад уздовж Кременчуцького водосховища.',
        descEn: 'Walk along the great Dnipro reservoir.',
      },
    ],
  },
  sumy: {
    id: 'sumy',
    titleUk: 'Суми',
    titleEn: 'Sumy',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_SUMY,
    center: { latitude: 50.9077, longitude: 34.7981, latitudeDelta: 0.09, longitudeDelta: 0.09 },
    landmarks: [
      {
        id: 'sumy_altanka',
        titleUk: 'Альтанка закоханих',
        titleEn: 'Altanka fountain',
        lat: 50.907,
        lng: 34.798,
        minutes: 30,
        free: true,
        thumb: T1,
        distKm: 0.2,
        descUk: 'Символ міста на Соборній площі.',
        descEn: 'Beloved city symbol on Soborna Square.',
      },
      {
        id: 'sumy_cathedral',
        titleUk: 'Спасо-Преображенський собор',
        titleEn: 'Transfiguration Cathedral',
        lat: 50.909,
        lng: 34.802,
        minutes: 40,
        free: true,
        thumb: T2,
        distKm: 0.4,
        descUk: 'Класицистичний собор XVIII–XIX ст.',
        descEn: 'Classicist cathedral from the 18th–19th centuries.',
      },
    ],
  },
  zhytomyr: {
    id: 'zhytomyr',
    titleUk: 'Житомир',
    titleEn: 'Zhytomyr',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_ZHYTOMYR,
    center: { latitude: 50.2547, longitude: 28.6587, latitudeDelta: 0.09, longitudeDelta: 0.09 },
    landmarks: [
      {
        id: 'zhytomyr_korolenko',
        titleUk: 'Музей Короленка',
        titleEn: 'Korolenko Museum',
        lat: 50.255,
        lng: 28.664,
        minutes: 45,
        free: false,
        thumb: T3,
        distKm: 0.5,
        descUk: 'Літературний музей у старому центрі.',
        descEn: 'Literary museum in the old town.',
      },
      {
        id: 'zhytomyr_park',
        titleUk: 'Парк ім. Гагаріна',
        titleEn: 'Gagarin Park',
        lat: 50.248,
        lng: 28.67,
        minutes: 50,
        free: true,
        thumb: T4,
        distKm: 1.2,
        descUk: 'Великий лісопарк на околиці.',
        descEn: 'Large forest park on the city edge.',
      },
    ],
  },
  khmelnytskyi: {
    id: 'khmelnytskyi',
    titleUk: 'Хмельницький',
    titleEn: 'Khmelnytskyi',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_KHMELNYTSKYI,
    center: { latitude: 49.4225, longitude: 26.9871, latitudeDelta: 0.09, longitudeDelta: 0.09 },
    landmarks: [
      {
        id: 'khmel_street',
        titleUk: 'Проскурівський підзамок',
        titleEn: 'Old fortress quarter',
        lat: 49.426,
        lng: 26.987,
        minutes: 40,
        free: true,
        thumb: T1,
        distKm: 0.4,
        descUk: 'Історичний центр і замковий вал.',
        descEn: 'Historic core and fortress earthworks.',
      },
      {
        id: 'khmel_park',
        titleUk: 'Парк Чекмана',
        titleEn: 'Chekmanskiy Park',
        lat: 49.43,
        lng: 27.0,
        minutes: 45,
        free: true,
        thumb: T2,
        distKm: 1.0,
        descUk: 'Зелена зона з Південним Бугом.',
        descEn: 'Green space along the Southern Buh.',
      },
    ],
  },
  rivne: {
    id: 'rivne',
    titleUk: 'Рівне',
    titleEn: 'Rivne',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_RIVNE,
    center: { latitude: 50.6199, longitude: 26.2516, latitudeDelta: 0.09, longitudeDelta: 0.09 },
    landmarks: [
      {
        id: 'rivne_teatre',
        titleUk: 'Обласний музично-драматичний театр',
        titleEn: 'Regional drama theatre',
        lat: 50.621,
        lng: 26.251,
        minutes: 40,
        free: false,
        thumb: T3,
        distKm: 0.3,
        descUk: 'Театр на центральній алеї.',
        descEn: 'Theatre on the main pedestrian alley.',
      },
      {
        id: 'rivne_lake',
        titleUk: 'Базове озеро',
        titleEn: 'Lake Bazove area',
        lat: 50.615,
        lng: 26.24,
        minutes: 50,
        free: true,
        thumb: T4,
        distKm: 1.5,
        descUk: 'Набережні й парк біля водойми.',
        descEn: 'Park walks by the city lake.',
      },
    ],
  },
  ivano_frankivsk: {
    id: 'ivano_frankivsk',
    titleUk: 'Івано-Франківськ',
    titleEn: 'Ivano-Frankivsk',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_IVANO_FRANKIVSK,
    center: { latitude: 48.9226, longitude: 24.7104, latitudeDelta: 0.08, longitudeDelta: 0.08 },
    landmarks: [
      {
        id: 'if_ratusha',
        titleUk: 'Ратуша',
        titleEn: 'Town hall',
        lat: 48.9228,
        lng: 24.7102,
        minutes: 35,
        free: true,
        thumb: T1,
        distKm: 0.1,
        descUk: 'Серце Ринку — колорит карпатського міста.',
        descEn: 'Market square heart of the Halychyna city.',
      },
      {
        id: 'if_vichevyi',
        titleUk: 'Вічевий майдан',
        titleEn: 'Vichevyi Maidan',
        lat: 48.924,
        lng: 24.708,
        minutes: 30,
        free: true,
        thumb: T2,
        distKm: 0.3,
        descUk: 'Пішохідний центр із кав’ярнями.',
        descEn: 'Pedestrian core with cafés.',
      },
    ],
  },
  ternopil: {
    id: 'ternopil',
    titleUk: 'Тернопіль',
    titleEn: 'Ternopil',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_TERNOPIL,
    center: { latitude: 49.5535, longitude: 25.5948, latitudeDelta: 0.08, longitudeDelta: 0.08 },
    landmarks: [
      {
        id: 'ternopil_lake',
        titleUk: 'Тернопільський став',
        titleEn: 'Ternopil Pond',
        lat: 49.555,
        lng: 25.595,
        minutes: 60,
        free: true,
        thumb: T3,
        distKm: 0.4,
        descUk: 'Острів і променад навколо міського ставка.',
        descEn: 'Island and promenade around the city pond.',
      },
      {
        id: 'ternopil_castle',
        titleUk: 'Тернопільський замок',
        titleEn: 'Castle ruins area',
        lat: 49.558,
        lng: 25.6,
        minutes: 40,
        free: true,
        thumb: T4,
        distKm: 0.6,
        descUk: 'Зали фортеці XVI століття.',
        descEn: '16th-century fortress remains.',
      },
    ],
  },
  lutsk: {
    id: 'lutsk',
    titleUk: 'Луцьк',
    titleEn: 'Lutsk',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_LUTSK,
    center: { latitude: 50.7472, longitude: 25.3254, latitudeDelta: 0.08, longitudeDelta: 0.08 },
    landmarks: [
      {
        id: 'lutsk_upper',
        titleUk: 'Замок Любарта',
        titleEn: 'Lubart’s Castle',
        lat: 50.741,
        lng: 25.325,
        minutes: 55,
        free: false,
        thumb: T1,
        distKm: 0.5,
        descUk: 'Верхній замок — музей і краєвиди Стиру.',
        descEn: 'Upper castle museum with Styr river views.',
      },
      {
        id: 'lutsk_old',
        titleUk: 'Старе місто',
        titleEn: 'Old town streets',
        lat: 50.738,
        lng: 25.32,
        minutes: 45,
        free: true,
        thumb: T2,
        distKm: 0.4,
        descUk: 'Вузькі вулиці й кав’ярні біля замку.',
        descEn: 'Narrow lanes and cafés near the castle.',
      },
    ],
  },
  uzhhorod: {
    id: 'uzhhorod',
    titleUk: 'Ужгород',
    titleEn: 'Uzhhorod',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_UZHHOROD,
    center: { latitude: 48.6208, longitude: 22.2879, latitudeDelta: 0.08, longitudeDelta: 0.08 },
    landmarks: [
      {
        id: 'uzhhorod_castle',
        titleUk: 'Ужгородський замок',
        titleEn: 'Uzhhorod Castle',
        lat: 48.634,
        lng: 22.3,
        minutes: 50,
        free: false,
        thumb: T3,
        distKm: 1.2,
        descUk: 'Середньовічна фортеця на Замковій горі.',
        descEn: 'Medieval hilltop fortress.',
      },
      {
        id: 'uzhhorod_pedestrian',
        titleUk: 'Корзо',
        titleEn: 'Korzo pedestrian street',
        lat: 48.623,
        lng: 22.298,
        minutes: 40,
        free: true,
        thumb: T4,
        distKm: 0.3,
        descUk: 'Плитка вулиця з кав’ярнями Закарпаття.',
        descEn: 'Cobbled café street in Transcarpathia.',
      },
    ],
  },
  chernivtsi: {
    id: 'chernivtsi',
    titleUk: 'Чернівці',
    titleEn: 'Chernivtsi',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_CHERNIVTSI,
    center: { latitude: 48.2915, longitude: 25.9403, latitudeDelta: 0.08, longitudeDelta: 0.08 },
    landmarks: [
      {
        id: 'chernivtsi_university',
        titleUk: 'Чернівецький національний університет',
        titleEn: 'Chernivtsi University (UNESCO)',
        lat: 48.2963,
        lng: 25.9214,
        minutes: 60,
        free: false,
        thumb: T1,
        distKm: 1.0,
        descUk: 'Резиденція митрополитів Буковини — шедевр ЮНЕСКО.',
        descEn: 'UNESCO Residence of Bukovinian Metropolitans.',
      },
      {
        id: 'chernivtsi_theatre',
        titleUk: 'Музично-драматичний театр',
        titleEn: 'Olha Kobylianska Theatre',
        lat: 48.291,
        lng: 25.94,
        minutes: 45,
        free: false,
        thumb: T2,
        distKm: 0.2,
        descUk: 'Центральна площа «Театральна».',
        descEn: 'Central Theatre Square.',
      },
    ],
  },
  kropyvnytskyi: {
    id: 'kropyvnytskyi',
    titleUk: 'Кропивницький',
    titleEn: 'Kropyvnytskyi',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_KROPYVNYTSKYI,
    center: { latitude: 48.5079, longitude: 32.2623, latitudeDelta: 0.1, longitudeDelta: 0.1 },
    landmarks: [
      {
        id: 'kropyvnytskyi_dendro',
        titleUk: 'Дендропарк',
        titleEn: 'Arboretum',
        lat: 48.51,
        lng: 32.25,
        minutes: 50,
        free: true,
        thumb: T3,
        distKm: 1.0,
        descUk: 'Зелена зона з рідкісними деревами.',
        descEn: 'Park with rare tree species.',
      },
      {
        id: 'kropyvnytskyi_center',
        titleUk: 'Площа ім. Кірова',
        titleEn: 'Central square',
        lat: 48.507,
        lng: 32.262,
        minutes: 35,
        free: true,
        thumb: T4,
        distKm: 0.2,
        descUk: 'Адміністративний центр міста.',
        descEn: 'Administrative downtown square.',
      },
    ],
  },
  kremenchuk: {
    id: 'kremenchuk',
    titleUk: 'Кременчук',
    titleEn: 'Kremenchuk',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_KREMENCHUK,
    center: { latitude: 49.0658, longitude: 33.41, latitudeDelta: 0.1, longitudeDelta: 0.1 },
    landmarks: [
      {
        id: 'kremenchuk_bridge',
        titleUk: 'Крюківський міст',
        titleEn: 'Kriukiv bridge viewpoint',
        lat: 49.072,
        lng: 33.42,
        minutes: 40,
        free: true,
        thumb: T1,
        distKm: 2.0,
        descUk: 'Панорами Дніпра й промислового берега.',
        descEn: 'Dnipro panoramas and industrial riverbanks.',
      },
      {
        id: 'kremenchuk_park',
        titleUk: 'Міський сад',
        titleEn: 'City garden',
        lat: 49.064,
        lng: 33.405,
        minutes: 45,
        free: true,
        thumb: T2,
        distKm: 0.5,
        descUk: 'Алеї в центрі Придніпров’я.',
        descEn: 'Shaded alleys in the city centre.',
      },
    ],
  },
  kramatorsk: {
    id: 'kramatorsk',
    titleUk: 'Краматорськ',
    titleEn: 'Kramatorsk',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_KRAMATORSK,
    center: { latitude: 48.7233, longitude: 37.5553, latitudeDelta: 0.1, longitudeDelta: 0.1 },
    landmarks: [
      {
        id: 'kramatorsk_park',
        titleUk: 'Парк Ювілейний',
        titleEn: 'Yuvileinyi Park',
        lat: 48.726,
        lng: 37.55,
        minutes: 45,
        free: true,
        thumb: T3,
        distKm: 0.8,
        descUk: 'Зелена зона в промисловому місті.',
        descEn: 'Green park in an industrial Donbas city.',
      },
      {
        id: 'kramatorsk_museum',
        titleUk: 'Краєзнавчий музей',
        titleEn: 'Local history museum',
        lat: 48.72,
        lng: 37.56,
        minutes: 50,
        free: false,
        thumb: T4,
        distKm: 0.5,
        descUk: 'Історія краю й машинобудування.',
        descEn: 'Regional and machine-building history.',
      },
    ],
  },
  berdyansk: {
    id: 'berdyansk',
    titleUk: 'Бердянськ',
    titleEn: 'Berdyansk',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_BERDYANSK,
    center: { latitude: 46.7559, longitude: 36.7888, latitudeDelta: 0.1, longitudeDelta: 0.1 },
    landmarks: [
      {
        id: 'berdyansk_spit',
        titleUk: 'Бердянська коса',
        titleEn: 'Berdyansk spit',
        lat: 46.712,
        lng: 36.785,
        minutes: 70,
        free: true,
        thumb: T1,
        distKm: 8.0,
        descUk: 'Піщані пляжі й Азовське море.',
        descEn: 'Sandy beaches on the Azov Sea.',
      },
      {
        id: 'berdyansk_center',
        titleUk: 'Приморська площа',
        titleEn: 'Seaside square',
        lat: 46.756,
        lng: 36.79,
        minutes: 35,
        free: true,
        thumb: T2,
        distKm: 0.3,
        descUk: 'Набережна й ринок.',
        descEn: 'Seafront and market area.',
      },
    ],
  },
  uman: {
    id: 'uman',
    titleUk: 'Умань',
    titleEn: 'Uman',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_UMAN,
    center: { latitude: 48.7489, longitude: 30.2218, latitudeDelta: 0.09, longitudeDelta: 0.09 },
    landmarks: [
      {
        id: 'uman_sofiyivka',
        titleUk: 'Дендропарк «Софіївка»',
        titleEn: 'Sofiyivka Park',
        lat: 48.764,
        lng: 30.214,
        minutes: 90,
        free: false,
        thumb: T3,
        distKm: 2.5,
        descUk: 'Шедевр садово-паркового мистецтва XVIII–XIX ст.',
        descEn: 'Famous 18th–19th century landscape park.',
      },
      {
        id: 'uman_center',
        titleUk: 'Соборна площа',
        titleEn: 'Soborna Square',
        lat: 48.748,
        lng: 30.222,
        minutes: 35,
        free: true,
        thumb: T4,
        distKm: 0.2,
        descUk: 'Центр міста з фонтаном.',
        descEn: 'Central square with fountain.',
      },
    ],
  },
  kamianets_podilskyi: {
    id: 'kamianets_podilskyi',
    titleUk: 'Кам’янець-Подільський',
    titleEn: 'Kamianets-Podilskyi',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_KAMIANETS_PODILSKYI,
    center: { latitude: 48.6844, longitude: 26.583, latitudeDelta: 0.07, longitudeDelta: 0.07 },
    landmarks: [
      {
        id: 'kp_fortress',
        titleUk: 'Кам’янець-Подільська фортеця',
        titleEn: 'Kamianets fortress',
        lat: 48.6736,
        lng: 26.5638,
        minutes: 90,
        free: false,
        thumb: T1,
        distKm: 1.5,
        descUk: 'Середньовічна твердиня над каньйоном Смотрича.',
        descEn: 'Medieval citadel above the Smotrych canyon.',
      },
      {
        id: 'kp_bridge',
        titleUk: 'Турецький міст',
        titleEn: 'Turkish bridge',
        lat: 48.671,
        lng: 26.575,
        minutes: 30,
        free: true,
        thumb: T2,
        distKm: 0.8,
        descUk: 'Легендарний міст через річку.',
        descEn: 'Historic footbridge over the gorge.',
      },
    ],
  },
  mukachevo: {
    id: 'mukachevo',
    titleUk: 'Мукачево',
    titleEn: 'Mukachevo',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_MUKACHEVO,
    center: { latitude: 48.4415, longitude: 22.7126, latitudeDelta: 0.08, longitudeDelta: 0.08 },
    landmarks: [
      {
        id: 'mukachevo_palanka',
        titleUk: 'Паланок',
        titleEn: 'Palanok Castle',
        lat: 48.431,
        lng: 22.687,
        minutes: 70,
        free: false,
        thumb: T3,
        distKm: 2.0,
        descUk: 'Замок на вулканічній горі — символ Закарпаття.',
        descEn: 'Hilltop castle — Transcarpathian icon.',
      },
      {
        id: 'mukachevo_center',
        titleUk: 'Центральна площа',
        titleEn: 'Central square',
        lat: 48.441,
        lng: 22.713,
        minutes: 35,
        free: true,
        thumb: T4,
        distKm: 0.2,
        descUk: 'Ратуша й кав’ярні.',
        descEn: 'Town hall and cafés.',
      },
    ],
  },
  drohobych: {
    id: 'drohobych',
    titleUk: 'Дрогобич',
    titleEn: 'Drohobych',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_DROHOBYCH,
    center: { latitude: 49.3495, longitude: 23.5059, latitudeDelta: 0.08, longitudeDelta: 0.08 },
    landmarks: [
      {
        id: 'drohobych_church',
        titleUk: 'Церква Святого Юра',
        titleEn: 'St. George’s Church (UNESCO)',
        lat: 49.348,
        lng: 23.512,
        minutes: 45,
        free: true,
        thumb: T1,
        distKm: 0.5,
        descUk: 'Дерев’яна архітектура Галичини.',
        descEn: 'UNESCO wooden church architecture.',
      },
      {
        id: 'drohobych_salt',
        titleUk: 'Солеварня «Соляна вулиця»',
        titleEn: 'Salt works heritage',
        lat: 49.352,
        lng: 23.5,
        minutes: 50,
        free: false,
        thumb: T2,
        distKm: 0.6,
        descUk: 'Історія соляного промислу.',
        descEn: 'Salt industry history.',
      },
    ],
  },
  konotop: {
    id: 'konotop',
    titleUk: 'Конотоп',
    titleEn: 'Konotop',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_KONOTOP,
    center: { latitude: 51.2377, longitude: 33.2056, latitudeDelta: 0.09, longitudeDelta: 0.09 },
    landmarks: [
      {
        id: 'konotop_park',
        titleUk: 'Парк ім. Котляревського',
        titleEn: 'Kotliarevskyi Park',
        lat: 51.24,
        lng: 33.2,
        minutes: 45,
        free: true,
        thumb: T3,
        distKm: 0.8,
        descUk: 'Зелена зона в Сумській області.',
        descEn: 'Green park in Sumy region.',
      },
      {
        id: 'konotop_center',
        titleUk: 'Соборна площа',
        titleEn: 'Soborna Square',
        lat: 51.238,
        lng: 33.206,
        minutes: 30,
        free: true,
        thumb: T4,
        distKm: 0.2,
        descUk: 'Центр міста з пам’ятниками.',
        descEn: 'Downtown square with monuments.',
      },
    ],
  },
  nizhyn: {
    id: 'nizhyn',
    titleUk: 'Ніжин',
    titleEn: 'Nizhyn',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_NIZHYN,
    center: { latitude: 51.048, longitude: 31.8828, latitudeDelta: 0.08, longitudeDelta: 0.08 },
    landmarks: [
      {
        id: 'nizhyn_spaso',
        titleUk: 'Спасо-Преображенський собор',
        titleEn: 'Transfiguration Cathedral',
        lat: 51.046,
        lng: 31.879,
        minutes: 45,
        free: true,
        thumb: T1,
        distKm: 0.4,
        descUk: 'Козацька столиця торгу — історичний храм.',
        descEn: 'Cossack trade city landmark church.',
      },
      {
        id: 'nizhyn_gogol',
        titleUk: 'Музей Гоголя',
        titleEn: 'Gogol Museum',
        lat: 51.05,
        lng: 31.885,
        minutes: 40,
        free: false,
        thumb: T2,
        distKm: 0.5,
        descUk: 'Літературна спадщина Ніжина.',
        descEn: 'Literary heritage of Nizhyn.',
      },
    ],
  },
  sloviansk: {
    id: 'sloviansk',
    titleUk: 'Слов’янськ',
    titleEn: 'Sloviansk',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_SLOVIANSK,
    center: { latitude: 48.8708, longitude: 38.0932, latitudeDelta: 0.09, longitudeDelta: 0.09 },
    landmarks: [
      {
        id: 'sloviansk_salt',
        titleUk: 'Солоні озера',
        titleEn: 'Salt lakes area',
        lat: 48.862,
        lng: 38.082,
        minutes: 60,
        free: true,
        thumb: T3,
        distKm: 2.0,
        descUk: 'Рожеві води й грязелікування.',
        descEn: 'Pink brine lakes and mud baths.',
      },
      {
        id: 'sloviansk_park',
        titleUk: 'Парк ім. Т. Г. Шевченка',
        titleEn: 'Shevchenko Park',
        lat: 48.872,
        lng: 38.095,
        minutes: 45,
        free: true,
        thumb: T4,
        distKm: 0.5,
        descUk: 'Центральний парк курортного міста.',
        descEn: 'Central park of the spa town.',
      },
    ],
  },
  bila_tserkva: {
    id: 'bila_tserkva',
    titleUk: 'Біла Церква',
    titleEn: 'Bila Tserkva',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_BILA_TSERKVA,
    center: { latitude: 49.8073, longitude: 30.1151, latitudeDelta: 0.09, longitudeDelta: 0.09 },
    landmarks: [
      {
        id: 'bila_oleksandriia',
        titleUk: 'Дендропарк «Олександрія»',
        titleEn: 'Oleksandriia Dendropark',
        lat: 49.826,
        lng: 30.125,
        minutes: 90,
        free: false,
        thumb: T1,
        distKm: 3.0,
        descUk: 'Пейзажний парк з озерами й руїнами.',
        descEn: 'Landscape park with lakes and follies.',
      },
      {
        id: 'bila_cathedral',
        titleUk: 'Собор Богородиці',
        titleEn: 'Transfiguration Cathedral',
        lat: 49.807,
        lng: 30.117,
        minutes: 40,
        free: true,
        thumb: T2,
        distKm: 0.2,
        descUk: 'Брама історичного центру.',
        descEn: 'Gate of the old town centre.',
      },
    ],
  },
  brovary: {
    id: 'brovary',
    titleUk: 'Бровари',
    titleEn: 'Brovary',
    countryUk: 'Україна',
    countryEn: 'Ukraine',
    flag: '🇺🇦',
    heroThumb: T_BROVARY,
    center: { latitude: 50.5111, longitude: 30.7909, latitudeDelta: 0.09, longitudeDelta: 0.09 },
    landmarks: [
      {
        id: 'brovary_park',
        titleUk: 'Перемоги парк',
        titleEn: 'Peremohy Park',
        lat: 50.515,
        lng: 30.795,
        minutes: 45,
        free: true,
        thumb: T3,
        distKm: 0.6,
        descUk: 'Зелена зона східного передмістя Києва.',
        descEn: 'Green park in Kyiv’s eastern suburb.',
      },
      {
        id: 'brovary_center',
        titleUk: 'Майдан Незалежності (Бровари)',
        titleEn: 'Brovary central square',
        lat: 50.51,
        lng: 30.79,
        minutes: 30,
        free: true,
        thumb: T4,
        distKm: 0.2,
        descUk: 'Пішохідний центр міста.',
        descEn: 'Pedestrian city centre.',
      },
    ],
  },
  warsaw: {
    id: 'warsaw',
    titleUk: 'Варшава',
    titleEn: 'Warsaw',
    countryUk: 'Польща',
    countryEn: 'Poland',
    flag: '🇵🇱',
    heroThumb: T_WARSAW,
    center: { latitude: 52.2297, longitude: 21.0122, latitudeDelta: 0.1, longitudeDelta: 0.1 },
    landmarks: [
      {
        id: 'palace_culture',
        titleUk: 'Палац культури',
        titleEn: 'Palace of Culture',
        lat: 52.2319,
        lng: 21.0067,
        minutes: 40,
        free: true,
        thumb: T1,
        distKm: 0.3,
        descUk: 'Висотка в центрі — оглядовий майданчик і культурні зали.',
        descEn: 'Socialist-era tower — viewing deck and culture venues downtown.',
      },
      {
        id: 'old_town_waw',
        titleUk: 'Старе Місто',
        titleEn: 'Old Town',
        lat: 52.2498,
        lng: 21.0122,
        minutes: 50,
        free: true,
        thumb: T2,
        distKm: 0.9,
        descUk: 'Відбудоване Старе Місто ЮНЕСКО — площі та кав’ярні.',
        descEn: 'UNESCO Old Town rebuilt — squares and cafés.',
      },
    ],
  },
  berlin: {
    id: 'berlin',
    titleUk: 'Берлін',
    titleEn: 'Berlin',
    countryUk: 'Німеччина',
    countryEn: 'Germany',
    flag: '🇩🇪',
    heroThumb: T_BERLIN,
    center: { latitude: 52.52, longitude: 13.405, latitudeDelta: 0.11, longitudeDelta: 0.11 },
    landmarks: [
      {
        id: 'brandenburg',
        titleUk: 'Бранденбурзькі ворота',
        titleEn: 'Brandenburg Gate',
        lat: 52.5163,
        lng: 13.3777,
        minutes: 30,
        free: true,
        thumb: T1,
        distKm: 0.2,
        descUk: 'Символ Єдності та класична зустрічна точка туристів.',
        descEn: 'Symbol of unity and Berlin’s classic meeting point.',
      },
      {
        id: 'reichstag',
        titleUk: 'Рейхстаг',
        titleEn: 'Reichstag',
        lat: 52.5186,
        lng: 13.3761,
        minutes: 45,
        free: true,
        thumb: T3,
        distKm: 0.4,
        descUk: 'Парламент із скляним куполом — за попереднього запису.',
        descEn: 'Parliament with glass dome — book visits in advance.',
      },
    ],
  },
  madrid: {
    id: 'madrid',
    titleUk: 'Мадрид',
    titleEn: 'Madrid',
    countryUk: 'Іспанія',
    countryEn: 'Spain',
    flag: '🇪🇸',
    heroThumb: T_MADRID,
    center: { latitude: 40.4168, longitude: -3.7038, latitudeDelta: 0.1, longitudeDelta: 0.1 },
    landmarks: [
      {
        id: 'prado',
        titleUk: 'Музей Прадо',
        titleEn: 'Prado Museum',
        lat: 40.4138,
        lng: -3.6921,
        minutes: 60,
        free: false,
        thumb: T1,
        distKm: 0.5,
        descUk: 'Золота колекція іспанського живопису та європейських майстрів.',
        descEn: 'Spain’s premier museum for painting masters.',
      },
      {
        id: 'retiro',
        titleUk: 'Парк Ретіро',
        titleEn: 'Retiro Park',
        lat: 40.4153,
        lng: -3.6844,
        minutes: 40,
        free: true,
        thumb: T2,
        distKm: 1.0,
        descUk: 'Зелена зона центру — озеро з човнами й алеями.',
        descEn: 'Green lung of the centre — boating lake and alleys.',
      },
    ],
  },
  amsterdam: {
    id: 'amsterdam',
    titleUk: 'Амстердам',
    titleEn: 'Amsterdam',
    countryUk: 'Нідерланди',
    countryEn: 'Netherlands',
    flag: '🇳🇱',
    heroThumb: T_AMSTERDAM,
    center: { latitude: 52.3676, longitude: 4.9041, latitudeDelta: 0.08, longitudeDelta: 0.08 },
    landmarks: [
      {
        id: 'rijksmuseum',
        titleUk: 'Державний музей',
        titleEn: 'Rijksmuseum',
        lat: 52.3600,
        lng: 4.8852,
        minutes: 55,
        free: false,
        thumb: T1,
        distKm: 0.6,
        descUk: 'Рембрандт і золота доба Голландії під одним дахом.',
        descEn: 'Rembrandt and the Dutch Golden Age under one roof.',
      },
      {
        id: 'canal_ring',
        titleUk: 'Канали центру',
        titleEn: 'Canal ring',
        lat: 52.3728,
        lng: 4.8936,
        minutes: 35,
        free: true,
        thumb: T3,
        distKm: 0.2,
        descUk: 'Прогулянка вузькими вулицями вздовж історичних каналів.',
        descEn: 'Walk the narrow streets along historic canals.',
      },
    ],
  },
  waalwijk: {
    id: 'waalwijk',
    titleUk: 'Валвейк',
    titleEn: 'Waalwijk',
    countryUk: 'Нідерланди',
    countryEn: 'Netherlands',
    flag: '🇳🇱',
    heroThumb: T_WAALWIJK,
    center: { latitude: 51.685, longitude: 5.0708, latitudeDelta: 0.06, longitudeDelta: 0.06 },
    landmarks: [
      {
        id: 'waalwijk_sint_jan',
        titleUk: 'Церква Sint-Jan',
        titleEn: 'Sint-Jan Church',
        lat: 51.6858,
        lng: 5.0702,
        minutes: 30,
        free: true,
        thumb: T1,
        distKm: 0.1,
        descUk: 'Необізантійська базиліка з великим куполом — символ центру міста.',
        descEn: 'Neo-Byzantine basilica with a large dome — the town centre landmark.',
      },
      {
        id: 'waalwijk_markt',
        titleUk: 'Markt',
        titleEn: 'Market Square',
        lat: 51.6853,
        lng: 5.0695,
        minutes: 25,
        free: true,
        thumb: T2,
        distKm: 0.1,
        descUk: 'Головна площа з терасами кафе й історичними будинками.',
        descEn: 'Main square with café terraces and historic brick houses.',
      },
    ],
  },
  den_bosch: {
    id: 'den_bosch',
    titleUk: 'Ден Бош',
    titleEn: "'s-Hertogenbosch",
    countryUk: 'Нідерланди',
    countryEn: 'Netherlands',
    flag: '🇳🇱',
    heroThumb: T_DEN_BOSCH,
    center: { latitude: 51.6978, longitude: 5.3037, latitudeDelta: 0.06, longitudeDelta: 0.06 },
    landmarks: [
      {
        id: 'den_bosch_cathedral',
        titleUk: 'Собор Sint-Jan',
        titleEn: "St. John's Cathedral",
        lat: 51.688,
        lng: 5.3046,
        minutes: 40,
        free: false,
        thumb: T1,
        distKm: 0.1,
        descUk: 'Готичний собор з вітражами — головна пам’ятка історичного центру.',
        descEn: 'Gothic cathedral with stained glass — the old town’s main landmark.',
      },
      {
        id: 'den_bosch_markt',
        titleUk: 'De Markt',
        titleEn: 'Market Square',
        lat: 51.6888,
        lng: 5.3031,
        minutes: 25,
        free: true,
        thumb: T2,
        distKm: 0.1,
        descUk: 'Центральна площа біля собору з терасами кафе.',
        descEn: 'Central square near the cathedral with café terraces.',
      },
    ],
  },
  vlijmen: {
    id: 'vlijmen',
    titleUk: 'Влаймен',
    titleEn: 'Vlijmen',
    countryUk: 'Нідерланди',
    countryEn: 'Netherlands',
    flag: '🇳🇱',
    heroThumb: T_VLIJMEN,
    center: { latitude: 51.6847, longitude: 5.2139, latitudeDelta: 0.05, longitudeDelta: 0.05 },
    landmarks: [
      {
        id: 'vlijmen_church',
        titleUk: 'Церква Sint-Petrus’-Banden',
        titleEn: "St. Peter in Chains Church",
        lat: 51.6849,
        lng: 5.2145,
        minutes: 25,
        free: true,
        thumb: T1,
        distKm: 0.1,
        descUk: 'Неоготична церква з високою шпилькою — символ центру Vlijmen.',
        descEn: 'Neo-Gothic church with a tall spire — the centre of Vlijmen.',
      },
      {
        id: 'vlijmen_centre',
        titleUk: 'Центр Vlijmen',
        titleEn: 'Vlijmen town centre',
        lat: 51.6845,
        lng: 5.2135,
        minutes: 20,
        free: true,
        thumb: T2,
        distKm: 0.1,
        descUk: 'Тихі цегляні вулиці, велосипедні доріжки та затишні дворики.',
        descEn: 'Quiet brick streets, cycle paths and cosy residential lanes.',
      },
    ],
  },
  vilnius: {
    id: 'vilnius',
    titleUk: 'Вільнюс',
    titleEn: 'Vilnius',
    countryUk: 'Литва',
    countryEn: 'Lithuania',
    flag: '🇱🇹',
    heroThumb: T_VILNIUS,
    center: { latitude: 54.6872, longitude: 25.2797, latitudeDelta: 0.09, longitudeDelta: 0.09 },
    landmarks: [
      {
        id: 'gediminas',
        titleUk: 'Вежа Гедиміна',
        titleEn: 'Gediminas Tower',
        lat: 54.6869,
        lng: 25.2906,
        minutes: 40,
        free: false,
        thumb: T1,
        distKm: 0.4,
        descUk: 'Замок на пагорбі — панорама Старого міста.',
        descEn: 'Hill castle with old town panoramas.',
      },
      {
        id: 'old_town_vln',
        titleUk: 'Старе Місто Вільнюса',
        titleEn: 'Vilnius Old Town',
        lat: 54.6824,
        lng: 25.2871,
        minutes: 45,
        free: true,
        thumb: T2,
        distKm: 0.2,
        descUk: 'Бароко, дворики та кав’ярні — компактний центр.',
        descEn: 'Baroque lanes, courtyards and compact cafés.',
      },
    ],
  },
  riga: {
    id: 'riga',
    titleUk: 'Рига',
    titleEn: 'Riga',
    countryUk: 'Латвія',
    countryEn: 'Latvia',
    flag: '🇱🇻',
    heroThumb: T_RIGA,
    center: { latitude: 56.9496, longitude: 24.1052, latitudeDelta: 0.09, longitudeDelta: 0.09 },
    landmarks: [
      {
        id: 'old_town_riga',
        titleUk: 'Старе Місто Риги',
        titleEn: 'Riga Old Town',
        lat: 56.947,
        lng: 24.1069,
        minutes: 50,
        free: true,
        thumb: T1,
        distKm: 0.2,
        descUk: 'ЮНЕСКО: готика, ринкова площа й вузькі вулиці.',
        descEn: 'UNESCO core — Gothic squares and narrow streets.',
      },
      {
        id: 'art_nouveau',
        titleUk: 'Бульвар югендстилю',
        titleEn: 'Art Nouveau streets',
        lat: 56.9562,
        lng: 24.1214,
        minutes: 35,
        free: true,
        thumb: T3,
        distKm: 1.2,
        descUk: 'Елітабульвар з фасадами модерну на зламі століть.',
        descEn: 'Avenue known for art nouveau facades.',
      },
    ],
  },
  bucharest: {
    id: 'bucharest',
    titleUk: 'Бухарест',
    titleEn: 'Bucharest',
    countryUk: 'Румунія',
    countryEn: 'Romania',
    flag: '🇷🇴',
    heroThumb: T_BUCHAREST,
    center: { latitude: 44.4268, longitude: 26.1025, latitudeDelta: 0.1, longitudeDelta: 0.1 },
    landmarks: [
      {
        id: 'palace_parliament',
        titleUk: 'Палац парламенту',
        titleEn: 'Palace of Parliament',
        lat: 44.4272,
        lng: 26.0875,
        minutes: 50,
        free: false,
        thumb: T1,
        distKm: 0.8,
        descUk: 'Гігантська споруда епохи Чаушеску — екскурсії всередину.',
        descEn: 'Massive Ceaușescu-era building with interior tours.',
      },
      {
        id: 'old_town_buh',
        titleUk: 'Старий центр',
        titleEn: 'Old Town Lipscani',
        lat: 44.4322,
        lng: 26.1039,
        minutes: 40,
        free: true,
        thumb: T2,
        distKm: 0.3,
        descUk: 'Вулиці з барами, клубами й історичною бруківкою.',
        descEn: 'Lanes with nightlife on historic cobblestones.',
      },
    ],
  },
  yerevan: {
    id: 'yerevan',
    titleUk: 'Єреван',
    titleEn: 'Yerevan',
    countryUk: 'Вірменія',
    countryEn: 'Armenia',
    flag: '🇦🇲',
    heroThumb: T_YEREVAN,
    center: { latitude: 40.1792, longitude: 44.4991, latitudeDelta: 0.1, longitudeDelta: 0.1 },
    landmarks: [
      {
        id: 'republic_sq',
        titleUk: 'Площа Республіки',
        titleEn: 'Republic Square',
        lat: 40.1777,
        lng: 44.5126,
        minutes: 30,
        free: true,
        thumb: T1,
        distKm: 0.2,
        descUk: 'Архітектура розових туфів і фонтанне шоу ввечері.',
        descEn: 'Pink tuff architecture and evening fountain shows.',
      },
      {
        id: 'cascade',
        titleUk: 'Каскад',
        titleEn: 'Cascade Complex',
        lat: 40.1909,
        lng: 44.5156,
        minutes: 45,
        free: true,
        thumb: T3,
        distKm: 1.1,
        descUk: 'Сходи, скульптури та вид на Арарат у ясну погоду.',
        descEn: 'Stairs, sculpture and Ararat views on clear days.',
      },
    ],
  },
};

applyIntroStoryScaffoldToRegions(ROUTE_REGIONS);

/** Усі регіони з локальних даних, що належать Україні (міста й зони для головної / маршрутів). */
export function collectRegionIdsForUkraine() {
  return Object.keys(ROUTE_REGIONS).filter(
    (id) =>
      ROUTE_REGIONS[id]?.countryUk === 'Україна' || String(ROUTE_REGIONS[id]?.countryEn || '').toLowerCase() === 'ukraine',
  );
}

/** Мапа: англомовна назва країни → ISO2 код (для сортування й відповідності прапорцям). */
const COUNTRY_EN_TO_ID = {
  ukraine: 'UA',
  france: 'FR',
  italy: 'IT',
  germany: 'DE',
  spain: 'ES',
  poland: 'PL',
  romania: 'RO',
  netherlands: 'NL',
  lithuania: 'LT',
  latvia: 'LV',
  armenia: 'AM',
};

/** Усі регіони згруповані за країнами — для сторінки «Всі країни». */
export function collectAllCountriesWithRegions() {
  const map = {};
  for (const id of Object.keys(ROUTE_REGIONS)) {
    const r = ROUTE_REGIONS[id];
    const countryEn = String(r?.countryEn || '').trim();
    if (!countryEn) continue;
    const key = countryEn.toLowerCase();
    const countryId = COUNTRY_EN_TO_ID[key] || countryEn;
    if (!map[countryId]) {
      map[countryId] = {
        countryId,
        countryUk: r.countryUk || countryEn,
        countryEn,
        flag: r.flag || '🏳️',
        regionIds: [],
      };
    }
    map[countryId].regionIds.push(id);
  }
  const order = ['UA', 'FR', 'IT', 'ES', 'DE', 'PL', 'NL', 'RO', 'LT', 'LV', 'AM'];
  const ordered = [];
  for (const id of order) if (map[id]) { ordered.push(map[id]); delete map[id]; }
  for (const k of Object.keys(map)) ordered.push(map[k]);
  return ordered;
}

export function getRegion(regionId) {
  return ROUTE_REGIONS[regionId] || ROUTE_REGIONS.kyiv;
}

/** Міста з локальних даних маршрутів — для списку в профілі. */
export function listRouteCitiesForProfilePicker(language) {
  const langUk = String(language || 'en').split(/[-_]/)[0].toLowerCase() === 'uk';
  const rows = Object.values(ROUTE_REGIONS).map((r) => ({
    regionId: r.id,
    label: langUk ? r.titleUk : r.titleEn,
    flag: r.flag,
    subtitle: langUk ? r.countryUk : r.countryEn,
  }));
  rows.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  return rows;
}

/**
 * Визначає регіон лише за текстом запиту (одне місто / зона).
 */
function haversineKmSimple(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Найближче місто з каталогу за координатами (коли поле пошуку порожнє). */
export function resolveRegionIdFromOrigin(origin) {
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) {
    return 'kyiv';
  }
  let bestId = 'kyiv';
  let bestDist = Infinity;
  for (const id of Object.keys(ROUTE_REGIONS)) {
    const c = ROUTE_REGIONS[id]?.center;
    if (!c || !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) continue;
    const d = haversineKmSimple(
      { lat: origin.lat, lng: origin.lng },
      { lat: c.latitude, lng: c.longitude },
    );
    if (d < bestDist) {
      bestDist = d;
      bestId = id;
    }
  }
  return bestId;
}

export function resolveRegionIdFromQuery(query) {
  const q = (query || '').toLowerCase();
  if (
    /париж|paris|париж|ейфел|eiffel|лувр|louvre|сен-шапель|sainte|chapelle|тріумф|triomphe/.test(q)
  ) {
    return 'paris';
  }
  if (
    /київ|kyiv|kiev|києва|києву|лавра|lavra|софі|sophia|майдан|motherland|батьківщина|поділ|podil|оболон|оболонь|печерськ|шевченків|теремки|троєщин|хрещатик|khreschatyk|центр\s*києва/.test(
      q,
    )
  ) {
    return 'kyiv';
  }
  if (/рим|rome|roma|коліз|colosseum|колізей|треві|trevi|пантеон|pantheon|ватикан|vatican|петра/.test(q)) {
    return 'rome';
  }
  if (/львів|lviv|львова|rynok|ринок|опера львів|lviv opera/.test(q)) return 'lviv';
  if (/одес|odesa|odessa|потьомкін|potemkin|одеськ.*опер/.test(q)) return 'odesa';
  if (/харків|kharkiv|харьков|свободи.*харк|freedom square.*khark/.test(q)) return 'kharkiv';
  if (/дніпр(о|а)|dnipro|днепр|європейськ.*дніпр|embankment.*dnipro/.test(q)) return 'dnipro';
  if (/warszawa|warsaw|варшав|palace of culture|палац культури/.test(q)) return 'warsaw';
  if (/берлін|berlin|brandenburg|рейхстаг|reichstag/.test(q)) return 'berlin';
  if (/мадрид|madrid|prado|прадо|retiro|ретіро/.test(q)) return 'madrid';
  if (/amsterdam|амстердам|rijksmuseum|канал/.test(q)) return 'amsterdam';
  if (/waalwijk|валвейк|sint-jan|sint jan/.test(q)) return 'waalwijk';
  if (/den.bosch|ден.бош|hertogenbosch|sint-jan.*kathedraal|binnendieze/.test(q)) return 'den_bosch';
  if (/vlijmen|влаймен|petrus.*banden|sint-petrus/.test(q)) return 'vlijmen';
  if (/вільнюс|vilnius|gediminas|гедиміна/.test(q)) return 'vilnius';
  if (/рига|riga|латві|latvia.*riga/.test(q)) return 'riga';
  if (/бухарест|bucharest|palace of parliament|парламенту/.test(q)) return 'bucharest';
  if (/єреван|yerevan|erevan|cascade|каскад|republic square/.test(q)) return 'yerevan';
  return 'kyiv';
}

export function regionTitle(region, langIsUk) {
  const arg = langIsUk;
  // Backward compatible: existing call sites pass boolean (uk/en).
  if (typeof arg === 'boolean') return arg ? region.titleUk : region.titleEn;

  const lang = String(arg || 'en')
    .trim()
    .split(/[-_]/)[0]
    .toLowerCase();

  const id = region?.id;
  try {
    const { regionTitleRow } = require('./regionTitlesI18n');
    const generated = id && regionTitleRow(id);
    if (generated) {
      const { pickI18n } = require('./i18nBundle');
      const t = pickI18n(lang, generated);
      if (t) return t;
    }
  } catch {
    /* optional generated bundle */
  }
  const pack = id && REGION_TITLES_BY_LANG[id];
  const byLang = pack && (pack[lang] || pack.en);
  return byLang || region.titleEn || region.titleUk;
}

/** Optional city-name overrides per UI language (fallback to en). */
const REGION_TITLES_BY_LANG = {
  waalwijk: { uk: 'Валвейк', en: 'Waalwijk', nl: 'Waalwijk' },
  den_bosch: { uk: 'Ден Бош', en: 'Den Bosch', nl: 'Den Bosch' },
  vlijmen: { uk: 'Влаймен', en: 'Vlijmen', nl: 'Vlijmen' },
};

export function landmarkTitle(lm, langIsUk) {
  return langIsUk ? lm.titleUk : lm.titleEn;
}

export function getLandmarkInRegion(regionId, landmarkId) {
  const r = ROUTE_REGIONS[regionId];
  if (!r || !landmarkId) return null;
  return r.landmarks.find((l) => l.id === landmarkId) || null;
}
