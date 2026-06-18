import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  ScrollView,
  Platform,
  Image,
  TextInput,
  Animated,
  Easing,
  Keyboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useResponsive } from './useResponsive';
import Lemon3DButton from './Lemon3DButton';
import GlowingLanguageButton from './components/ui/GlowingLanguageButton';
import Ionicons from '@expo/vector-icons/Ionicons';

import { LANG_PICKER_DONE_KEY } from './onboardingStorage';
import { KFONT, fontPad } from './appTypography';
import { brandFontHeadBold } from './brandFont';

const LANGUAGE_STORAGE_KEY = '@kraina_app_language';


const CAROUSEL_QUANTITY = 10;
const CAROUSEL_FACE_RGB = [
  [142, 249, 252],
  [142, 252, 204],
  [142, 252, 157],
  [215, 252, 142],
  [252, 252, 142],
  [252, 208, 142],
  [252, 142, 142],
  [252, 142, 239],
  [204, 142, 252],
  [142, 202, 252],
];

const CAROUSEL_FACE_SOURCES = [
  require('./assets/premium_photo-1689371089286-6f75a9ecd4ca.avif'),
  require('./assets/1234.avif'),
  require('./assets/photo-1518684079-3c830dcef090.avif'),
  require('./assets/photo-1580072624564-1fe6b660b7e2.avif'),
  require('./assets/photo-1615119449152-d94284eafa45.avif'),
  require('./assets/photo-1630227286297-f7cc7c97f415.avif'),
  require('./assets/photo-1631603903804-9dab873f8522.avif'),
  require('./assets/photo-1635317376825-59b7d18a9342.avif'),
  require('./assets/premium_photo-1669399775776-16a90384a3e6.avif'),
  require('./assets/premium_photo-1676319876974-3c9759cb8c4a.avif'),
];


const LANGUAGE_GRID_GAP = 6;

/** Max length of normalized query / token (performance guard). */
const SEARCH_QUERY_MAX_LEN = 48;

const SCROLL_PEEK_FADE_H = 10;
const SCROLL_PEEK_BUTTON_H = 40;

const SCROLL_PEEK_CLIP = 0;

const LANG_LIST_BOTTOM_INSET = 6;
const LIST_CARD_INNER_BG = 'rgba(20, 22, 28, 0.97)';

let storage = null;
try {
  storage = require('@react-native-async-storage/async-storage').default;
} catch (e) {
  storage = {
    getItem: async () => null,
    setItem: async () => {},
  };
}

const safeGetItem = async (key) => {
  try {
    return await storage.getItem(key);
  } catch (e) {
    return null;
  }
};

const safeSetItem = async (key, value) => {
  try {
    await storage.setItem(key, value);
  } catch (e) {}
};


const LANGUAGES = [
  { id: 'en', label: 'English', flag: '🇬🇧' },
  { id: 'uk', label: 'Українська', flag: '🇺🇦' },
  { id: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { id: 'pl', label: 'Polski', flag: '🇵🇱' },
  { id: 'nl', label: 'Nederlands', flag: '🇳🇱' },
  { id: 'es', label: 'Español', flag: '🇪🇸' },
  { id: 'lt', label: 'Lietuvių', flag: '🇱🇹' },
  { id: 'lv', label: 'Latviešu', flag: '🇱🇻' },
  { id: 'ro', label: 'Română', flag: '🇷🇴' },
  { id: 'it', label: 'Italiano', flag: '🇮🇹' },
  { id: 'hy', label: 'Հայերեն', flag: '🇦🇲' },
];

const TEXTS = {
  uk: {
    chooseLanguage: 'Оберіть мову',
    language: '(Мова)',
    continue: 'Продовжити',
    searchLanguage: 'Пошук мови',
  },
  en: {
    chooseLanguage: 'Choose language',
    language: '(Language)',
    continue: 'Continue',
    searchLanguage: 'Search language',
  },
  pl: {
    chooseLanguage: 'Wybierz język',
    language: '(Język)',
    continue: 'Kontynuuj',
    searchLanguage: 'Szukaj języka',
  },
  nl: {
    chooseLanguage: 'Kies taal',
    language: '(Taal)',
    continue: 'Doorgaan',
    searchLanguage: 'Zoek taal',
  },
  es: {
    chooseLanguage: 'Elegir idioma',
    language: '(Idioma)',
    continue: 'Continuar',
    searchLanguage: 'Buscar idioma',
  },
  lt: {
    chooseLanguage: 'Pasirinkite kalbą',
    language: '(Kalba)',
    continue: 'Tęsti',
    searchLanguage: 'Ieškoti kalbos',
  },
  lv: {
    chooseLanguage: 'Izvēlieties valodu',
    language: '(Valoda)',
    continue: 'Turpināt',
    searchLanguage: 'Meklēt valodu',
  },
  de: {
    chooseLanguage: 'Sprache wählen',
    language: '(Sprache)',
    continue: 'Weiter',
    searchLanguage: 'Sprache suchen',
  },
  ro: {
    chooseLanguage: 'Alege limba',
    language: '(Limba)',
    continue: 'Continuă',
    searchLanguage: 'Caută limba',
  },
  it: {
    chooseLanguage: 'Scegli la lingua',
    language: '(Lingua)',
    continue: 'Continua',
    searchLanguage: 'Cerca lingua',
  },
  hy: {
    chooseLanguage: 'Ընտրեք լեզուն',
    language: '(Լեզու)',
    continue: 'Շարունակել',
    searchLanguage: 'Որոնել լեզու',
  },
};

const SCROLL_HINT = {
  uk: 'Листайте вниз, щоб побачити інші мови',
  en: 'Scroll down for more languages',
  pl: 'Przewiń w dół, aby zobaczyć więcej języków',
  nl: 'Scroll omlaag voor meer talen',
  es: 'Desplázate para ver más idiomas',
  lt: 'Slinkite žemyn, kad matytumėte daugiau kalbų',
  lv: 'Ritiniet uz leju, lai redzētu citas valodas',
  de: 'Nach unten scrollen für weitere Sprachen',
  ro: 'Derulează în jos pentru mai multe limbi',
  it: 'Scorri verso il basso per altre lingue',
  hy: 'Ոլորեք ներքև՝ այլ լեզուներ տեսնելու համար',
};

const DEFAULT_TEXTS = {
  chooseLanguage: 'Choose language',
  language: '(Language)',
  continue: 'Continue',
  scrollHint: 'Scroll down for more languages',
  searchLanguage: 'Search language',
};

function normalizeForSearch(v) {
  return String(v || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_'`".,;:!?()[\]{}\\/|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function translitCyrToLat(input) {
  const map = {
    а: 'a', б: 'b', в: 'v', г: 'g', ґ: 'g', д: 'd', е: 'e', ё: 'e', є: 'ye', ж: 'zh', з: 'z',
    и: 'i', і: 'i', ї: 'yi', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
    с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '',
    ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  return String(input || '')
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('');
}

function buildSearchForms(v) {
  const base = normalizeForSearch(v);
  if (!base) return [];
  const cyrToLat = normalizeForSearch(translitCyrToLat(base));
  return [...new Set([base, cyrToLat].filter(Boolean))];
}

/**
 * Short tokens (1–2 chars): only prefix / exact match — щоб «de» не ловило випадково «germany».
 * Довші — підрядок у нормалізованому полі (англійською, кирилицею, локальною назвою).
 */
function fieldFormMatches(fieldForm, qf) {
  if (!qf || !fieldForm) return false;
  if (fieldForm === qf) return true;
  if (qf.length <= 2) return fieldForm.startsWith(qf);
  return fieldForm.includes(qf);
}

function languageRowMatchesQuery(langRow, searchRaw) {
  const raw = normalizeForSearch(String(searchRaw || '').trim());
  if (!raw) return true;
  const tokens = raw
    .split(/\s+/)
    .map((t) => t.slice(0, SEARCH_QUERY_MAX_LEN))
    .filter(Boolean);
  if (!tokens.length) return true;
  const staticAliases = SEARCH_ALIASES[langRow.id] || SEARCH_ALIASES[String(langRow.id).split('-')[0]] || [];
  const fields = [langRow.id, langRow.label, ...staticAliases];
  const fieldFormsArrays = fields.map((field) => buildSearchForms(String(field)));
  return tokens.every((token) => {
    const qForms = buildSearchForms(token);
    return qForms.some(
      (qf) =>
        qf &&
        fieldFormsArrays.some((forms) => forms.some((ff) => fieldFormMatches(ff, qf))),
    );
  });
}

/**
 * Усі мови шукати можна латиницею, кирилицею (укр/рос), англійськими назвами тощо —
 * незалежно від обраної мови інтерфейсу екрана.
 */
const SEARCH_ALIASES = {
  en: [
    'english',
    'eng',
    'англійська',
    'англійська мова',
    'англ мова',
    'английский',
    'английский язык',
    'англ',
    'англійськ',
    'британська',
    'британский',
    'англійською',
    'in english',
    'angielski',
    'anglais',
    'englisch',
    'inglese',
    'inglés',
    'inglês',
    'engels',
    'engelsk',
    'engelska',
    'англійська мова',
    'англійською мовою',
    'американська англійська',
    'uk english',
    'gb',
    'us',
  ],
  uk: [
    'ukrainian',
    'ukraine',
    'ukraina',
    'ukr',
    'ua',
    'українська',
    'українська мова',
    'українською',
    'украинский',
    'украинский язык',
    'украинська',
    'украинская',
    'украинская мова',
    'укра',
    'укр мова',
    'українськ',
    'українською мовою',
  ],
  de: [
    'deutsch',
    'german',
    'germany',
    'de',
    'deu',
    'allemand',
    'allemande',
    'tedesco',
    'tedesca',
    'niemiecki',
    'niemcy',
    'німецька',
    'німецька мова',
    'німецькою',
    'німеччина',
    'німці',
    'немецкий',
    'немецкий язык',
    'немецкая',
    'немец',
    'німець',
    'tysk',
    'tyska',
    'saksa',
    'saksan',
    'duitse',
    'duitstalig',
    'aleman',
    'alemán',
    'alemao',
    'alemanha',
    'germană',
    'немка',
    'schweizerdeutsch',
  ],
  pl: [
    'polski',
    'polish',
    'poland',
    'polska',
    'pl',
    'поляк',
    'польська',
    'польська мова',
    'польською',
    'польский',
    'польский язык',
    'polonais',
    'polnisch',
    'polacco',
    'polaco',
    'polonês',
    'pools',
    'poolse',
    ' lengyel',
    'lengyel',
    'poljski',
    'poljski jezik',
    'polonaise',
  ],
  nl: [
    'nederlands',
    'dutch',
    'holland',
    'hollands',
    'netherlands',
    'the netherlands',
    'nl',
    'niederlande',
    'niederländisch',
    'néerlandais',
    'néerlandophone',
    'olanda',
    'olandese',
    'нидерландский',
    'нидерландский язык',
    'нідерландська',
    'нідерландська мова',
    'нідерландською',
    'голландська',
    'голландська мова',
    'голландский',
    'голландия',
    'pays-bas',
    'pays bas',
    'flamand',
    'vlaams',
    'belgisch nederlands',
    'holenderski',
    'nederlandsk',
    'nederlandsk språk',
  ],
  es: [
    'español',
    'espanol',
    'spanish',
    'spain',
    'es',
    'castellano',
    'castilian',
    'испанский',
    'испанский язык',
    'іспанська',
    'іспанська мова',
    'іспанською',
    'hiszpański',
    'hiszpania',
    'espagnol',
    'spanisch',
    'spagnolo',
    'espanhol',
    'spaans',
    'spanska',
    'espanol latino',
    'españa',
    'espana',
    'spanien',
    'spanje',
    'іспанія',
    'іспанія мова',
  ],
  lt: [
    'lietuvių',
    'lietuviu',
    'lietuvių kalba',
    'lithuanian',
    'lithuania',
    'lt',
    'litauen',
    'litauisch',
    'lituanien',
    'lituanienne',
    'литовский',
    'литовский язык',
    'литовська',
    'литовська мова',
    'литовською',
    'литва',
    'litewski',
    'lituanie',
    'lituano',
    'litauski',
    'liettualainen',
    'liettua',
  ],
  lv: [
    'latviešu',
    'latviesu',
    'latvian',
    'latvia',
    'latvija',
    'lv',
    'lettisch',
    'letton',
    'lettone',
    'łotewski',
    'łotwa',
    'латышский',
    'латышский язык',
    'латиська',
    'латиська мова',
    'латвійська',
    'латвія',
    'латыш',
    'latviski',
    'lettland',
    'letonia',
    'letonie',
    'latviešu valoda',
  ],
  ro: [
    'română',
    'romana',
    'romanian',
    'romania',
    'ro',
    'moldovenesc',
    'moldavian',
    'румынский',
    'румынский язык',
    'румунська',
    'румунська мова',
    'румунською',
    'румыния',
    'румунія',
    'roumain',
    'roumanie',
    'rumänisch',
    'rumeno',
    'rumena',
    'rumania',
    'romeno',
    'romenia',
  ],
  it: [
    'italiano',
    'italian',
    'italy',
    'italia',
    'it',
    'italien',
    'italienne',
    'итальянский',
    'итальянский язык',
    'італійська',
    'італійська мова',
    'італійською',
    'włoski',
    'włochy',
    'wlochy',
    'italiensk',
    'italienska',
    'italiano lingua',
    'lingua italiana',
    'италия',
    'італія',
  ],
  hy: [
    'armenian',
    'armenia',
    'hay',
    'hayeren',
    'հայերեն',
    'армянский',
    'армянский язык',
    'вірменська',
    'arménien',
    'armenisch',
    'hy',
    'am',
  ],
};

function prefixHighlightEnd(source, qPrefix) {
  if (!qPrefix || !source) return 0;
  for (let j = 1; j <= source.length; j += 1) {
    const n = normalizeForSearch(source.slice(0, j));
    if (n.length >= qPrefix.length && n.startsWith(qPrefix)) {
      return j;
    }
  }
  return 0;
}

function getTexts(langId) {
  const en = { ...DEFAULT_TEXTS, ...TEXTS.en, scrollHint: SCROLL_HINT.en };
  if (!langId || typeof langId !== 'string') return en;
  const baseId = String(langId).split('-')[0];
  const t = TEXTS[langId] || TEXTS[baseId] || TEXTS.en;
  const scrollHint = SCROLL_HINT[langId] || SCROLL_HINT[baseId] || SCROLL_HINT.en;
  return {
    chooseLanguage: t.chooseLanguage || en.chooseLanguage,
    language: t.language || en.language,
    continue: t.continue || en.continue,
    scrollHint: scrollHint || en.scrollHint,
    searchLanguage: t.searchLanguage || en.searchLanguage,
  };
}

function renderHighlightedLabel(label, query, selected, textExtraStyle, highlightStyle, pillVariant) {
  const base =
    pillVariant === 'glow'
      ? [styles.langGlowPillOptionText, selected && styles.langGlowPillOptionTextSelected, textExtraStyle]
      : pillVariant === 'lemon'
        ? [styles.langPillOptionText, selected && styles.langPillOptionTextSelected, textExtraStyle]
        : [styles.optionText, selected && styles.optionTextSelected, textExtraStyle];
  const hl =
    highlightStyle ??
    (pillVariant === 'glow'
      ? styles.langGlowPillSearchHighlight
      : pillVariant === 'lemon'
        ? styles.langPillSearchHighlight
        : styles.optionTextHighlight);
  const source = String(label || '');
  const qPrefix = normalizeForSearch(String(query || '').trim()).slice(0, SEARCH_QUERY_MAX_LEN);
  const lineProps = pillVariant ? { numberOfLines: 2 } : {};
  if (!qPrefix) return <Text style={base} {...lineProps}>{source}</Text>;

  const end = prefixHighlightEnd(source, qPrefix);
  if (end <= 0) return <Text style={base} {...lineProps}>{source}</Text>;

  const match = source.slice(0, end);
  const after = source.slice(end);
  return (
    <Text style={base} {...lineProps}>
      <Text style={hl}>{match}</Text>
      {after}
    </Text>
  );
}

export default function SecondPage({ navigation }) {
  const r = useResponsive();
  /** Перша установка: за замовчуванням English; збережена мова з AsyncStorage має пріоритет. */
  const [language, setLanguage] = useState('en');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchFocusAnim = useRef(new Animated.Value(0)).current;
  const searchInputRef = useRef(null);
  const blobPulse = useRef(new Animated.Value(0)).current;
  const headerEnter = useRef(new Animated.Value(0)).current;
  const searchEnter = useRef(new Animated.Value(0)).current;
  const listEnter = useRef(new Animated.Value(0)).current;
  const footerEnter = useRef(new Animated.Value(0)).current;
  const carouselSpin = useRef(new Animated.Value(0)).current;
  const languageListScrollRef = useRef(null);
  const languageListScrollViewportH = useRef(0);
  const languageListScrollContentH = useRef(0);
  const languageListScrollY = useRef(0);
  const [languageListNeedsScroll, setLanguageListNeedsScroll] = useState(false);
  const [languageListAtEnd, setLanguageListAtEnd] = useState(false);
  const [languageScrollbarTrackH, setLanguageScrollbarTrackH] = useState(0);
  const [languageScrollbarTick, setLanguageScrollbarTick] = useState(0);

  const userPickedLanguageRef = useRef(false);

  const syncLanguageListScrollable = useCallback(() => {
    setLanguageListNeedsScroll(
      languageListScrollContentH.current > languageListScrollViewportH.current + 2,
    );
  }, []);

  const scrollLanguageListDown = useCallback(() => {
    const vh = languageListScrollViewportH.current;
    const ch = languageListScrollContentH.current;
    const y = languageListScrollY.current;
    const maxY = Math.max(0, ch - vh);
    const step = LANGUAGE_GRID_GAP + 52;
    const next = Math.min(maxY, y + step);
    languageListScrollRef.current?.scrollTo({ y: next, animated: true });
  }, []);

  const handleLanguageListScroll = useCallback((e) => {
    const y = e.nativeEvent.contentOffset.y;
    languageListScrollY.current = y;
    const { contentSize, layoutMeasurement } = e.nativeEvent;
    const maxY = Math.max(0, contentSize.height - layoutMeasurement.height);
    setLanguageListAtEnd(y >= maxY - 4);
    setLanguageScrollbarTick((v) => v + 1);
  }, []);

  const scrollLanguageListToRatio = useCallback((ratio) => {
    const vh = languageListScrollViewportH.current;
    const ch = languageListScrollContentH.current;
    const maxY = Math.max(0, ch - vh);
    const clamped = Math.max(0, Math.min(1, ratio));
    languageListScrollRef.current?.scrollTo({ y: maxY * clamped, animated: false });
  }, []);

  const handleSearchChange = (nextValue) => {
    setSearchQuery(String(nextValue ?? ''));
  };
  const texts = getTexts(language);
  const filteredLanguages = useMemo(() => {
    if (!normalizeForSearch(String(searchQuery || '').trim())) return LANGUAGES;
    return LANGUAGES.filter((l) => languageRowMatchesQuery(l, searchQuery));
  }, [searchQuery]);

  useEffect(() => {
    setLanguageListAtEnd(false);
  }, [filteredLanguages]);

  useEffect(() => {
    Animated.timing(searchFocusAnim, {
      toValue: searchFocused ? 1 : 0,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [searchFocused, searchFocusAnim]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blobPulse, {
          toValue: 1,
          duration: 5200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(blobPulse, {
          toValue: 0,
          duration: 5200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();

  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(carouselSpin, {
        toValue: 1,
        duration: 20000,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    );
    loop.start();
    return () => loop.stop();

  }, [carouselSpin]);

  useEffect(() => {
    Animated.stagger(
      72,
      [
        Animated.timing(headerEnter, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.parallel([
          Animated.timing(searchEnter, {
            toValue: 1,
            duration: 400,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(listEnter, {
          toValue: 1,
          duration: 440,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(footerEnter, {
          toValue: 1,
          duration: 380,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ],
    ).start();

  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [saved, pickerDone] = await Promise.all([
        safeGetItem(LANGUAGE_STORAGE_KEY),
        safeGetItem(LANG_PICKER_DONE_KEY),
      ]);
      if (cancelled) return;
      if (userPickedLanguageRef.current) return;

      const applySaved = async (raw) => {
        if (!raw || typeof raw !== 'string') return false;
        const baseLang = String(raw).split(/[-_]/)[0].toLowerCase();
        const allowed = new Set(LANGUAGES.map((l) => l.id));
        const migrated =
          baseLang === 'ru' ? 'uk' : !allowed.has(baseLang) ? 'en' : raw;
        if (migrated !== raw) await safeSetItem(LANGUAGE_STORAGE_KEY, migrated);
        if (LANGUAGES.some((l) => l.id === migrated)) {
          setLanguage(migrated);
          return true;
        }
        await safeSetItem(LANGUAGE_STORAGE_KEY, 'en');
        setLanguage('en');
        return true;
      };

      /* Відновлюємо з storage лише після того, як користувач натиснув «Продовжити»
         (LANG_PICKER_DONE_KEY). Інакше старий @kraina_app_language=uk знову підставляв українську. */
      if (pickerDone === '1' && saved && typeof saved === 'string') {
        await applySaved(saved);
        return;
      }
      setLanguage('en');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleContinue = async () => {
    if (!language) return;
    safeSetItem(LANGUAGE_STORAGE_KEY, language);
    safeSetItem(LANG_PICKER_DONE_KEY, '1');
    navigation?.reset?.({
      index: 0,
      routes: [{ name: 'OnboardingIntro', params: { language } }],
    });
  };

  const headerMarginBottom = r.isShortScreen ? 16 : 22;
  const headerMarginTop = r.isShortScreen ? 28 : 36;
  const contentW = Math.min(
    r.width - 2 * r.horizontalPadding,
    r?.isTablet ? (r?.contentMaxWidth ?? 560) : r.width,
  );
  const listCardInnerPad = 12;
  const listInnerW = contentW - listCardInnerPad;
  const langPillMinH = r.isShortScreen
    ? Math.max(46, Math.round(52 * Math.min(r.scale, 1.1)))
    : Math.max(48, Math.round(54 * Math.min(r.scale, 1.1)));

  let langGridCols = r.isTablet ? 2 : 1;
  let langTileW = (listInnerW - LANGUAGE_GRID_GAP * (langGridCols - 1)) / langGridCols;
  const minPillW = 128;
  while (langGridCols > 1 && langTileW < minPillW) {
    langGridCols -= 1;
    langTileW = (listInnerW - LANGUAGE_GRID_GAP * (langGridCols - 1)) / langGridCols;
  }
  const langCount = (filteredLanguages || []).length;
  const buttonMinHeight = Math.max(47, Math.round(47 * r.scale));
  const searchBorderRadius = searchFocusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 8],
  });
  const searchUnderlineScaleX = searchFocusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const searchGlowOpacity = searchFocusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.22, 0.48],
  });
  const sw = r.width;
  const sh = r.height;
  const blobOpacity1 = blobPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.52, 0.92],
  });
  const blobOpacity2 = blobPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.78, 0.42],
  });
  const blobOpacity3 = blobPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.38, 0.68],
  });
  const headerOpacity = headerEnter;
  const headerTranslateY = headerEnter.interpolate({
    inputRange: [0, 1],
    outputRange: [22, 0],
  });
  const searchBlockOpacity = searchEnter;
  const searchBlockTranslateY = searchEnter.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 0],
  });
  const listBlockOpacity = listEnter;
  const listBlockTranslateY = listEnter.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 0],
  });
  const footerBlockOpacity = footerEnter;
  const footerBlockTranslateY = footerEnter.interpolate({
    inputRange: [0, 1],
    outputRange: [22, 0],
  });
  const searchShellGlowOpacity = searchFocusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.18, 0.55],
  });
  const listRotateX = listEnter.interpolate({
    inputRange: [0, 1],
    outputRange: ['7deg', '0deg'],
  });
  const searchLiftY = searchFocusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-6, -9],
  });
  const titleFontSize = Math.max(20, Math.round(r.titleFontSize * 0.84));
  const titleLineHeight = titleFontSize + 5;

  const carouselScale =
    Math.min(r.scale, 1.08) * 0.88 * (r.isShortScreen ? 0.58 : 0.88) * 1.1;

  const carouselCardW = Math.round(108 * carouselScale);
  const carouselCardH = Math.round(152 * carouselScale);

  const carouselRingR = carouselCardW + carouselCardH;
  const [ringRotationRad, setRingRotationRad] = useState(0);
  useEffect(() => {
    const id = carouselSpin.addListener(({ value }) => {
      setRingRotationRad(value * Math.PI * 2);
    });
    return () => {
      carouselSpin.removeListener(id);
    };
  }, [carouselSpin]);

  const carouselRingStageW = carouselRingR * 2 + carouselCardW + 24;
  const carouselRingStageH = Math.max(carouselCardH + carouselRingR * 0.35, carouselRingR * 1.15) + 24;

  const carouselIdealH = Math.max(128, carouselRingStageH);
  const carouselMaxH = Math.round(sh * (r.isShortScreen ? 0.155 : 0.19));
  const carouselWrapperMinH = Math.max(
    r.isShortScreen ? 72 : 84,
    Math.min(carouselIdealH, carouselMaxH),
  );

  /** Ті самі зміщення, що на iPhone — однакова 3D-карусель на Android. */
  const carouselRingNudgeDown = -34;
  const carouselRingTranslateY = -88 + 68 + carouselRingNudgeDown;

  const listPanelMarginTop = r.isShortScreen ? 2 : 6;
  const listPanelMaxH = Math.round(sh * (r.isShortScreen ? 0.34 : 0.36));

  const bottomClusterLift = r.isShortScreen ? -22 : -28;

  const continueBeforeRingGap = r.isShortScreen ? 12 : 16;
  const scrollbarThumbH = useMemo(() => {
    const trackH = languageScrollbarTrackH;
    const vh = languageListScrollViewportH.current;
    const ch = languageListScrollContentH.current;
    if (!trackH || !vh || !ch || ch <= vh) return 0;
    return Math.max(28, (vh / ch) * trackH);
  }, [languageScrollbarTrackH, languageScrollbarTick]);
  const scrollbarThumbTop = useMemo(() => {
    const trackH = languageScrollbarTrackH;
    const vh = languageListScrollViewportH.current;
    const ch = languageListScrollContentH.current;
    const y = languageListScrollY.current;
    const maxY = Math.max(0, ch - vh);
    if (!trackH || !vh || !ch || maxY <= 0) return 0;
    const travel = Math.max(0, trackH - scrollbarThumbH);
    return (y / maxY) * travel;
  }, [languageScrollbarTrackH, scrollbarThumbH, languageScrollbarTick]);
  return (
    <View style={styles.container}>
      <View style={styles.bgDecor} pointerEvents="none">
        <View
          style={[styles.atmosphereBottom, { height: sh * 0.38 }]}
          pointerEvents="none"
        />
        <Animated.View
          style={[
            styles.bgBlob,
            {
              width: sw * 1.15,
              height: sw * 0.52,
              borderRadius: sw * 0.35,
              top: -sw * 0.12,
              left: -sw * 0.28,
              backgroundColor: 'rgba(225, 255, 0, 0.048)',
              opacity: blobOpacity1,
            },
          ]}
        />
        <Animated.View
          style={[
            styles.bgBlob,
            {
              width: sw * 0.42,
              height: sw * 0.42,
              borderRadius: sw * 0.21,
              top: sh * 0.14,
              right: -sw * 0.1,
              backgroundColor: 'rgba(225, 255, 0, 0.03)',
              opacity: blobOpacity2,
            },
          ]}
        />
        <Animated.View
          style={[
            styles.bgBlob,
            {
              width: sw * 1.05,
              height: sw * 0.48,
              borderRadius: sw * 0.32,
              bottom: -sw * 0.18,
              left: sw * 0.08,
              backgroundColor: 'rgba(40, 44, 28, 0.34)',
              opacity: blobOpacity3,
            },
          ]}
        />
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(245, 255, 140, 0.055)', 'rgba(225, 255, 0, 0.018)', 'transparent']}
          locations={[0, 0.42, 1]}
          start={{ x: 0.15, y: 0.1 }}
          end={{ x: 0.92, y: 0.88 }}
          style={[
            styles.langPageLemonSpot,
            {
              width: Math.min(Math.round(sw * 0.34), 140),
              height: Math.min(Math.round(sw * 0.3), 124),
              borderRadius: Math.min(Math.round(sw * 0.17), 70),
              top: Math.round(sh * 0.1),
              right: -Math.round(sw * 0.04),
            },
          ]}
        />
      </View>
      <Pressable
        style={[
          styles.contentLayer,
          {
            paddingTop: r.topPadding,
            paddingBottom: r.bottomPadding,
            paddingHorizontal: r.horizontalPadding,
          },
        ]}
        onPress={Keyboard.dismiss}
      >
      <Animated.View
        style={[
          { marginTop: headerMarginTop, marginBottom: headerMarginBottom },
          {
            opacity: headerOpacity,
            transform: [{ translateY: headerTranslateY }],
          },
        ]}
      >
        <View style={styles.header}>
          <View
            style={[
              styles.titleBlock,
              {
                width: r.titleBlockWidth,
                paddingVertical: 4,
              },
            ]}
          >
            <Text
              style={[
                styles.title,
                {
                  fontSize: titleFontSize,
                  lineHeight: titleLineHeight,
                  letterSpacing: 0.2,
                },
              ]}
            >
              {texts?.chooseLanguage ?? 'Choose language'}
            </Text>
          </View>
        </View>
      </Animated.View>

      <Animated.View
        style={[
          styles.searchShell,
          {
            opacity: searchBlockOpacity,
            transform: [{ translateY: searchBlockTranslateY }],
          },
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.searchShellGlow,
            {
              opacity: searchShellGlowOpacity,
            },
          ]}
        />
        <View style={styles.search3dBack} pointerEvents="none" />
        <View style={styles.search3dMid} pointerEvents="none" />
        <Animated.View
          style={[
            styles.search3dFrontWrap,
            { transform: [{ translateY: searchLiftY }] },
          ]}
        >
          <Animated.View
            style={[
              styles.searchGroup,
              {
                borderRadius: searchBorderRadius,
                shadowOpacity: searchGlowOpacity,
              },
            ]}
          >
            <View style={styles.searchFaceHighlight} pointerEvents="none" />
            <Ionicons name="search" size={18} color="#1a1a1a" style={styles.searchIcon} pointerEvents="none" />
            <TextInput
              ref={searchInputRef}
              value={searchQuery}
              onChangeText={handleSearchChange}
              onChange={(e) => handleSearchChange(e?.nativeEvent?.text)}
              placeholder={texts?.searchLanguage ?? 'Search language'}
              placeholderTextColor="#7a7a7a"
              style={[
                styles.searchInput,
                {
                  fontSize: Math.max(15, r.optionFontSize),
                  fontFamily: KFONT.medium,
                  fontWeight: '400',
                  ...fontPad,
                },
              ]}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
              keyboardAppearance="dark"
              selectionColor="#E1FF00"
              editable={true}
              showSoftInputOnFocus={true}
              underlineColorAndroid="transparent"
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
            />
            {searchQuery ? (
              <Pressable
                onPress={() => setSearchQuery('')}
                style={styles.searchClearBtn}
                accessibilityRole="button"
                accessibilityLabel={language === 'uk' ? 'Очистити пошук' : 'Clear search'}
                hitSlop={6}
              >
                <Ionicons name="close-circle" size={18} color="#111111" />
              </Pressable>
            ) : null}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.searchUnderline,
                {
                  transform: [{ scaleX: searchUnderlineScaleX }],
                },
              ]}
            />
          </Animated.View>
        </Animated.View>
      </Animated.View>
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.scrollWrapper,
          {
            marginTop: listPanelMarginTop,
            opacity: listBlockOpacity,
            transform: [
              { perspective: 1100 },
              { rotateX: listRotateX },
              { translateY: listBlockTranslateY },
            ],
          },
        ]}
      >
        <View
          style={[
            styles.scrollContainer,
            { height: listPanelMaxH, maxHeight: listPanelMaxH },
            r?.isTablet && { maxWidth: (r?.contentMaxWidth ?? 560) },
          ]}
        >
          <View style={styles.listStage}>
            <View style={styles.listCardShell}>
              <View style={styles.listCardShadow} pointerEvents="none" />
              <View style={styles.listCard}>
                <View style={styles.listCardTopFrost} pointerEvents="none" />
                <View style={styles.listCardGlow} pointerEvents="none" />
                <View style={styles.langScrollFill}>
                  <ScrollView
                    ref={languageListScrollRef}
                    style={styles.scroll}
                    contentContainerStyle={[
                      styles.langGridScrollContent,
                      {
                        paddingBottom: LANG_LIST_BOTTOM_INSET,
                        paddingLeft: 14,
                        paddingRight: 14,
                      },
                    ]}
                    onLayout={(e) => {
                      languageListScrollViewportH.current = e.nativeEvent.layout.height;
                      syncLanguageListScrollable();
                    }}
                    onContentSizeChange={(_w, h) => {
                      languageListScrollContentH.current = h;
                      syncLanguageListScrollable();
                    }}
                    onScroll={handleLanguageListScroll}
                    scrollEventThrottle={16}
                    showsVerticalScrollIndicator={true}
                    persistentScrollbar={Platform.OS === 'android'}
                    indicatorStyle="white"
                    scrollIndicatorInsets={{ top: 2, bottom: 2, right: 1 }}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    decelerationRate="fast"
                    bounces={false}
                    overScrollMode="never"
                    removeClippedSubviews={Platform.OS === 'android' ? false : undefined}
                  >
                  {(filteredLanguages || []).map((opt) => {
                    const selected = language === opt.id;
                    return (
                      <View key={opt.id} style={[styles.langPillCell, { width: langTileW }]}>
                        <GlowingLanguageButton
                          flag={opt.flag ?? ''}
                          flagFontSize={Math.max(19, 21 * r.scale)}
                          labelNode={renderHighlightedLabel(
                            opt.label ?? '',
                            searchQuery,
                            selected,
                            undefined,
                            undefined,
                            'glow',
                          )}
                          minHeight={langPillMinH}
                          selected={selected}
                          onPress={() => {
                            userPickedLanguageRef.current = true;
                            setLanguage(opt.id);
                          }}
                          accessibilityLabel={opt.label}
                          style={{ width: '100%' }}
                        />
                      </View>
                    );
                  })}
                  {!filteredLanguages.length ? (
                    <Text style={[styles.emptySearchText, { width: '100%' }]}>
                      {language === 'uk' ? 'Мову не знайдено' : 'No language found'}
                    </Text>
                  ) : null}
                  </ScrollView>
                  {languageListNeedsScroll ? (
                    <View
                      style={styles.languageScrollbarTrack}
                      onLayout={(e) => setLanguageScrollbarTrackH(e.nativeEvent.layout.height)}
                      // Do not steal every tap from nearby controls on Android.
                      onStartShouldSetResponder={() => false}
                      onMoveShouldSetResponder={(_, e) => Math.abs(e?.dy || 0) > 2}
                      onResponderGrant={(e) => {
                        const usable = Math.max(1, languageScrollbarTrackH - scrollbarThumbH);
                        const nextTop = Math.max(
                          0,
                          Math.min(usable, e.nativeEvent.locationY - scrollbarThumbH / 2),
                        );
                        scrollLanguageListToRatio(nextTop / usable);
                      }}
                      onResponderMove={(e) => {
                        const usable = Math.max(1, languageScrollbarTrackH - scrollbarThumbH);
                        const nextTop = Math.max(
                          0,
                          Math.min(usable, e.nativeEvent.locationY - scrollbarThumbH / 2),
                        );
                        scrollLanguageListToRatio(nextTop / usable);
                      }}
                    >
                      <View
                        pointerEvents="none"
                        style={[
                          styles.languageScrollbarThumb,
                          {
                            height: scrollbarThumbH || 28,
                            transform: [{ translateY: scrollbarThumbTop }],
                          },
                        ]}
                      />
                    </View>
                  ) : null}
                </View>
                
              </View>
            </View>
          </View>
        </View>
      </Animated.View>

      <View style={styles.carouselSpacer} />
      <View style={[styles.bottomCluster, { marginTop: bottomClusterLift }]}>
        <Animated.View
          style={[
            styles.continueFooter,
            styles.continueFooterAboveRing,
            { marginBottom: continueBeforeRingGap },
            {
              opacity: footerBlockOpacity,
              transform: [{ translateY: footerBlockTranslateY }],
            },
          ]}
        >
          <Lemon3DButton
            label={texts?.continue ?? 'Continue'}
            onPress={handleContinue}
            disabled={!language}
            minHeight={Math.max(buttonMinHeight, 52)}
            textStyle={{
              fontSize: Math.max(16, r.buttonFontSize),
              letterSpacing: 0.75,
              fontWeight: '700',
            }}
            accessibilityLabel={texts?.continue ?? 'Continue'}
          />
        </Animated.View>

        <View style={styles.bottomCarouselOnly}>
          <View
            style={[styles.carouselWrapper, { minHeight: carouselWrapperMinH }]}
            pointerEvents="none"
            accessibilityElementsHidden
            {...(Platform.OS === 'android' ? { importantForAccessibility: 'no-hide-descendants' } : {})}
          >
            <View style={styles.carouselInnerAnchor}>
              <View
                collapsable={false}
                style={[
                  styles.carouselRingStage,
                  {
                    width: carouselRingStageW,
                    height: carouselRingStageH,
                    transform: [
                      { perspective: 900 },
                      { rotateX: '-14deg' },
                      { translateY: carouselRingTranslateY },
                    ],
                  },
                ]}
              >
                <CarouselCylinderFaces
                  carouselCardW={carouselCardW}
                  carouselCardH={carouselCardH}
                  ringRadius={carouselRingR}
                  rotationRad={ringRotationRad}
                />
              </View>
            </View>
          </View>
        </View>
      </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  bgDecor: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  atmosphereBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
  },
  bgBlob: {
    position: 'absolute',
  },
  langPageLemonSpot: {
    position: 'absolute',
    overflow: 'hidden',
  },
  contentLayer: {
    flex: 1,
    zIndex: 1,
  },
  header: {
    alignItems: 'center',
    flexShrink: 0,
  },
  titleBlock: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: 335,
    alignSelf: 'center',
    gap: 0,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  title: {
    ...brandFontHeadBold,
    fontWeight: '400',
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: 0.2,
    color: '#FFFFFF',
    textAlign: 'center',
    width: '100%',
    backgroundColor: 'transparent',
    ...fontPad,
  },

  scrollPeekOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SCROLL_PEEK_FADE_H + SCROLL_PEEK_BUTTON_H + SCROLL_PEEK_CLIP,
    justifyContent: 'flex-end',
    alignItems: 'center',
    zIndex: 40,
    elevation: 24,
  },
  scrollPeekPeekColumn: {
    width: '100%',
    alignItems: 'center',
  },
  scrollPeekFadeStack: {
    width: '100%',
    height: SCROLL_PEEK_FADE_H,
    overflow: 'hidden',
  },
  scrollPeekFadeStep: {
    width: '100%',
    height: SCROLL_PEEK_FADE_H / 5,
  },
  scrollPeekPressable: {
    height: SCROLL_PEEK_BUTTON_H,
    width: SCROLL_PEEK_BUTTON_H,
    minWidth: SCROLL_PEEK_BUTTON_H,
    paddingHorizontal: 0,
    borderRadius: SCROLL_PEEK_BUTTON_H / 2,
    position: 'relative',
    zIndex: 41,
    backgroundColor: 'rgba(9, 10, 14, 0.98)',
    borderWidth: 1.25,
    borderColor: 'rgba(225, 255, 0, 0.62)',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#E1FF00',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.22,
        shadowRadius: 8,
      },
      android: { elevation: 5 },
    }),
  },
  scrollPeekButtonInner: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollWrapper: {
    flexGrow: 0,
    flexShrink: 0,
    justifyContent: 'flex-start',
    alignItems: 'center',
    alignSelf: 'stretch',
    width: '100%',

    zIndex: 3,
    elevation: 10,
    position: 'relative',
  },
  searchShell: {
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
    marginBottom: 14,
    borderRadius: 22,
    padding: 2,
    backgroundColor: 'rgba(225, 255, 0, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(225, 255, 0, 0.22)',
    position: 'relative',
    overflow: 'visible',
  },
  searchShellGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(225, 255, 0, 0.55)',
    margin: -1,
  },
  search3dBack: {
    position: 'absolute',
    left: 6,
    right: 6,
    top: 12,
    height: 44,
    backgroundColor: '#2e3400',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1a1d00',
    zIndex: 0,
  },
  search3dMid: {
    position: 'absolute',
    left: 4,
    right: 4,
    top: 9,
    height: 46,
    backgroundColor: '#4a5500',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#323800',
    zIndex: 1,
  },
  search3dFrontWrap: {
    position: 'relative',
    zIndex: 2,
    width: '100%',
  },
  searchFaceHighlight: {
    position: 'absolute',
    left: 1,
    right: 1,
    top: 1,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    zIndex: 4,
  },
  searchGroup: {
    width: '100%',
    alignSelf: 'center',
    marginBottom: 0,
    position: 'relative',
    minHeight: 46,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(225,255,0,0.85)',
    backgroundColor: '#FAFAFA',
    shadowColor: '#E1FF00',
    shadowOpacity: 0.42,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
    overflow: 'hidden',
    zIndex: 20,
  },
  searchUnderline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -1,
    height: 1.5,
    backgroundColor: '#E1FF00',
    borderRadius: 1,
  },
  searchIcon: {
    position: 'absolute',
    left: 13,
    top: 14,
    zIndex: 2,
  },
  searchInput: {
    height: 46,
    width: '100%',
    color: '#141414',
    paddingLeft: 40,
    paddingRight: 40,
    paddingVertical: 0,
    letterSpacing: 0.15,
  },
  searchClearBtn: {
    position: 'absolute',
    right: 10,
    top: 13,
    zIndex: 2,
  },
  scrollContainer: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
  },
  listStage: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    alignSelf: 'center',
    marginBottom: 4,
    position: 'relative',
    paddingBottom: 0,
  },
  listCardShell: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    borderRadius: 14,
    padding: 1,
    backgroundColor: 'rgba(225, 255, 0, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(225, 255, 0, 0.2)',
    position: 'relative',
    zIndex: 1,
    overflow: 'visible',
  },
  listCardShadow: {
    position: 'absolute',
    left: 6,
    right: -4,
    top: 8,
    bottom: -8,
    backgroundColor: '#050604',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#000000',
    zIndex: 0,
  },
  listCard: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
    width: '100%',
    borderRadius: 14,
    zIndex: 2,
    borderWidth: 1,
    borderColor: 'rgba(225, 255, 0, 0.38)',
    backgroundColor: LIST_CARD_INNER_BG,
    paddingTop: 5,
    paddingBottom: 5,
    paddingHorizontal: 8,
    overflow: 'hidden',
    shadowColor: '#E1FF00',
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  listCardTopFrost: {
    position: 'absolute',
    top: 0,
    left: 12,
    right: 12,
    height: 1,
    borderRadius: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    zIndex: 15,
  },
  listCardGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(225, 255, 0, 0.1)',
  },
  langScrollFill: {
    flex: 1,
    minHeight: 0,
    width: '100%',
  },
  languageScrollbarTrack: {
    position: 'absolute',
    top: 6,
    right: 2,
    bottom: 6,
    width: 10,
    borderRadius: 999,
    backgroundColor: 'transparent',
    borderWidth: 0,
    zIndex: 25,
  },
  languageScrollbarThumb: {
    position: 'absolute',
    left: 1,
    right: 1,
    top: 0,
    borderRadius: 999,
    backgroundColor: 'rgba(225,255,0,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(12,12,12,0.35)',
  },
  scroll: {
    flex: 1,
    width: '100%',
    backgroundColor: 'transparent',
  },
  langGridScrollContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: LANGUAGE_GRID_GAP,
    paddingTop: 0,
    justifyContent: 'center',
  },
  langPillCell: {
    marginBottom: 0,
  },
  langPillOptionText: {
    fontFamily: KFONT.semibold,
    fontWeight: '400',
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: 0.2,
    color: '#0d0d0d',
    ...fontPad,
  },
  langPillOptionTextSelected: {
    fontFamily: KFONT.medium,
    fontWeight: '400',
    color: '#050505',
    ...fontPad,
  },
  langPillSearchHighlight: {
    color: '#1a3800',
    fontWeight: '800',
  },
  langGlowPillOptionText: {
    fontFamily: KFONT.semibold,
    fontWeight: '400',
    fontSize: 13,
    lineHeight: 17,
    letterSpacing: 0.22,
    color: '#f0f1f6',
    ...fontPad,
  },
  langGlowPillOptionTextSelected: {
    fontFamily: KFONT.medium,
    fontWeight: '400',
    color: '#E1FF00',
    textShadowColor: 'rgba(225, 255, 0, 0.45)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
    ...fontPad,
  },
  langGlowPillSearchHighlight: {
    color: '#bef264',
    fontWeight: '800',
  },

  bottomCluster: {
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'center',
  },

  continueFooterAboveRing: {
    marginTop: 52,
  },
  continueFooter: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    marginTop: 4,
    marginBottom: 0,
    paddingTop: 0,
    paddingBottom: 0,
    flexShrink: 0,
    zIndex: 4,
    elevation: 11,
    position: 'relative',
  },

  carouselSpacer: {
    flex: 1,
    minHeight: 0,
    width: '100%',
  },
  bottomCarouselOnly: {
    width: '100%',
    flexShrink: 0,
    zIndex: 0,
    elevation: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 0,
  },

  carouselWrapper: {
    flexShrink: 0,
    width: '100%',
    position: 'relative',
    overflow: 'visible',
    marginTop: 0,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 0,
    paddingTop: 0,
  },
  carouselInnerAnchor: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: '100%',
  },
  carouselRingStage: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  carouselRingFaceOuter: {
    position: 'absolute',
    left: '50%',
    top: '50%',
  },
  carouselCard: {
    borderWidth: 2,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a1c22',
  },
  carouselImg: {
    width: '100%',
    height: '100%',
  },

  carouselImgBrighten: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: 'transparent',
  },
  optionText: {
    fontFamily: KFONT.regular,
    fontWeight: '400',
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: 0.15,
    color: '#F4F4F5',
    opacity: 1,
    backgroundColor: 'transparent',
    ...fontPad,
  },
  optionTextWrap: {
    flex: 1,
  },
  optionTextSelected: {
    fontFamily: KFONT.medium,
    fontWeight: '400',
    color: '#FFFFFF',
    opacity: 1,
    backgroundColor: 'transparent',
    ...fontPad,
  },
  optionTextHighlight: {
    color: '#E1FF00',
    fontWeight: '700',
  },
  emptySearchText: {
    fontFamily: KFONT.regular,
    fontWeight: '400',
    fontSize: 15,
    letterSpacing: 0.15,
    color: '#B0B0B5',
    textAlign: 'center',
    paddingVertical: 16,
    ...fontPad,
  },
  continueButton: {
    borderRadius: 8,
    overflow: 'hidden',
    minHeight: 47,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E1FF00',
  },
  continueButtonDisabled: {
    backgroundColor: 'rgba(225, 255, 0, 0.25)',
  },
  continueButtonPressed: {
    backgroundColor: '#C4D800',
  },
  continueText: {
    fontFamily: KFONT.medium,
    fontWeight: '400',
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 0,
    textAlign: 'center',
    color: '#1E1E1E',
    opacity: 1,
    backgroundColor: 'transparent',
    ...fontPad,
  },
});


function CarouselCylinderFaces({ carouselCardW, carouselCardH, ringRadius, rotationRad }) {
  const R = ringRadius;
  const hw = carouselCardW / 2;
  const hh = carouselCardH / 2;

  const faces = Array.from({ length: CAROUSEL_QUANTITY }, (_, i) => {
    const θ = (2 * Math.PI * i) / CAROUSEL_QUANTITY + rotationRad;
    const depth = Math.cos(θ);
    const x = R * Math.sin(θ);
    const scale = 0.38 + 0.62 * Math.max(0, depth);
    const opacity = 1;
    const zIndex = Math.round(50 + 50 * depth);
    return { i, θ, depth, x, scale, opacity, zIndex };
  });

  faces.sort((a, b) => a.depth - b.depth);

  return faces.map(({ i, x, scale, opacity, zIndex }) => {
    const src = CAROUSEL_FACE_SOURCES[i];
    const [cr, cg, cb] = CAROUSEL_FACE_RGB[i] ?? [225, 255, 0];
    return (
      <View
        key={`carousel-${i}`}
        collapsable={false}
        style={[
          styles.carouselRingFaceOuter,
          {
            width: carouselCardW,
            height: carouselCardH,
            marginLeft: -hw,
            marginTop: -hh,
            zIndex,
            opacity,
            ...(Platform.OS === 'android' ? { elevation: Math.max(0, zIndex) } : {}),
            transform: [{ translateX: x }, { scale }],
          },
        ]}
      >
        <View
          style={[
            styles.carouselCard,
            {
              width: carouselCardW,
              height: carouselCardH,
              borderColor: `rgba(${cr}, ${cg}, ${cb}, 0.95)`,
            },
          ]}
        >
          <Image
            source={src}
            style={styles.carouselImg}
            resizeMode="cover"
            {...(Platform.OS === 'android' ? { resizeMethod: 'scale' } : {})}
            accessibilityIgnoresInvertColors
          />
          <View
            style={[
              styles.carouselImgBrighten,
              { borderColor: `rgba(${cr}, ${cg}, ${cb}, 0.55)` },
            ]}
            pointerEvents="none"
          />
        </View>
      </View>
    );
  });
}

