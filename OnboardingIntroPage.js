import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  Image,
  Animated,
  Easing,
  Platform,
  InteractionManager,
  PanResponder,
  Dimensions,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
// import { Video, ResizeMode } from 'expo-av'; // Temporarily disabled
import { useResponsive } from './useResponsive';
import { rippleOnDarkSurface } from './androidFeedback';
import LemonBannerGlow from './components/ui/LemonBannerGlow';
import { setOnboardingSlidesSeenFlag } from './onboardingStorage';
import { PREVIEW_SELECT_COUNTRY_BEFORE_REGISTRATION } from './flowFlags';
import { useAppLanguage } from './useAppLanguage';

const ACCENT = '#E1FF00';
const BODY = '#FAFAF6';
const DOT_INACTIVE = 'rgba(242, 242, 234, 0.35)';
/** Фон слайду «маршрути» (корінь + bgSolid). */
const ROUTE_SLIDE_BG = '#000000';

const TOTAL_STEPS = 6;

/** Лаймове світіння для кроків 1…4 (крок 0 — окремо; фінальний — без лайму). */
const ONBOARD_LEMON_GLOWS = [
  {
    colors: ['rgba(235, 255, 90, 0.26)', 'rgba(225, 255, 0, 0.085)', 'rgba(0, 0, 0, 0)'],
    locations: [0, 0.26, 0.55],
    start: { x: 0.5, y: 0 },
    end: { x: 0.5, y: 0.72 },
  },
  {
    colors: ['rgba(225, 255, 0, 0.17)', 'rgba(225, 255, 0, 0.055)', 'rgba(0, 0, 0, 0)'],
    locations: [0, 0.18, 0.45],
    start: { x: 0, y: 0.5 },
    end: { x: 1, y: 0.5 },
  },
  {
    colors: ['rgba(0, 0, 0, 0)', 'rgba(218, 255, 50, 0.12)', 'rgba(225, 255, 0, 0.22)'],
    locations: [0, 0.52, 1],
    start: { x: 0.9, y: 1 },
    end: { x: 0.1, y: 0.15 },
  },
  {
    colors: ['rgba(225, 255, 0, 0.21)', 'rgba(225, 255, 0, 0.06)', 'rgba(0, 0, 0, 0)'],
    locations: [0, 0.2, 0.48],
    start: { x: 0, y: 0 },
    end: { x: 0.72, y: 0.62 },
  },
  {
    colors: ['rgba(0, 0, 0, 0)', 'rgba(232, 255, 80, 0.1)', 'rgba(225, 255, 0, 0.18)'],
    locations: [0, 0.42, 1],
    start: { x: 1, y: 0.3 },
    end: { x: 0.32, y: 0.7 },
  },
];

/** Фон слайду «Шукай цікаві пам’ятки» */
const LANDMARKS_SEARCH_BG = require('./assets/Снимок экрана 2026-04-05 в 15.59.46.png');

/** Горизонтальна смуга переходу фото → тінь (Rectangle 37). */
const RECTANGLE_37 = require('./assets/Rectangle 37.png');

/**
 * Слайд «Скануй пам’ятку»: Frame 23 — верхні жовті кутники в PNG; нижні два — ScanHeroLemonCorners
 * поверх фото й тіні (той самий #E1FF00, 1.5).
 */
const SCAN_SLIDE_HERO = require('./assets/Frame 23.png');

/** Фото слайду «Шукай маршрути» (нічна карта / маршрут). */
const ROUTE_FIND_ILLUSTRATION = require('./assets/Снимок экрана 2026-04-05 в 15.52.15.png');
/** Ілюстрація слайду «Ділись своєю історією». */
const SHARE_ROUTES_ILLUSTRATION = require('./assets/Снимок экрана 2026-04-05 в 15.55.36.png');
/** Фото слайду «Спілкуйся з друзями». */
const FRIENDS_SLIDE_HERO = require('./assets/kling_20260405_IMAGE____________5495_1.png');
/** Останній крок онбордингу: колаж міст (PL / IT / UA). */
const FINAL_ONBOARD_BRAND_HERO = require('./assets/Group 65.png');
/**
 * Анімація «Zoom» перед слоганом (останній слайд).
 * Звичайний H.264 MP4 не має альфи — чорний усередині кадру лишиться, доки не замінити на ролик із прозорістю (напр. ProRes 4444 / WebM VP9 alpha).
 */
const FINAL_TAGLINE_ZOOM_VIDEO = require('./assets/Zoom Glass - Copy - Copy-Zoom 2-@720x-3.mp4');

const SLIDES_UK = [
  {
    title: 'Шукай цікаві пам’ятки',
    body:
      'В місті якому ти зараз знаходишся є багато історичних пам’яток, які можуть тебе зацікавити своєю історією',
  },
  {
    title: 'Скануй пам’ятку',
    body:
      'Читай або прослухай цікаву історію, яку ти не дізнаєшся на екскурсіях.\n\nНаведи камеру на об’єкт та очікуй підвантаження історії.',
  },
  {
    title: 'Шукай маршрути',
    body:
      'Ми підберемо релевантні маршрути, за твоїми параметрами.\n\nМи прокладемо маршрут до потрібної точки, і ти зможеш переглянути історію, це як квест.',
  },
  {
    title: 'Ділись своєю історією',
    body: 'Допомагай іншим користувачам знаходити цікаві місця та історію. Публікуй пости та сторіс з маршрутом.',
  },
  {
    title: 'Спілкуйся з друзями',
    body:
      'Знаходь цікаві маршрути, поділись з друзями та вирушайте на прогулянку разом.\n\nСтворіть свою екскурсію з друзями)',
  },
  {
    title: 'KRAЇNA',
    body: '— Історія там де ти зараз',
  },
];

const SLIDES_EN = [
  {
    title: 'Find interesting landmarks',
    body:
      'In the city where you are now, there are many historic monuments that might interest you with their stories.',
  },
  {
    title: 'Scan a landmark',
    body:
      'Read or listen to an interesting story you would not learn on guided tours.\n\nPoint the camera at the object and wait for the story to load.',
  },
  {
    title: 'Find routes',
    body:
      'We will suggest relevant routes based on your preferences.\n\nWe will build a route to the point you need, and you can explore the history, it is like a quest.',
  },
  {
    title: 'Share your story',
    body: 'Help other users discover interesting places and history. Publish posts and stories with a route.',
  },
  {
    title: 'Chat with friends',
    body:
      'Find interesting routes, share with friends, and go for a walk together.\n\nCreate your own excursion with friends)',
  },
  {
    title: 'KRAЇNA',
    body: '— History is where you are now',
  },
];

const SLIDES_PL = [
  {
    title: 'Szukaj ciekawych zabytków',
    body:
      'W mieście, w którym jesteś, jest wiele zabytków, które mogą Cię zainteresować swoją historią.',
  },
  {
    title: 'Skanuj zabytek',
    body:
      'Czytaj lub słuchaj ciekawej historii, której nie poznasz na wycieczkach.\n\nSkieruj aparat na obiekt i poczekaj na wczytanie historii.',
  },
  {
    title: 'Szukaj tras',
    body:
      'Dobierzemy dla Ciebie trafne trasy według Twoich ustawień.\n\nWyznaczymy trasę do wybranego miejsca, a Ty obejrzysz historię, jak w grze fabularnej.',
  },
  {
    title: 'Dziel się swoją historią',
    body: 'Pomagaj innym użytkownikom odkrywać ciekawe miejsca i historię. Publikuj posty i relacje z trasą.',
  },
  {
    title: 'Rozmawiaj ze znajomymi',
    body:
      'Znajdź ciekawe trasy, dziel się ze znajomymi i wybierzcie się na spacer razem.\n\nStwórzcie własną wycieczkę ze znajomymi)',
  },
  {
    title: 'KRAЇNA',
    body: '— Historia jest tam, gdzie jesteś',
  },
];

const SLIDES_DE = [
  {
    title: 'Entdecke spannende Sehenswürdigkeiten',
    body:
      'In der Stadt, in der du dich gerade befindest, gibt es viele historische Sehenswürdigkeiten, die dich mit ihrer Geschichte fesseln können.',
  },
  {
    title: 'Sehenswürdigkeit scannen',
    body:
      'Lies oder höre eine spannende Geschichte, die du auf Führungen nicht erfährst.\n\nRichte die Kamera auf das Objekt und warte, bis die Geschichte geladen ist.',
  },
  {
    title: 'Routen finden',
    body:
      'Wir schlagen dir passende Routen nach deinen Einstellungen vor.\n\nWir planen die Route bis zu deinem Ziel, und du kannst die Geschichte entdecken, wie bei einer Schnitzeljagd.',
  },
  {
    title: 'Teile deine Geschichte',
    body: 'Hilf anderen Nutzern, spannende Orte und Geschichten zu finden. Veröffentliche Beiträge und Stories mit einer Route.',
  },
  {
    title: 'Unterhalte dich mit Freunden',
    body:
      'Finde spannende Routen, teile sie mit Freunden und geht gemeinsam spazieren.\n\nGestalte eure eigene Tour mit Freunden)',
  },
  {
    title: 'KRAЇNA',
    body: '— Geschichte ist dort, wo du gerade bist',
  },
];

const SLIDES_ES = [
  {
    title: 'Busca monumentos interesantes',
    body:
      'En la ciudad en la que te encuentras hay muchos monumentos históricos que pueden interesarte por su historia.',
  },
  {
    title: 'Escanea un monumento',
    body:
      'Lee u oye una historia interesante que no te contarán en las visitas guiadas.\n\nApunta la cámara al objeto y espera a que se cargue la historia.',
  },
  {
    title: 'Buscar rutas',
    body:
      'Te propondremos rutas relevantes según tus preferencias.\n\nTrazaremos la ruta hasta el punto que necesites y podrás explorar la historia, como una búsqueda del tesoro.',
  },
  {
    title: 'Comparte tu historia',
    body: 'Ayuda a otros usuarios a descubrir lugares e historias interesantes. Publica posts e historias con una ruta.',
  },
  {
    title: 'Habla con tus amigos',
    body:
      'Encuentra rutas interesantes, compártelas con amigos y salid a pasear juntos.\n\nCread vuestra propia excursión entre amigos)',
  },
  {
    title: 'KRAЇNA',
    body: '— La historia está donde estás ahora',
  },
];

const SLIDES_LT = [
  {
    title: 'Ieškok įdomių lankytinų vietų',
    body:
      'Mieste, kuriame dabar esi, daug istorinių paminklų, kurie gali sudominti savo istorijomis.',
  },
  {
    title: 'Skenuok paminklą',
    body:
      'Skaityk ar klausyk įdomios istorijos, kurios neišgirsi ekskursijose.\n\nNukreipk kamerą į objektą ir palauk, kol istorija įsikels.',
  },
  {
    title: 'Ieškok maršrutų',
    body:
      'Pasiūlysime tinkamus maršrutus pagal tavo nustatymus.\n\nSudarysime maršrutą iki taško, o istoriją peržiūrėsi, kaip žaidime.',
  },
  {
    title: 'Dalinkis savo istorija',
    body: 'Padėk kitiems vartotojams atrasti įdomias vietas ir istorijas. Skelbk įrašus ir istorijas su maršrutu.',
  },
  {
    title: 'Bendrauk su draugais',
    body:
      'Rask įdomius maršrutus, dalinkis su draugais ir išeikite pasivaikščioti kartu.\n\nSukurkite savo ekskursiją su draugais)',
  },
  {
    title: 'KRAЇNA',
    body: '— Istorija ten, kur esi dabar',
  },
];

const SLIDES_LV = [
  {
    title: 'Meklē interesantas vietas',
    body:
      'Pilsētā, kurā esi tagad, ir daudz vēsturisku pieminekļu, kas var aizraut ar savu stāstu.',
  },
  {
    title: 'Skenē pieminekli',
    body:
      'Lasi vai klausies interesantu stāstu, ko ekskursijās nedzirdēsi.\n\nVērs kameru uz objektu un gaidi, kamēr ielādējas stāsts.',
  },
  {
    title: 'Meklē maršrutus',
    body:
      'Mēs piedāvāsim atbilstošus maršrutus pēc taviem iestatījumiem.\n\nIzveidosim maršrutu līdz punktam, un vēsturi varēsi izpētīt, kā misijā.',
  },
  {
    title: 'Dalies ar savu stāstu',
    body: 'Palīdzi citiem lietotājiem atrast interesantas vietas un vēsturi. Publicē ierakstus un stāstus ar maršrutu.',
  },
  {
    title: 'Sazinājies ar draugiem',
    body:
      'Atrodi interesantus maršrutus, dalies ar draugiem un dodieties pastaigā kopā.\n\nIzveidojiet savu ekskursiju ar draugiem)',
  },
  {
    title: 'KRAЇNA',
    body: '— Vēsture ir tur, kur tu esi tagad',
  },
];

const SLIDES_NL = [
  {
    title: 'Ontdek interessante bezienswaardigheden',
    body:
      'In de stad waar je nu bent zijn veel historische monumenten die je met hun verhaal kunnen boeien.',
  },
  {
    title: 'Scan een bezienswaardigheid',
    body:
      'Lees of luister naar een interessant verhaal dat je op rondleidingen niet hoort.\n\nRicht de camera op het object en wacht tot het verhaal is geladen.',
  },
  {
    title: 'Routes zoeken',
    body:
      'We stellen relevante routes voor op basis van jouw voorkeuren.\n\nWe leggen de route naar je bestemming, en je kunt de geschiedenis ontdekken, als een speurtocht.',
  },
  {
    title: 'Deel jouw verhaal',
    body: 'Help andere gebruikers interessante plekken en verhalen te vinden. Publiceer posts en stories met een route.',
  },
  {
    title: 'Praat met vrienden',
    body:
      'Vind interessante routes, deel ze met vrienden en ga samen wandelen.\n\nMaak jullie eigen excursie met vrienden)',
  },
  {
    title: 'KRAЇNA',
    body: '— Geschiedenis is waar jij nu bent',
  },
];

const SLIDES_IT = [
  {
    title: 'Scopri luoghi interessanti',
    body:
      'Nella città dove ti trovi ci sono molti monumenti storici che possono incuriosirti con le loro storie.',
  },
  {
    title: 'Scansiona un monumento',
    body:
      'Leggi o ascolta una storia che non sentirai nelle visite guidate.\n\nPunta la fotocamera sull’oggetto e attendi il caricamento della storia.',
  },
  {
    title: 'Cerca percorsi',
    body:
      'Ti proporremo percorsi pertinenti in base alle tue preferenze.\n\nTracciamo il percorso fino al punto che ti serve e potrai esplorare la storia come in una caccia al tesoro.',
  },
  {
    title: 'Condividi la tua storia',
    body:
      'Aiuta altri utenti a scoprire luoghi e storie interessanti. Pubblica post e storie con un percorso.',
  },
  {
    title: 'Parla con gli amici',
    body:
      'Trova percorsi interessanti, condividili con gli amici e uscite a passeggiare insieme.\n\nCreate la vostra escursione tra amici)',
  },
  {
    title: 'KRAЇNA',
    body: '— La storia è dove sei ora',
  },
];

const SLIDES_RO = [
  {
    title: 'Descoperă obiective interesante',
    body:
      'În orașul în care te afli acum sunt multe monumente istorice care pot fi interesante prin poveștile lor.',
  },
  {
    title: 'Scanează un monument',
    body:
      'Citește sau ascultă o poveste pe care nu o vei afla la tururi ghidate.\n\nÎndreaptă camera spre obiect și așteaptă încărcarea poveștii.',
  },
  {
    title: 'Caută trasee',
    body:
      'Îți vom propune trasee potrivite în funcție de preferințe.\n\nTrasăm ruta până la punctul dorit, iar tu poți explora istoria ca într-un misiune.',
  },
  {
    title: 'Împărtășește povestea ta',
    body: 'Ajută alți utilizatori să descopere locuri și istorii interesante. Publică postări și story-uri cu un traseu.',
  },
  {
    title: 'Vorbește cu prietenii',
    body:
      'Găsește trasee interesante, împărtășește-le cu prietenii și mergeți la plimbare împreună.\n\nCreați-vă propriul tur cu prietenii)',
  },
  { title: 'KRAЇNA', body: '— Istoria este acolo unde ești acum' },
];

const SLIDES_HY = [
  {
    title: 'Գտեք հետաքրքիր հուշարձաններ',
    body:
      'Ձեր գտնվելու քաղաքում կան բազմաթիվ պատմական հուշարձաններ, որոնք կարող են ձեզ գրավել իրենց պատմություններով:',
  },
  {
    title: 'Սկանավորեք հուշարձանը',
    body:
      'Կարդացեք կամ լսեք հետաքրքիր պատմություն, որը էքսկուրսիաների ժամանակ չեք իմանա:\n\nՈւղղեք տեսախցիկը օբյեկտին և սպասեք, մինչև պատմությունը բեռնվի:',
  },
  {
    title: 'Գտեք երթուղիներ',
    body:
      'Մենք կառաջարկենք ձեզ համապատասխան երթուղիներ՝ ըստ ձեր նախընտրությունների:\n\nՄենք կկառուցենք երթուղի մինչև ձեր ուզած կետ, իսկ դուք կհետաքրքրվեք պատմությամբ — ինչպես քвестում:',
  },
  {
    title: 'Կիսվեք ձեր պատմությամբ',
    body:
      'Օգնեք այլ օգտատերերին բացահայտել հետաքրքիր վայրեր և պատմություններ: Հրապարակեք գրառումներ և պատմություններ երթուղով:',
  },
  {
    title: 'Չաթ ընկերների հետ',
    body:
      'Գտեք հետաքրքիր երթուղիներ, կիսվեք ընկերների հետ և միասին զբոսնեք:\n\nՍտեղծեք ձեր սեփական էքսկուրսիան ընկերների հետ):',
  },
  {
    title: 'KRAЇNA',
    body: '— Պատմությունը այնտեղ է, որտեղ դուք հիմա եք',
  },
];

const SKIP_LABEL = {
  uk: 'Пропустити',
  en: 'Skip',
  pl: 'Pomiń',
  de: 'Überspringen',
  es: 'Omitir',
  nl: 'Overslaan',
  lt: 'Praleisti',
  lv: 'Izlaist',
  ro: 'Sari peste',
  hy: 'Բաց թողնել',
};

const CONTINUE_LABEL = {
  uk: 'Продовжити',
  en: 'Continue',
  pl: 'Kontynuuj',
  de: 'Weiter',
  es: 'Continuar',
  nl: 'Doorgaan',
  lt: 'Tęsti',
  lv: 'Turpināt',
  ro: 'Continuă',
  it: 'Continua',
  hy: 'Շարունակել',
};

const SLIDES_BY_LANG = {
  uk: SLIDES_UK,
  en: SLIDES_EN,
  pl: SLIDES_PL,
  de: SLIDES_DE,
  es: SLIDES_ES,
  nl: SLIDES_NL,
  lt: SLIDES_LT,
  lv: SLIDES_LV,
  ro: SLIDES_RO,
  it: SLIDES_IT,
  hy: SLIDES_HY,
};

function getSlidesForLanguage(langId) {
  if (!langId || typeof langId !== 'string') return SLIDES_EN;
  const base = String(langId).split('-')[0].toLowerCase();
  if (base === 'ru') return SLIDES_UK;
  return SLIDES_BY_LANG[langId] || SLIDES_BY_LANG[base] || SLIDES_EN;
}

function getSkipLabel(langId) {
  if (!langId || typeof langId !== 'string') return SKIP_LABEL.en;
  const base = String(langId).split('-')[0].toLowerCase();
  if (base === 'ru') return SKIP_LABEL.uk;
  return SKIP_LABEL[base] || SKIP_LABEL.en;
}

function getContinueLabel(langId) {
  if (!langId || typeof langId !== 'string') return CONTINUE_LABEL.en;
  const base = String(langId).split('-')[0].toLowerCase();
  if (base === 'ru') return CONTINUE_LABEL.uk;
  return CONTINUE_LABEL[base] || CONTINUE_LABEL.en;
}

const FADE_OUT_MS = 110;
const FADE_OUT_EASING = Easing.bezier(0.4, 0, 1, 1);

/** Пауза перед першою літерою; інтервал між символами (пробіл трохи швидший). */
const ONBOARD_TITLE_TYPEWRITER_INITIAL_MS = 140;
const ONBOARD_TITLE_TYPEWRITER_CHAR_MS = 34;

/**
 * Заголовок онбордингу: друкується по символах один раз на відвідування кроку;
 * після повного тексту не циклюється; при повторному заході на той самий крок — одразу повний рядок.
 */
function useOnboardingTypewriterTitle(fullTitle, step, lang, disableTypewriter = false) {
  const completedKeysRef = useRef(new Set());
  const [displayed, setDisplayed] = useState(() =>
    disableTypewriter ? (fullTitle ?? '') : '',
  );

  useEffect(() => {
    const title = fullTitle ?? '';
    const key = `${lang}:${step}`;
    if (disableTypewriter) {
      setDisplayed(title);
      return undefined;
    }
    if (completedKeysRef.current.has(key)) {
      setDisplayed(title);
      return undefined;
    }

    const chars = [...title];
    setDisplayed('');

    if (chars.length === 0) {
      completedKeysRef.current.add(key);
      return undefined;
    }

    let cancelled = false;
    let timeoutId;
    let index = 0;

    const tick = () => {
      if (cancelled) return;
      index += 1;
      setDisplayed(chars.slice(0, index).join(''));
      if (index >= chars.length) {
        completedKeysRef.current.add(key);
        return;
      }
      const nextCh = chars[index];
      const pause =
        nextCh === ' ' ||
        nextCh === '\n' ||
        nextCh === '\u00a0' ||
        nextCh === '\u202f'
          ? ONBOARD_TITLE_TYPEWRITER_CHAR_MS * 0.28
          : ONBOARD_TITLE_TYPEWRITER_CHAR_MS;
      timeoutId = setTimeout(tick, pause);
    };

    timeoutId = setTimeout(tick, ONBOARD_TITLE_TYPEWRITER_INITIAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [fullTitle, step, lang, disableTypewriter]);

  return displayed;
}

/** Лимонні L-рамки (#E1FF00, 1.5) по кутах видимого фото (cover-рамка). */
function ScanHeroLemonCorners({
  containFrame,
  screenW,
  imageTranslateY = 0,
  /** Верхні кути трохи нижче (щоб не обрізались кліпом / краєм). */
  topNudgeDownPx = 0,
  /** Усі 4 кути трохи вгору (рамка «камери»). */
  frameNudgeUpPx = 0,
  /** Додатково лише нижні два кути вгору (вужча «коробка» знизу). */
  bottomCornersExtraUpPx = 0,
  /** Додатково лише верхні два кути вниз. */
  topCornersExtraDownPx = 0,
  showTopCorners = true,
  showBottomCorners = true,
}) {
  const stroke = 1.5;
  const { ox, oy, dispW, dispH } = containFrame;
  const t = imageTranslateY;
  const topPad = topNudgeDownPx;
  const cornerLiftUpPx = 14;
  const up = frameNudgeUpPx;
  const bottomUp = bottomCornersExtraUpPx;
  const topDown = topCornersExtraDownPx;
  let size = Math.min(50, Math.round(screenW * 0.125));
  const pad = 12;
  size = Math.min(size, dispW - 2 * pad, dispH - 2 * pad);
  size = Math.max(24, Math.floor(size));
  const base = {
    position: 'absolute',
    width: size,
    height: size,
    borderColor: ACCENT,
  };
  return (
    <>
      {showTopCorners ? (
        <>
          <View
            pointerEvents="none"
            style={[
              base,
              {
                left: ox + pad,
                top: oy + pad + t + topPad - (cornerLiftUpPx + 14) - up + topDown,
                borderTopWidth: stroke,
                borderLeftWidth: stroke,
                borderRightWidth: 0,
                borderBottomWidth: 0,
              },
            ]}
          />
          <View
            pointerEvents="none"
            style={[
              base,
              {
                left: ox + dispW - pad - size,
                top: oy + pad + t + topPad - (cornerLiftUpPx + 14) - up + topDown,
                borderTopWidth: stroke,
                borderRightWidth: stroke,
                borderLeftWidth: 0,
                borderBottomWidth: 0,
              },
            ]}
          />
        </>
      ) : null}
      {showBottomCorners ? (
        <>
          <View
            pointerEvents="none"
            style={[
              base,
              {
                left: ox + pad,
                top: oy + dispH - pad - size + t - cornerLiftUpPx - bottomUp,
                borderBottomWidth: stroke,
                borderLeftWidth: stroke,
                borderTopWidth: 0,
                borderRightWidth: 0,
              },
            ]}
          />
          <View
            pointerEvents="none"
            style={[
              base,
              {
                left: ox + dispW - pad - size,
                top: oy + dispH - pad - size + t - cornerLiftUpPx - bottomUp,
                borderBottomWidth: stroke,
                borderRightWidth: stroke,
                borderTopWidth: 0,
                borderLeftWidth: 0,
              },
            ]}
          />
        </>
      ) : null}
    </>
  );
}

/** Два шари Rectangle 37 — густіша тінь; без зсуву, щоб не обрізалось у overflow:hidden. */
function DoubleRect37Strip({
  firstOpacity = 1,
  secondOpacity = 0.82,
  androidResize = Platform.OS === 'android' || Platform.OS === 'ios',
}) {
  const resizeProps = androidResize ? { resizeMethod: 'resize' } : {};
  return (
    <>
      <Image
        source={RECTANGLE_37}
        style={[styles.landmarksBottomFadeImage, { opacity: firstOpacity }]}
        resizeMode="stretch"
        {...resizeProps}
        accessibilityIgnoresInvertColors
        accessible={false}
      />
      <Image
        source={RECTANGLE_37}
        style={[StyleSheet.absoluteFillObject, { opacity: secondOpacity }]}
        resizeMode="stretch"
        {...resizeProps}
        accessibilityIgnoresInvertColors
        accessible={false}
      />
    </>
  );
}

export default function OnboardingIntroPage({ navigation, route }) {
  const r = useResponsive();
  const screenW = r.width;
  const screenH = r.height;
  /** Макс. з window/screen — на Android інколи `r.width` вужчий за фізичний край; скан-тінь тоді «рве» по боках. */
  const scanLayoutFullWidthPx = Math.round(
    Math.max(
      screenW,
      Dimensions.get('window').width,
      Dimensions.get('screen').width,
    ),
  );
  /**
   * Герой / тіні / копія онбордингу: на iPhone ті самі px-зсуви, що й на Android.
   */
  const onboardPixelTuningMobile =
    Platform.OS === 'android' || Platform.OS === 'ios';
  /**
   * Смуга Rectangle 37: bleed за краї екрана, щоб при stretch не було видно обриву PNG.
   */
  const heroBottomFadeStripEdgeBleedPx = Math.round(
    Math.max(72, screenW * 0.18),
  );
  const heroBottomFadeStripWidthPx = screenW + 2 * heroBottomFadeStripEdgeBleedPx;
  const heroBottomFadeStripLeftPx = -heroBottomFadeStripEdgeBleedPx;
  const androidOnboardShadowStripExtraDownPx = onboardPixelTuningMobile
    ? Math.round(Math.max(12, screenH * 0.014))
    : 0;
  /**
   * Усі герої-зображення онбордингу трохи нижче в кадрі (+translateY) — iOS = Android.
   */
  const androidOnboardHeroImageExtraDownPx = onboardPixelTuningMobile
    ? Math.round(Math.max(16, screenH * 0.018))
    : 0;
  const lang = useAppLanguage(route);
  const [step, setStep] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const ctaPressAnim = useRef(new Animated.Value(0)).current;
  /** Крок змінюється лише з кнопки; блокуємо подвійне спрацьовування одного натискання. */
  const advanceLockRef = useRef(false);

  const slides = useMemo(() => getSlidesForLanguage(lang), [lang]);
  const skipWord = useMemo(() => getSkipLabel(lang), [lang]);
  const continueWord = useMemo(() => getContinueLabel(lang), [lang]);
  const slide = slides[step] ?? slides[0];
  const onboardingTitleDisplayed = useOnboardingTypewriterTitle(
    slide?.title ?? '',
    step,
    lang,
  );

  const columnMaxWidth = Math.min(341, Math.max(0, r.width - r.horizontalPadding * 2));
  /** Зона крапок + «Пропустити»: вужче за екран, ніж раніше. */
  const skipCtaMaxWidth = Math.min(348, Math.round(screenW * 0.86));
  const leftAccentTitleSize = Math.min(26, Math.round(24 * r.scale));
  const leftAccentBodySize = Math.round(16 * r.scale);
  const skipArrowSize = Math.round(18 * Math.min(r.scale, 1.15));
  /** Усі слайди з героєм: підйом фото (трохи нижче — ближче до смуги Rectangle 37 на переході). */
  const onboardHeroPhotoLiftUpPx = Math.round(Math.max(32, screenH * 0.044));
  const onboardCopyShiftDownPx = Math.round(Math.max(10, screenH * 0.014));

  const isScanSlide = step === 1;
  /**
   * Слайд скана: ширший зовнішній кліп і смуги на всю його ширину — тінь до лівого/правого краю без щілин
   * (внутрішній градієнт інакше обрізається `overflow: hidden` у `landmarksPhotoImageClip`).
   */
  const scanHeroShadowHorizontalBleedPx = Math.round(
    Math.max(160, scanLayoutFullWidthPx * 0.22),
  );
  const scanHeroClipWidthPx =
    scanLayoutFullWidthPx + 2 * scanHeroShadowHorizontalBleedPx;
  const scanHeroClipLeftPx =
    Math.round((screenW - scanLayoutFullWidthPx) / 2) -
    scanHeroShadowHorizontalBleedPx;
  /** Перший слайд — пам’ятки: додаткове тепле «прожекторне» світіння. */
  const isLandmarksSlide = step === 0;
  /** Лише «шукати цікаві пам’ятки»: додатковий підйом зображення (translateY −). */
  const landmarksSlideHeroImageExtraNudgeUpPx = Math.round(
    Math.max(42, screenH * 0.044),
  );
  /** Слайд «цікаві пам’ятки»: фото трохи нижче (translateY +) — як на Android. */
  const landmarksSlideHeroImageNudgeDownPx = Math.round(
    Math.max(16, screenH * 0.015),
  );
  /** Додатковий bleed під низ фото пам’яток / скану, щоб тінь не обрізалась. */
  const landmarksSlideOnlyClipBleedExtraPx = Math.round(
    Math.max(14, screenH * 0.016),
  );
  /** Лише слайд «цікаві пам’ятки»: ширший Rectangle 37 (додатковий bleed). */
  const landmarksOnlyRect37ExtraBleedPx = Math.round(
    Math.max(40, screenW * 0.1),
  );
  const landmarksRect37StripWidthPx =
    screenW +
    2 * (heroBottomFadeStripEdgeBleedPx + landmarksOnlyRect37ExtraBleedPx);
  const landmarksRect37StripLeftPx = -(
    heroBottomFadeStripEdgeBleedPx + landmarksOnlyRect37ExtraBleedPx
  );
  /** Пам’ятки / скан: кілька м’яких смуг скріма. */
  const LANDMARKS_SCAN_HERO_SCRIM_COUNT = 2;
  const LANDMARKS_SCAN_HERO_SCRIM_GRADIENT_COLORS = [
    'rgba(0,0,0,0)',
    'rgba(0,0,0,0.52)',
    'rgba(0,0,0,0.94)',
    '#000000',
  ];
  const LANDMARKS_SCAN_HERO_SCRIM_GRADIENT_LOCATIONS = [0, 0.28, 0.62, 1];
  const landmarksScanHeroScrimClipBleedPx = Math.round(Math.max(48, screenH * 0.054));
  const landmarksHeroScrimH = Math.round(Math.max(60, Math.min(108, screenH * 0.098)));
  const landmarksHeroStripLiftUpPx = Math.round(Math.max(2, screenH * 0.006));
  const landmarksHeroScrimNudgeDownPx = Math.round(Math.max(50, screenH * 0.052));
  const landmarksSlideOnlyScrimNudgeDownPx = Math.round(
    Math.max(64, screenH * 0.066),
  );
  const landmarksHeroScrimDupExtraDownPx = Math.round(Math.max(12, screenH * 0.016));
  /** Раніше — окремий зсув скану на iPhone; тепер ті самі px, що Android (див. androidScanSlide*). */
  const iosScanSlideHeroExtraNudgeDownPx = 0;
  const iosDeScanHeroExtraNudgeDownPx = 0;
  /**
   * Скан: фото ще трохи нижче в кадрі (translateY).
   */
  const androidScanSlideHeroExtraDownPx = onboardPixelTuningMobile
    ? Math.round(Math.max(22, screenH * 0.024))
    : 0;
  /**
   * Скан: фото трохи вище в кадрі (translateY −).
   */
  const androidScanSlidePhotoLiftUpPx = onboardPixelTuningMobile
    ? -Math.round(Math.max(14, screenH * 0.015))
    : 0;
  /**
   * Скан: легкий підйом кадру (менший ніж раніше — фото трохи нижче на сторінці).
   */
  const scanSlideUniversalPhotoLiftPx = isScanSlide
    ? -Math.round(Math.max(10, screenH * 0.011))
    : 0;
  /** Скан: свідомо трохи нижче в блоці героя (translateY +). */
  const scanSlidePhotoPageLowerPx = isScanSlide
    ? Math.round(Math.max(22, screenH * 0.024))
    : 0;
  /** Скан: тінь / смуги нижче — усі мови. */
  const scanSlideShadowNudgeDownPx = isScanSlide
    ? Math.round(Math.max(88, screenH * 0.068))
    : 0;
  /** Скан: лише Android + it — тінь трохи вище (зменшуємо зсув униз). */
  const scanSlideShadowItAndroidLiftUpPx =
    isScanSlide && lang === 'it' && Platform.OS === 'android'
      ? Math.round(Math.max(24, screenH * 0.024))
      : 0;
  /** Скан: uk — тінь трохи нижче (помірно). */
  const scanSlideShadowUkExtraDownPx =
    isScanSlide && lang === 'uk'
      ? Math.round(Math.max(5, screenH * 0.006))
      : 0;
  /** Скан: лише hy — тінь / смуги трохи вище. */
  const scanSlideShadowHyLiftUpPx =
    isScanSlide && lang === 'hy'
      ? Math.round(Math.max(16, screenH * 0.016))
      : 0;
  const scanSlideShadowOffsetDownPx = Math.max(
    0,
    scanSlideShadowNudgeDownPx -
      scanSlideShadowItAndroidLiftUpPx -
      scanSlideShadowHyLiftUpPx +
      scanSlideShadowUkExtraDownPx,
  );
  const rsfHeroScrimClipBleedPx = Math.round(Math.max(60, screenH * 0.063));
  const RSF_HERO_SCRIM_COUNT = 5;
  const landmarksHeroScrimLowerNudgePx = Math.round(Math.max(38, screenH * 0.041));
  const RSF_HERO_SCRIM_GRADIENT_COLORS = [
    'rgba(0,0,0,0)',
    'rgba(0,0,0,0.72)',
    'rgba(0,0,0,0.99)',
    '#000000',
  ];
  const RSF_HERO_SCRIM_GRADIENT_LOCATIONS = [0, 0.22, 0.55, 1];
  const ROUTE_RSF_SCRIM_COUNT = 2;
  const ROUTE_RSF_SCRIM_GRADIENT_COLORS = [
    'rgba(0,0,0,0)',
    'rgba(0,0,0,0.52)',
    'rgba(0,0,0,0.9)',
    '#000000',
  ];
  const ROUTE_RSF_SCRIM_GRADIENT_LOCATIONS = [0, 0.3, 0.62, 1];
  const routeRsfScrimLowerNudgePx = Math.round(Math.max(30, screenH * 0.031));
  /** iOS = Android: лише спільні `androidDeLandmarksScrimNudgeUpPx` тощо. */
  const iosDeLandmarksScrimNudgeUpPx = 0;
  /**
   * Android + de / nl / es / ro, перший слайд: скрім / Rectangle 37 — ті самі числа, що для nl.
   */
  const androidDeLandmarksScrimNudgeUpPx =
    onboardPixelTuningMobile &&
    (lang === 'de' || lang === 'nl' || lang === 'es' || lang === 'ro') &&
    isLandmarksSlide
      ? Math.round(Math.max(15, screenH * 0.009))
      : 0;
  const nlLandmarksScrimNudgeUpPx = 0;
  const iosLvLandmarksScrimNudgeUpPx = 0;
  /**
   * lv, перший слайд: фото трохи нижче (iOS + Android); тінь узгоджена (`landmarksHeroStripTop` + Android rects).
   */
  const lvLandmarksImageNudgeDownPx =
    lang === 'lv' && isLandmarksSlide
      ? Math.round(Math.max(12, screenH * 0.014))
      : 0;
  const iosLtLandmarksScrimNudgeUpPx = 0;
  /**
   * lt, перший слайд: зона фото + зсув униз; менші значення — фото й тінь трохи вище.
   */
  const ltLandmarksPhotoExtendBottomPx =
    lang === 'lt' && isLandmarksSlide
      ? Math.round(Math.max(18, screenH * 0.022))
      : 0;
  const ltLandmarksImageNudgeDownPx =
    lang === 'lt' && isLandmarksSlide
      ? Math.round(Math.max(6, screenH * 0.009))
      : 0;
  /**
   * Android + lt, перший слайд: додатковий підйом фото (translateY −); тінь — той самий зсув у rects + `landmarksHeroStripTop`.
   */
  const androidLtLandmarksImageExtraLiftPx =
    onboardPixelTuningMobile && lang === 'lt' && isLandmarksSlide
      ? -Math.round(Math.max(26, screenH * 0.024))
      : 0;
  /**
   * es: iOS — як раніше; Android на пам’ятках — 0 (тінь через `androidDeLandmarksScrimNudgeUpPx` як у de);
   * Android на маршрут / поділитися / друзі — попередній зсув.
   */
  const esLandmarksScrimNudgeUpPx =
    lang === 'es' &&
    onboardPixelTuningMobile &&
    !isLandmarksSlide &&
    !isScanSlide
      ? Math.round(Math.max(11, screenH * 0.0085))
      : 0;
  /** ro: на RSF — той самий зсув скріма, що на Android (iOS = Android). */
  const roLandmarksScrimNudgeUpPx =
    lang === 'ro' &&
    onboardPixelTuningMobile &&
    !isLandmarksSlide &&
    !isScanSlide
      ? Math.round(Math.max(11, screenH * 0.0085))
      : 0;
  /** it: зсув скріма — значення як на Android. */
  const itLandmarksScrimNudgeUpPx =
    lang === 'it'
      ? Math.round(Math.max(11, screenH * 0.0085))
      : 0;
  /** Android + it, перший слайд: фото й Rectangle 37 трохи нижче. */
  const androidItLandmarksImageNudgeDownPx =
    onboardPixelTuningMobile && lang === 'it' && isLandmarksSlide
      ? Math.round(Math.max(20, screenH * 0.02))
      : 0;
  /**
   * Android + hy, перший слайд: додатковий підйом фото й тіні (nl без цього шару).
   * Скрім — `landmarksHeroStripTop` + `photoImageTranslateY`; Rectangle 37 — той самий зсув у `top`.
   */
  const androidHyLandmarksHeroLiftPx =
    Platform.OS === 'android' && lang === 'hy' && isLandmarksSlide
      ? -Math.round(Math.max(58, screenH * 0.045))
      : 0;
  /** Слайд «шукати маршрути»: чорний фон + фото (див. ROUTE_FIND_ILLUSTRATION) + смуги знизу. */
  const isRouteSlide = step === 2;
  /** Наступний слайд: «Ділись маршрутами». */
  const isShareSlide = step === 3;
  /** «Спілкуйся з друзями» — чорний фон, без лайм-підложки / LemonBannerGlow. */
  const isFriendsSlide = step === 4;
  const isAndroidEn = onboardPixelTuningMobile && lang === 'en';
  const isAndroidDe = onboardPixelTuningMobile && lang === 'de';
  const isAndroidPl = onboardPixelTuningMobile && lang === 'pl';
  const isAndroidNl = onboardPixelTuningMobile && lang === 'nl';
  const isAndroidEs = onboardPixelTuningMobile && lang === 'es';
  /**
   * Мобільний + en / uk / de / nl / hy / es / it / lt / lv / ro, скан: базовий підйом фото (як для de; hy / nl — ті самі px).
   * Android + pl — окремо (`androidPlScanHeroExtraLiftPx`).
   */
  const androidScanHeroExtraLiftEnUkDePx =
    onboardPixelTuningMobile &&
    isScanSlide &&
    (lang === 'en' ||
      lang === 'uk' ||
      lang === 'de' ||
      lang === 'nl' ||
      lang === 'hy' ||
      lang === 'es' ||
      lang === 'it' ||
      lang === 'lt' ||
      lang === 'lv' ||
      lang === 'ro')
      ? -Math.round(Math.max(10, screenH * 0.012))
      : 0;
  /** Android + en, скан: додатковий підйом фото (узгоджено зі скрімом у scanPhotoImageTranslateY). */
  const androidEnScanHeroBonusLiftPx =
    isAndroidEn && isScanSlide
      ? -Math.round(Math.max(65, screenH * 0.06))
      : 0;
  /** Android + uk, скан: додатковий підйом фото (той самий `scanPhotoImageTranslateY`, що й для en). */
  const androidUkScanHeroBonusLiftPx =
    Platform.OS === 'android' && lang === 'uk' && isScanSlide
      ? -Math.round(Math.max(60, screenH * 0.048))
      : 0;
  /** Android + es, скан: додатковий підйом фото (translateY −). */
  const androidEsScanHeroExtraLiftPx =
    Platform.OS === 'android' && lang === 'es' && isScanSlide
      ? -Math.round(Math.max(32, screenH * 0.014))
      : 0;
  /** Android + lt, скан: додатковий підйом фото (translateY −). */
  const androidLtScanHeroExtraLiftPx =
    Platform.OS === 'android' && lang === 'lt' && isScanSlide
      ? -Math.round(Math.max(34, screenH * 0.014))
      : 0;
  /** Android + lv, скан: додатковий підйом фото (translateY −). */
  const androidLvScanHeroExtraLiftPx =
    Platform.OS === 'android' && lang === 'lv' && isScanSlide
      ? -Math.round(Math.max(34, screenH * 0.014))
      : 0;
  /**
   * Мобільний + de / nl / hy / es / it / lt / lv / ro, скан: додатковий підйом фото (ідентично de / nl).
   */
  const androidDeScanHeroExtraLiftPx =
    onboardPixelTuningMobile &&
    isScanSlide &&
    (lang === 'de' ||
      lang === 'nl' ||
      lang === 'hy' ||
      lang === 'es' ||
      lang === 'it' ||
      lang === 'lt' ||
      lang === 'lv' ||
      lang === 'ro')
      ? -Math.round(Math.max(26, screenH * 0.028))
      : 0;
  /**
   * Мобільний + pl, скан: підйом фото (translateY −).
   */
  const androidPlScanHeroExtraLiftPx =
    onboardPixelTuningMobile && lang === 'pl' && isScanSlide
      ? Platform.OS === 'android'
        ? -Math.round(Math.max(70, screenH * 0.041))
        : -Math.round(Math.max(32, screenH * 0.015))
      : 0;
  /**
   * Мобільний + hy / nl, скан: додатковий підйом фото.
   */
  const androidHyNlScanHeroExtraLiftPx =
    onboardPixelTuningMobile &&
    isScanSlide &&
    (lang === 'hy' || lang === 'nl')
      ? -Math.round(Math.max(28, screenH * 0.022))
      : 0;
  /**
   * Скан: лише Android + hy — фото й смуги трохи вище (додатково до hy/nl шару).
   */
  const androidHyScanAndroidOnlyExtraLiftPx =
    Platform.OS === 'android' && lang === 'hy' && isScanSlide
      ? -Math.round(Math.max(12, screenH * 0.012))
      : 0;
  /**
   * Android, скан (усі мови): легкий зсув фото по translateY.
   */
  const androidScanAndroidPhotoPushDownPx =
    Platform.OS === 'android' && isScanSlide
      ? Math.round(Math.max(4, screenH * 0.009))
      : 0;
  /**
   * Android + de, скан: додатковий зсув фото по translateY (від’ємне — вище).
   */
  const androidDeScanPhotoPushDownPx =
    Platform.OS === 'android' && lang === 'de' && isScanSlide
      ? -Math.round(Math.max(30, screenH * 0.018))
      : 0;
  /** Android + en, слайд маршруту: додатковий підйом фото й тіні (translateY −). */
  const androidEnRouteHeroExtraLiftPx =
    isAndroidEn && isRouteSlide
      ? -Math.round(Math.max(26, screenH * 0.026))
      : 0;
  /** Android + en, слайд «поділитися»: фото й тінь трохи вище (translateY −). */
  const androidEnShareHeroExtraLiftPx =
    isAndroidEn && isShareSlide
      ? -Math.round(Math.max(16, screenH * 0.016))
      : 0;
  /** Android + uk, слайд «поділитися»: фото й тінь трохи вище (translateY −). */
  const androidUkShareHeroExtraLiftPx =
    onboardPixelTuningMobile && lang === 'uk' && isShareSlide
      ? -Math.round(Math.max(16, screenH * 0.016))
      : 0;
  /** Android + de, слайд «поділитися»: фото й тінь трохи вище (translateY −). */
  const androidDeShareHeroExtraLiftPx =
    isAndroidDe && isShareSlide
      ? -Math.round(Math.max(10, screenH * 0.011))
      : 0;
  /** Android + pl, слайд «поділитися»: фото й тінь трохи вище (translateY −). */
  const androidPlShareHeroExtraLiftPx =
    isAndroidPl && isShareSlide
      ? -Math.round(Math.max(10, screenH * 0.011))
      : 0;
  /** Android + nl, слайд «поділитися»: фото й тінь трохи вище (translateY −). */
  const androidNlShareHeroExtraLiftPx =
    isAndroidNl && isShareSlide
      ? -Math.round(Math.max(10, screenH * 0.011))
      : 0;
  /** Android + hy, слайд «поділитися»: фото й тінь вище (translateY −). */
  const androidHyShareHeroExtraLiftPx =
    Platform.OS === 'android' && lang === 'hy' && isShareSlide
      ? -Math.round(Math.max(36, screenH * 0.034))
      : 0;
  /** Android + it, слайд «поділитися»: фото й тінь трохи нижче (+translateY). */
  const androidItShareHeroExtraDownPx =
    onboardPixelTuningMobile && lang === 'it' && isShareSlide
      ? Math.round(Math.max(18, screenH * 0.018))
      : 0;
  /** Android + ro, слайд «поділитися»: фото й тінь трохи нижче (лише ro). */
  const androidRoShareHeroExtraDownPx =
    onboardPixelTuningMobile && lang === 'ro' && isShareSlide
      ? Math.round(Math.max(22, screenH * 0.022))
      : 0;
  const androidDeRouteHeroExtraLiftPx =
    isAndroidDe && isRouteSlide
      ? -Math.round(Math.max(18, screenH * 0.018))
      : 0;
  /** Android + uk, слайд маршруту: додатковий підйом фото й тіні (translateY −). */
  const androidUkRouteHeroExtraLiftPx =
    onboardPixelTuningMobile && lang === 'uk' && isRouteSlide
      ? -Math.round(Math.max(20, screenH * 0.02))
      : 0;
  /** Android + pl, слайд маршруту: додатковий підйом фото й тіні (translateY −). */
  const androidPlRouteHeroExtraLiftPx =
    isAndroidPl && isRouteSlide
      ? -Math.round(Math.max(24, screenH * 0.023))
      : 0;
  /** Android + nl, слайд маршруту: додатковий підйом фото й тіні (translateY −). */
  const androidNlRouteHeroExtraLiftPx =
    isAndroidNl && isRouteSlide
      ? -Math.round(Math.max(22, screenH * 0.022))
      : 0;
  /** Android + es, слайд маршруту: додатковий підйом фото й тіні (translateY −). */
  const androidEsRouteHeroExtraLiftPx =
    isAndroidEs && isRouteSlide
      ? -Math.round(Math.max(14, screenH * 0.014))
      : 0;
  /** Android + it, слайд маршруту: додатковий підйом фото й тіні (translateY −). */
  const androidItRouteHeroExtraLiftPx =
    onboardPixelTuningMobile && lang === 'it' && isRouteSlide
      ? -Math.round(Math.max(10, screenH * 0.011))
      : 0;
  /** Android + hy, слайд маршруту: фото й тінь трохи вище (translateY −). */
  const androidHyRouteHeroExtraLiftPx =
    Platform.OS === 'android' && lang === 'hy' && isRouteSlide
      ? -Math.round(Math.max(56, screenH * 0.052))
      : 0;
  /**
   * Android, слайд «маршрути» (усі мови): фото й тінь / Rectangle 37 трохи нижче.
   */
  const androidRouteHeroExtraDownPx =
    onboardPixelTuningMobile && isRouteSlide
      ? Math.round(Math.max(22, screenH * 0.021))
      : 0;
  const androidEnFriendsHeroExtraDownPx =
    isAndroidEn && isFriendsSlide
      ? Math.round(Math.max(26, screenH * 0.024))
      : 0;
  /** Android + de, «друзі»: фото трохи нижче; scrimBaseTop у useMemo вже з тим самим translateY. */
  const androidDeFriendsHeroExtraDownPx =
    isAndroidDe && isFriendsSlide
      ? Math.round(Math.max(22, screenH * 0.02))
      : 0;
  /** Android + it, «друзі»: фото й тінь трохи нижче. */
  const androidItFriendsHeroExtraDownPx =
    onboardPixelTuningMobile && lang === 'it' && isFriendsSlide
      ? Math.round(Math.max(28, screenH * 0.026))
      : 0;
  /** Android + uk, «друзі»: фото трохи нижче в кадрі (було сильніше — трохи піднято вгору). */
  const androidUkFriendsHeroExtraDownPx =
    onboardPixelTuningMobile && lang === 'uk' && isFriendsSlide
      ? Math.round(Math.max(12, screenH * 0.01))
      : 0;
  /**
   * Android + uk, «друзі»: скрім / смуги Rectangle 37 узгоджено з фото + легкий додатковий зсув.
   */
  const androidUkFriendsScrimExtraDownPx =
    androidUkFriendsHeroExtraDownPx > 0
      ? androidUkFriendsHeroExtraDownPx +
        Math.round(Math.max(5, screenH * 0.006))
      : 0;
  /** Android + pl, «друзі»: фото й скрім (через useMemo) трохи нижче. */
  const androidPlFriendsHeroExtraDownPx =
    isAndroidPl && isFriendsSlide
      ? Math.round(Math.max(18, screenH * 0.018))
      : 0;
  /** Android + ro, «друзі»: ті самі px, що й pl — фото й тінь / смуги. */
  const androidRoFriendsHeroExtraDownPx =
    onboardPixelTuningMobile && lang === 'ro' && isFriendsSlide
      ? Math.round(Math.max(18, screenH * 0.018))
      : 0;
  /** Android + nl, «друзі»: фото й скрім трохи нижче (помірно, як «немного»). */
  const androidNlFriendsHeroExtraDownPx =
    isAndroidNl && isFriendsSlide
      ? Math.round(Math.max(12, screenH * 0.012))
      : 0;
  /** Android + es, «друзі»: фото й тінь / смуги трохи нижче (порівняно з pl). */
  const androidEsFriendsHeroExtraDownPx =
    onboardPixelTuningMobile && lang === 'es' && isFriendsSlide
      ? Math.round(Math.max(24, screenH * 0.023))
      : 0;
  /** Android + lt, «друзі»: фото й тінь / смуги (узгоджено з lv). */
  const androidLtFriendsHeroExtraDownPx =
    onboardPixelTuningMobile && lang === 'lt' && isFriendsSlide
      ? Math.round(Math.max(18, screenH * 0.018))
      : 0;
  /** Android + lv, «друзі»: ті самі px, що й lt — фото й тінь / смуги. */
  const androidLvFriendsHeroExtraDownPx =
    onboardPixelTuningMobile && lang === 'lv' && isFriendsSlide
      ? Math.round(Math.max(18, screenH * 0.018))
      : 0;
  /**
   * Кроки 0…4: довгий заголовок (часто 2 рядки) — герой трохи вище, щоб не тиснув на текст.
   * Універсально для всіх мов; поріг у символах підібраний під типові рядки онбордингу.
   * Android + en / uk / de: перший слайд — без авто-підйому за довгим заголовком (de має явний lift у landmarks).
   */
  const heroOnboardTitleLen = String((slides[step] ?? slides[0])?.title ?? '').length;
  const LONG_ONBOARD_TITLE_LIFT_THRESHOLD = 22;
  const onboardLongTitleHeroLiftPx =
    step >= 0 &&
    step <= 4 &&
    heroOnboardTitleLen >= LONG_ONBOARD_TITLE_LIFT_THRESHOLD &&
    !(
      onboardPixelTuningMobile &&
      (lang === 'en' || lang === 'uk' || lang === 'de') &&
      step === 0
    )
      ? -Math.round(Math.max(8, screenH * 0.01))
      : 0;
  /**
   * Маршрут / поділитися / друзі: один підйом фото вгору (translateY −), узгоджено зі скрімом;
   * трохи сильніше, ніж раніше лише для «друзі».
   */
  const rsfHeroImageNudgeUpPx = Math.round(Math.max(24, screenH * 0.036));
  /**
   * Маршрут / поділитися / друзі: спільний помірний підйом фото (iOS + Android), узгоджено зі скрімом.
   */
  const rsfHeroSharedVerticalNudgeUpPx = Math.round(
    Math.max(8, screenH * 0.011),
  );
  /**
   * Маршрут / поділитися / друзі: фото ще вище (ближче до першого слайду) — iOS = Android.
   */
  const androidRsfHeroImageExtraLiftUpPx = onboardPixelTuningMobile
    ? Math.round(Math.max(28, screenH * 0.032))
    : 0;
  /**
   * Лише Android — слайди «поділитися» та «друзі»: фото трохи нижче (маршрут без змін).
   */
  const androidShareFriendsHeroExtraDownPx =
    onboardPixelTuningMobile && (isShareSlide || isFriendsSlide)
      ? Math.round(Math.max(12, screenH * 0.014))
      : 0;
  /**
   * Android, лише слайд «поділитися» (усі мови): фото й тінь нижче — однаково для всіх перекладів;
   * додається до `androidShareFriendsHeroExtraDownPx` (той лишається для share + friends).
   */
  const androidShareSlideHeroExtraDownPx =
    onboardPixelTuningMobile && isShareSlide
      ? Math.round(Math.max(20, screenH * 0.021))
      : 0;
  /** Раніше окремий зсув на iPhone; сумарний зсув тепер у androidShareFriends* / per-lang px. */
  const iosEnDeShareFriendsHeroExtraDownPx = 0;
  const friendsCopyOnlyExtraDownPx = Math.round(Math.max(8, screenH * 0.013));
  /** Останній слайд: слоган лише на відео; знизу — індикатори та кнопка. */
  const isFinalBrandSlide = step === TOTAL_STEPS - 1;
  /**
   * Додатковий відступ знизу — крапки + CTA. На Android ті самі значення, що на iOS,
   * щоб відступ «крапки ↔ текст» збігався з iPhone.
   */
  const onboardFooterExtraBottomPx = Math.min(
    32,
    Math.max(12, Math.round(screenH * 0.02)),
  );
  /** Базовий відступ тексту над крапками / кнопкою (багаторядковий body на всіх мовах). */
  const ONBOARD_COPY_GAP_ABOVE_FOOTER_PX = 24;
  /** Як у `styles.dots` (marginTop / marginBottom) — відступ «низ фото → заголовок» на слайді маршруту. */
  const ONBOARD_DOTS_ROW_MARGIN_PX = 20;
  /** PL: інтервал заголовок ↔ текст як у крапок `marginTop` (узгоднено з укр. макетом). */
  const onboardPlTitleBodyGapStyle =
    lang === 'pl' ? { gap: ONBOARD_DOTS_ROW_MARGIN_PX } : null;
  const onboardPlTitleTopAfterHeroPx = Math.round(Math.max(6, screenH * 0.008));
  /**
   * Відступ тексту над крапками / кнопкою (кроки 0…4, без ScrollView — текст закріплений унизу).
   */
  const ONBOARD_COPY_BOTTOM_SAFE_PX = Math.max(
    ONBOARD_COPY_GAP_ABOVE_FOOTER_PX + 10,
    22,
  );
  /** Легкий зсув копі трохи нижче (усі мови / слайди 0…4). */
  const ONBOARD_COPY_NUDGE_DOWN_PX = 11;
  /**
   * Фіксований вертикальний зсув копі (без onLayout / «тісного» режиму), щоб текст
   * не стрибав вгору-вниз між кадрами.
   */
  /** Як на iOS — той самий вертикальний зсув копі на Android (фото ↔ заголовок у тому ж ритмі). */
  const onboardCopySafeExtraDownPx = 8 + 10;
  /** Скан: той самий вертикальний баланс, що й маршрут / поділитися (без підйому копі). */
  const scanCopyLiftPx = 0;
  const onboardCopyBlockTranslateY =
    ONBOARD_COPY_NUDGE_DOWN_PX +
    onboardCopySafeExtraDownPx +
    scanCopyLiftPx +
    onboardCopyShiftDownPx;
  /**
   * Пам’ятки + скан: копія вище на всіх мовах / iOS+Android — щоб body не різався й не наїжджав на Skip.
   */
  /** Пам’ятки / скан: підйом копії — як на Android (без додаткового iOS-штовху). */
  const landmarksScanCopyVisualLiftPx =
    isLandmarksSlide || isScanSlide
      ? -Math.round(Math.max(22, screenH * 0.023))
      : 0;
  /** RSF: підйом копії — як на Android. */
  const rsfCopyVisualLiftPx =
    isRouteSlide || isShareSlide || isFriendsSlide
      ? -Math.round(Math.max(16, screenH * 0.018))
      : 0;
  /**
   * Android: додатковий підйом копії на всіх герой-слайдах (0…4). Інакше текст часто лишається під
   * смугами з elevation або занадто низько; входить у scanCopyVisualUpCompensationPx.
   */
  const androidHeroCopyExtraLiftPx =
    onboardPixelTuningMobile &&
    (isLandmarksSlide ||
      isScanSlide ||
      isRouteSlide ||
      isShareSlide ||
      isFriendsSlide)
      ? -Math.round(Math.max(40, screenH * 0.048))
      : 0;
  /** Раніше окремий підйом копії uk на iPhone; тепер спільна логіка з Android. */
  const iosUkScanCopyNudgeUpPx = 0;
  /**
   * Пам’ятки / скан / RSF: зсув копії вниз у чорній зоні (не змінює padding-компенсацію).
   * Android + en: зафіксовано сильніший зсув; інші мови / iOS — помірніше.
   */
  const onboardHeroCopyNudgeDownPx =
    onboardPixelTuningMobile && lang === 'en'
      ? Math.round(Math.max(95, screenH * 0.045))
      : Math.round(Math.max(95, screenH * 0.012));
  /** Запас між низом тексту й футером (крапки / CTA). */
  const overflowScrollReliefBottomPx = 36;

  /** Android + it, слайд «поділитися» — окремі відступи копі. */
  const isAndroidItShareSlide =
    onboardPixelTuningMobile && lang === 'it' && isShareSlide;
  const isAndroidRoShareSlide =
    onboardPixelTuningMobile && lang === 'ro' && isShareSlide;
  const androidItShareCopyLiftPx = isAndroidItShareSlide
    ? Math.round(Math.max(8, screenH * 0.012))
    : 0;
  /** Android + ro, «поділитися»: без додаткового зсуву — інакше футер (крапки / CTA) може піти за екран. */
  const androidRoShareCopyLiftPx = 0;
  /** Android + ro, «поділитися»: менший gap заголовок ↔ body (стандартні 12 дають «дірку» на 2 рядки заголовка). */
  /** Android + ro, «поділитися»: без gap між заголовком і body (узгоджено з margin на Text). */
  const onboardRoShareTitleBodyGapStyle = isAndroidRoShareSlide
    ? { gap: 0 }
    : null;
  /**
   * Android + ro, «поділитися»: трохи менший paddingBottom у зоні копії — кнопка «Sari peste» лишається в кадрі.
   */
  const onboardCopyRoShareAndroidBottomPadReliefPx = isAndroidRoShareSlide
    ? Math.round(Math.max(28, screenH * 0.03))
    : 0;
  const onboardCopyScrollInnerPaddingBottomPx =
    ONBOARD_COPY_BOTTOM_SAFE_PX +
    overflowScrollReliefBottomPx -
    onboardCopyRoShareAndroidBottomPadReliefPx;
  /** Раніше окремі зсуви de/pl на iPhone; per-lang android* px покривають те саме. */
  const iosDeRouteCopyNudgeDownPx = 0;
  const iosDeShareCopyNudgeDownPx = 0;
  const iosDeShareHeroExtraDownPx = 0;
  const iosDeFriendsHeroExtraDownPx = 0;
  const iosPlFriendsHeroExtraDownPx = 0;

  /** Маршрут / поділитися / друзі: позиція героя + розрахунок скріма на межі фото. */
  const routeShareFriendsScrimLayout = useMemo(() => {
    if (!isRouteSlide && !isShareSlide && !isFriendsSlide) return null;
    const outerTop = Math.round(screenH * -0.006);
    const heroH = Math.round(screenH * 0.68);
    const outerW = screenW;
    const outerLeft = 0;
    const imageTranslateY =
      Math.round(screenH * 0.016) -
      rsfHeroImageNudgeUpPx -
      onboardHeroPhotoLiftUpPx -
      rsfHeroSharedVerticalNudgeUpPx +
      androidOnboardHeroImageExtraDownPx -
      androidRsfHeroImageExtraLiftUpPx +
      androidShareFriendsHeroExtraDownPx +
      androidShareSlideHeroExtraDownPx +
      androidEnShareHeroExtraLiftPx +
      androidUkShareHeroExtraLiftPx +
      androidDeShareHeroExtraLiftPx +
      androidPlShareHeroExtraLiftPx +
      androidNlShareHeroExtraLiftPx +
      androidHyShareHeroExtraLiftPx +
      androidItShareHeroExtraDownPx +
      androidRoShareHeroExtraDownPx +
      iosEnDeShareFriendsHeroExtraDownPx +
      onboardLongTitleHeroLiftPx +
      androidEnRouteHeroExtraLiftPx +
      androidDeRouteHeroExtraLiftPx +
      androidUkRouteHeroExtraLiftPx +
      androidPlRouteHeroExtraLiftPx +
      androidNlRouteHeroExtraLiftPx +
      androidEsRouteHeroExtraLiftPx +
      androidItRouteHeroExtraLiftPx +
      androidHyRouteHeroExtraLiftPx +
      androidRouteHeroExtraDownPx +
      androidEnFriendsHeroExtraDownPx +
      androidDeFriendsHeroExtraDownPx +
      androidItFriendsHeroExtraDownPx +
      androidPlFriendsHeroExtraDownPx +
      androidRoFriendsHeroExtraDownPx +
      androidNlFriendsHeroExtraDownPx +
      androidEsFriendsHeroExtraDownPx +
      androidLtFriendsHeroExtraDownPx +
      androidLvFriendsHeroExtraDownPx +
      iosDeShareHeroExtraDownPx +
      iosDeFriendsHeroExtraDownPx +
      iosPlFriendsHeroExtraDownPx;
    const rawBase =
      Math.max(
        0,
        heroH -
          landmarksHeroScrimH -
          landmarksHeroStripLiftUpPx +
          imageTranslateY,
      ) +
      landmarksHeroScrimNudgeDownPx -
      iosDeLandmarksScrimNudgeUpPx -
      nlLandmarksScrimNudgeUpPx -
      iosLvLandmarksScrimNudgeUpPx -
      iosLtLandmarksScrimNudgeUpPx -
      esLandmarksScrimNudgeUpPx -
      roLandmarksScrimNudgeUpPx -
      itLandmarksScrimNudgeUpPx;
    const scrimBaseTop = Number.isFinite(rawBase) ? Math.max(0, rawBase) : 0;
    const fadeBleed = heroBottomFadeStripEdgeBleedPx;
    return {
      outerTop,
      heroH,
      outerW,
      outerLeft,
      scrimBaseTop,
      outerH: heroH + rsfHeroScrimClipBleedPx,
      heroFadeBleedPx: fadeBleed,
      heroFadeWidthPx: outerW + 2 * fadeBleed,
      heroFadeLeftPx: -fadeBleed,
    };
  }, [
    isRouteSlide,
    isShareSlide,
    isFriendsSlide,
    heroBottomFadeStripEdgeBleedPx,
    rsfHeroImageNudgeUpPx,
    rsfHeroSharedVerticalNudgeUpPx,
    onboardHeroPhotoLiftUpPx,
    screenH,
    screenW,
    landmarksHeroScrimH,
    landmarksHeroStripLiftUpPx,
    landmarksHeroScrimNudgeDownPx,
    landmarksHeroScrimDupExtraDownPx,
    rsfHeroScrimClipBleedPx,
    iosDeLandmarksScrimNudgeUpPx,
    nlLandmarksScrimNudgeUpPx,
    iosLvLandmarksScrimNudgeUpPx,
    iosLtLandmarksScrimNudgeUpPx,
    esLandmarksScrimNudgeUpPx,
    roLandmarksScrimNudgeUpPx,
    itLandmarksScrimNudgeUpPx,
    androidOnboardHeroImageExtraDownPx,
    androidRsfHeroImageExtraLiftUpPx,
    androidShareFriendsHeroExtraDownPx,
    androidShareSlideHeroExtraDownPx,
    androidEnShareHeroExtraLiftPx,
    androidUkShareHeroExtraLiftPx,
    androidDeShareHeroExtraLiftPx,
    androidPlShareHeroExtraLiftPx,
    androidNlShareHeroExtraLiftPx,
    androidHyShareHeroExtraLiftPx,
    androidItShareHeroExtraDownPx,
    androidRoShareHeroExtraDownPx,
    iosEnDeShareFriendsHeroExtraDownPx,
    onboardLongTitleHeroLiftPx,
    androidEnRouteHeroExtraLiftPx,
    androidDeRouteHeroExtraLiftPx,
    androidUkRouteHeroExtraLiftPx,
    androidPlRouteHeroExtraLiftPx,
    androidNlRouteHeroExtraLiftPx,
    androidEsRouteHeroExtraLiftPx,
    androidItRouteHeroExtraLiftPx,
    androidHyRouteHeroExtraLiftPx,
    androidRouteHeroExtraDownPx,
    androidEnFriendsHeroExtraDownPx,
    androidDeFriendsHeroExtraDownPx,
    androidItFriendsHeroExtraDownPx,
    androidPlFriendsHeroExtraDownPx,
    androidRoFriendsHeroExtraDownPx,
    androidNlFriendsHeroExtraDownPx,
    androidEsFriendsHeroExtraDownPx,
    androidLtFriendsHeroExtraDownPx,
    androidLvFriendsHeroExtraDownPx,
    iosDeShareHeroExtraDownPx,
    iosDeFriendsHeroExtraDownPx,
    lang,
  ]);

  /** Слоган останнього слайду + ілюстрація Group 65. */
  const finalVideoTaglineSizeBase = Math.min(18, Math.round(16 * r.scale));
  /**
   * Android + de + останній слайд: довший слоган — трохи менший шрифт, щоб вміщувався в рядок.
   */
  const finalVideoTaglineSize =
    onboardPixelTuningMobile && lang === 'de' && isFinalBrandSlide
      ? Math.max(13, Math.round(finalVideoTaglineSizeBase * 0.87))
      : finalVideoTaglineSizeBase;
  const finalVideoTaglineLineHeight = Math.round(finalVideoTaglineSize * 1.35);
  /**
   * Від’ємний margin зверху — верхня смуга колажу заходить вище (iOS і Android).
   * Додаємо невеликий додаток від висоти екрана, якщо inset малий (частіше Android).
   */
  /** Трохи менший підйом зверху — анімація + історія трохи нижче. */
  const finalVideoBandTopOffset =
    12 -
    Math.min(
      58,
      Math.round((r.insets?.top ?? 0) * 0.72) + Math.round(screenH * 0.022),
    );
  const finalLowerVideoGap = 4;
  /** Нижня чорна смуга під блоком героя. */
  const finalLowerVideoBandHeight = Math.min(Math.round(screenH * 0.36), 320);
  const finalVideoTaglineBlockPaddingBottom = 10;
  const finalOnboardLayout = useMemo(() => {
    const src = Image.resolveAssetSource(FINAL_ONBOARD_BRAND_HERO);
    const iw = src?.width || 1;
    const ih = src?.height || 1;
    const naturalH = (screenW * ih) / iw;
    /** Вища межа колажу; на iPhone трохи більше — візуально тягнеться нижче. */
    const maxImageH = Math.round(screenH * 0.73);
    const finalOnboardImageHeight = Math.min(Math.round(naturalH), maxImageH);
    /** Компактне відео перед текстом; ×0.92 — трохи менша анімація на останньому слайді. */
    const finalTaglineVideoH = Math.round(
      Math.min(136, Math.max(104, screenH * 0.14)) * 0.92,
    );
    /** Відступ між відео й текстом (узгоджено з marginTop у finalVideoTaglineTextBelowVideo). */
    const finalTaglineVideoToTextGap = 4;
    const taglineBlockH =
      4 +
      finalTaglineVideoH +
      finalTaglineVideoToTextGap +
      Math.round(finalVideoTaglineLineHeight * 2.6) +
      finalVideoTaglineBlockPaddingBottom +
      12;
    const finalBrandHeroHeight = finalOnboardImageHeight + taglineBlockH;
    return {
      finalOnboardImageHeight,
      finalBrandHeroHeight,
      taglineBlockH,
      finalTaglineVideoH,
    };
  }, [
    screenW,
    screenH,
    finalVideoTaglineLineHeight,
    finalVideoTaglineBlockPaddingBottom,
    isFinalBrandSlide,
    lang,
  ]);
  const {
    finalOnboardImageHeight,
    finalBrandHeroHeight,
    taglineBlockH,
    finalTaglineVideoH,
  } = finalOnboardLayout;
  /** Фото пам’яток не заходить на зону тексту + CTA.
   *  topBleed — зона вгору; photoZoomScale — рівномірне збільшення (contain + clip). */
  const landmarksBgLayout = useMemo(() => {
    if (!isLandmarksSlide) return null;
    const isAndroid = onboardPixelTuningMobile;
    const isEs = lang === 'es';
    const isRo = lang === 'ro';
    const isIt = lang === 'it';
    const textReserve = Math.round(screenH * 0.34);
    const topBleed = Math.round(screenH * 0.078);
    const basePhotoH = Math.max(1, screenH - textReserve);
    const iosLvLandmarksPhotoExtendBottomPx = 0;
    /** Мобільний (Android + iOS) + lv: ті самі px — інакше зсув униз обрізає contain у кліпі. */
    const androidLvLandmarksPhotoExtendBottomPx =
      isAndroid && lang === 'lv'
        ? Math.round(Math.max(26, screenH * 0.03))
        : 0;
    const photoH =
      basePhotoH +
      topBleed +
      iosLvLandmarksPhotoExtendBottomPx +
      androidLvLandmarksPhotoExtendBottomPx +
      ltLandmarksPhotoExtendBottomPx;
    const photoTranslateY = Math.round(screenH * 0.048);
    const photoStretchLiftY = Math.round(photoH * 0.018);
    const photoLiftUpPx = 0;
    /**
     * У режимі contain зазвичай упираємось у ширину екрана — лише scaleY майже не збільшує видиму «землю».
     * Рівномірний scale + обрізка (landmarksPhotoImageClip) дає реальне збільшення; легкий зсув вгору — більше нижньої частини кадру.
     */
    const photoZoomScale = isAndroid ? 1.16 : 1.12;
    const photoZoomGroundNudgeY = Math.round(-photoH * (isAndroid ? 0.048 : 0.036));
    const iosUkLandmarksImageLiftPx = 0;
    const iosPlLandmarksImageLiftPx = 0;
    const iosDeLandmarksImageLiftPx = 0;
    const nlLandmarksImageLiftPx = 0;
    /** Іспанська: iOS — як раніше; Android на пам’ятках — підйом як у de (`androidDeLandmarksHeroLiftPx`). */
    const esLandmarksImageLiftPx =
      isEs && !isAndroid ? -Math.round(screenH * 0.029) : 0;
    /** Румунська: iOS — як раніше; Android на пам’ятках — підйом як у nl (`androidDeLandmarksHeroLiftPx`). */
    const roLandmarksImageLiftPx =
      isRo && !isAndroid ? -Math.round(screenH * 0.029) : 0;
    /** Italiano: підйом лише на Android; iPhone — як en. */
    const itLandmarksImageLiftPx =
      isIt && isAndroid ? -Math.round(screenH * 0.026) : 0;
    /** Android + de / nl / es / ro: перший слайд — фото як у nl (ідентичні px). */
    const androidDeLandmarksHeroLiftPx =
      isAndroid &&
      (lang === 'de' || lang === 'nl' || lang === 'es' || lang === 'ro')
        ? -Math.round(Math.max(30, screenH * 0.018))
        : 0;
    const photoImageTranslateY =
      photoTranslateY -
      photoStretchLiftY -
      photoLiftUpPx +
      photoZoomGroundNudgeY +
      18 +
      iosUkLandmarksImageLiftPx +
      iosPlLandmarksImageLiftPx +
      iosDeLandmarksImageLiftPx +
      nlLandmarksImageLiftPx +
      esLandmarksImageLiftPx +
      roLandmarksImageLiftPx +
      itLandmarksImageLiftPx +
      androidDeLandmarksHeroLiftPx -
      onboardHeroPhotoLiftUpPx -
      landmarksSlideHeroImageExtraNudgeUpPx +
      landmarksSlideHeroImageNudgeDownPx +
      androidOnboardHeroImageExtraDownPx +
      onboardLongTitleHeroLiftPx +
      lvLandmarksImageNudgeDownPx +
      ltLandmarksImageNudgeDownPx +
      androidLtLandmarksImageExtraLiftPx +
      androidItLandmarksImageNudgeDownPx +
      androidHyLandmarksHeroLiftPx;
    return {
      textReserve,
      photoH,
      topBleed,
      photoZoomScale,
      photoImageTranslateY,
    };
  }, [
    isLandmarksSlide,
    screenH,
    screenW,
    lang,
    onboardPixelTuningMobile,
    onboardHeroPhotoLiftUpPx,
    landmarksSlideHeroImageExtraNudgeUpPx,
    landmarksSlideHeroImageNudgeDownPx,
    androidOnboardHeroImageExtraDownPx,
    onboardLongTitleHeroLiftPx,
    ltLandmarksPhotoExtendBottomPx,
    ltLandmarksImageNudgeDownPx,
    lvLandmarksImageNudgeDownPx,
    androidLtLandmarksImageExtraLiftPx,
    androidItLandmarksImageNudgeDownPx,
    androidHyLandmarksHeroLiftPx,
  ]);

  const landmarksHeroResolved = useMemo(
    () => Image.resolveAssetSource(LANDMARKS_SEARCH_BG),
    [],
  );

  const landmarksHeroStripTop = useMemo(() => {
    if (!isLandmarksSlide || !landmarksBgLayout) return null;
    const wrapW = Math.max(1, screenW || 1);
    const wrapH = Math.max(1, landmarksBgLayout.photoH || 1);
    const { photoZoomScale, photoImageTranslateY } = landmarksBgLayout;
    const stripH = landmarksHeroScrimH;
    const lift = landmarksHeroStripLiftUpPx;
    const nw = landmarksHeroResolved?.width;
    const nh = landmarksHeroResolved?.height;
    const fallbackTop = Math.max(
      0,
      wrapH - stripH - lift + photoImageTranslateY,
    );
    if (!nw || !nh || nw <= 0 || nh <= 0) {
      return Number.isFinite(fallbackTop) ? fallbackTop : 0;
    }
    const scale = Math.min(wrapW / nw, wrapH / nh);
    if (!Number.isFinite(scale)) {
      return Number.isFinite(fallbackTop) ? fallbackTop : 0;
    }
    const dispH = nh * scale;
    const oy = (wrapH - dispH) / 2;
    const midY = wrapH / 2;
    const bottomEdge =
      midY + (oy + dispH - midY) * photoZoomScale + photoImageTranslateY;
    const photoBottomY = Math.min(wrapH, Math.max(0, bottomEdge));
    const result = Math.max(0, photoBottomY - stripH - lift);
    return Number.isFinite(result) ? result : fallbackTop;
  }, [
    isLandmarksSlide,
    landmarksBgLayout,
    screenW,
    landmarksHeroResolved,
    landmarksHeroScrimH,
    landmarksHeroStripLiftUpPx,
  ]);

  /** Фото + смуги Rectangle 37; більший textReserve, ніж у пам’яток — текст лише на чорному під фото. */
  const scanBgLayout = useMemo(() => {
    if (!isScanSlide) return null;
    const androidScanPhotoReachDownPx = onboardPixelTuningMobile
      ? Math.round(Math.max(12, screenH * 0.014))
      : 0;
    /** Подовжити кліп/зображення вниз — iOS = Android. */
    const androidScanImageClipExtendBottomPx = onboardPixelTuningMobile
      ? Math.round(Math.max(28, screenH * 0.032))
      : 0;
    const textReserve = Math.round(screenH * 0.36);
    const topBleed = Math.round(screenH * 0.078);
    const basePhotoH = Math.max(
      1,
      screenH - textReserve + androidScanPhotoReachDownPx,
    );
    const photoH = basePhotoH + topBleed;
    const photoTranslateY = Math.round(screenH * 0.062);
    /** Висота: легке розтягнення; ширина — через `resizeMode: cover` (край до краю). */
    const photoScaleY = 1.12;
    const photoStretchLiftY = Math.round(photoH * 0.011);
    /** Як у пам’ятках — без зсуву вниз у зону тексту. */
    const photoLiftUpPx = Math.round(screenH * 0.016);
  /**
   * `cover` за замовчуванням центрує вертикально — зсуваємо кадр трохи вгору (translateY < 0),
   * щоб у вікні лишалась нижня частина знімка (передній план / основа).
   * Помірний зсув — низ макету видно без зайвого «підтягування» вгору.
   */
    const photoCoverBottomBiasPx = -Math.round(Math.max(30, screenH * 0.04));
    const fadeH = Math.round(
      Math.min(screenH * 0.38, Math.max(screenW * 0.52, screenH * 0.26)),
    );
    /** Android, скан: дві смуги Rectangle 37 у низу кадру (усі мови). */
    const fadeStripCount = Platform.OS === 'android' ? 2 : 0;
    const fadeStripStep = Math.round(
      Math.max(14, Math.min(44, fadeH * 0.19)),
    );
    /** Межа фото / чорного: смуги Rectangle 37. */
    const fadeStripBaseLowerPx = Math.round(screenH * 0.168);
    /** Друга смуга трохи вище за першу (перша лишається як є). */
    const fadeStripSecondExtraUpPx = Math.round(Math.max(10, screenH * 0.016));
    return {
      textReserve,
      photoH,
      fadeH,
      topBleed,
      photoTranslateY,
      photoScaleY,
      photoStretchLiftY,
      photoLiftUpPx,
      photoCoverBottomBiasPx,
      fadeStripCount,
      fadeStripStep,
      fadeStripBaseLowerPx,
      fadeStripSecondExtraUpPx,
      androidScanImageClipExtendBottomPx,
    };
  }, [isScanSlide, screenH, screenW, onboardPixelTuningMobile]);

  useEffect(() => {
    contentOpacity.setValue(1);
  }, [step, contentOpacity]);

  const scanHeroResolved = useMemo(() => Image.resolveAssetSource(SCAN_SLIDE_HERO), []);

  /** Як `resizeMode: cover` у зоні скану — для позицій ScanHeroLemonCorners поверх фото. */
  const scanPhotoCoverFrame = useMemo(() => {
    if (!isScanSlide || !scanBgLayout) return null;
    const nw = scanHeroResolved.width;
    const nh = scanHeroResolved.height;
    const wrapW = scanLayoutFullWidthPx;
    const wrapH =
      scanBgLayout.photoH + (scanBgLayout.androidScanImageClipExtendBottomPx || 0);
    if (!nw || !nh) {
      return { ox: 0, oy: 0, dispW: wrapW, dispH: wrapH };
    }
    const scale = Math.max(wrapW / nw, wrapH / nh);
    const dispW = nw * scale;
    const dispH = nh * scale;
    const ox = (wrapW - dispW) / 2;
    const oy = (wrapH - dispH) / 2;
    return { ox, oy, dispW, dispH };
  }, [isScanSlide, scanBgLayout, scanLayoutFullWidthPx, scanHeroResolved]);

  /** Зсув зображення скану (як transform на Image) — для позиції скріма. */
  const scanPhotoImageTranslateY = useMemo(() => {
    if (!isScanSlide || !scanBgLayout) return 0;
    return (
      scanBgLayout.photoTranslateY -
      scanBgLayout.photoStretchLiftY -
      scanBgLayout.photoLiftUpPx -
      onboardHeroPhotoLiftUpPx +
      iosScanSlideHeroExtraNudgeDownPx +
      iosDeScanHeroExtraNudgeDownPx +
      scanBgLayout.photoCoverBottomBiasPx +
      androidOnboardHeroImageExtraDownPx +
      androidScanSlideHeroExtraDownPx +
      androidScanSlidePhotoLiftUpPx +
      onboardLongTitleHeroLiftPx +
      androidScanHeroExtraLiftEnUkDePx +
      androidEnScanHeroBonusLiftPx +
      androidUkScanHeroBonusLiftPx +
      androidEsScanHeroExtraLiftPx +
      androidLtScanHeroExtraLiftPx +
      androidLvScanHeroExtraLiftPx +
      androidDeScanHeroExtraLiftPx +
      androidPlScanHeroExtraLiftPx +
      scanSlideUniversalPhotoLiftPx +
      scanSlidePhotoPageLowerPx +
      androidHyNlScanHeroExtraLiftPx +
      androidHyScanAndroidOnlyExtraLiftPx +
      androidScanAndroidPhotoPushDownPx +
      androidDeScanPhotoPushDownPx
    );
  }, [
    isScanSlide,
    scanBgLayout,
    onboardHeroPhotoLiftUpPx,
    iosScanSlideHeroExtraNudgeDownPx,
    iosDeScanHeroExtraNudgeDownPx,
    androidOnboardHeroImageExtraDownPx,
    androidScanSlideHeroExtraDownPx,
    androidScanSlidePhotoLiftUpPx,
    onboardLongTitleHeroLiftPx,
    androidScanHeroExtraLiftEnUkDePx,
    androidEnScanHeroBonusLiftPx,
    androidUkScanHeroBonusLiftPx,
    androidEsScanHeroExtraLiftPx,
    androidLtScanHeroExtraLiftPx,
    androidLvScanHeroExtraLiftPx,
    androidDeScanHeroExtraLiftPx,
    androidPlScanHeroExtraLiftPx,
    scanSlideUniversalPhotoLiftPx,
    scanSlidePhotoPageLowerPx,
    androidHyNlScanHeroExtraLiftPx,
    androidHyScanAndroidOnlyExtraLiftPx,
    androidScanAndroidPhotoPushDownPx,
    androidDeScanPhotoPushDownPx,
  ]);

  /** Висота зони фото скану (мобільний — з подовженням вниз під bleed кліпу). */
  const scanHeroInnerClipH = useMemo(() => {
    if (!isScanSlide || !scanBgLayout) return null;
    return scanBgLayout.photoH + (scanBgLayout.androidScanImageClipExtendBottomPx || 0);
  }, [isScanSlide, scanBgLayout]);

  /**
   * Нижня межа кліпу героя в координатах екрана (y зверху).
   * Верхній padding зони копії = відступ до цієї межі + зазор, щоб текст не наїжджав на банер.
   */
  const overlayContentTopPad = r.insets.top + 8;
  const onboardCopyBannerClearancePx = Math.round(Math.max(12, screenH * 0.014));
  let onboardBannerBottomScreenY = null;
  if (isLandmarksSlide && landmarksBgLayout) {
    onboardBannerBottomScreenY =
      -landmarksBgLayout.topBleed -
      8 +
      landmarksBgLayout.photoH +
      landmarksScanHeroScrimClipBleedPx +
      landmarksSlideOnlyClipBleedExtraPx;
  } else if (isScanSlide && scanBgLayout && scanHeroInnerClipH != null) {
    onboardBannerBottomScreenY =
      -scanBgLayout.topBleed -
      8 +
      scanHeroInnerClipH +
      landmarksScanHeroScrimClipBleedPx;
  } else if (
    (isRouteSlide || isShareSlide || isFriendsSlide) &&
    routeShareFriendsScrimLayout
  ) {
    onboardBannerBottomScreenY =
      routeShareFriendsScrimLayout.outerTop + routeShareFriendsScrimLayout.outerH;
  }
  /** Компенсація від’ємного translateY на блоці копії (не змінює layout, але зсуває малюнок угору). */
  const scanCopyVisualUpCompensationPx = -Math.min(
    0,
    landmarksScanCopyVisualLiftPx +
      iosUkScanCopyNudgeUpPx +
      rsfCopyVisualLiftPx +
      androidHeroCopyExtraLiftPx,
  );
  const onboardCopyScrollTopReserveRaw =
    onboardBannerBottomScreenY != null
      ? Math.max(
          0,
          Math.round(
            onboardBannerBottomScreenY -
              overlayContentTopPad +
              onboardCopyBannerClearancePx,
          ),
        ) + scanCopyVisualUpCompensationPx
      : 0;
  /**
   * Android: «сирий» paddingTop часто > висоти зони `flex:1` (герой + компенсація translateY).
   * Тоді у внутрішнього View не лишається місця під колонку — текст не видно, футер лишається.
   */
  const onboardCopyInnerPadBottomPx =
    ONBOARD_COPY_BOTTOM_SAFE_PX + overflowScrollReliefBottomPx;
  const onboardCopyMaxTopReserveAndroidPx =
    onboardPixelTuningMobile && !isFinalBrandSlide
      ? Math.max(
          0,
          Math.round(
            screenH -
              overlayContentTopPad -
              r.bottomPadding -
              onboardFooterExtraBottomPx -
              Math.max(168, screenH * 0.21) -
              onboardCopyInnerPadBottomPx -
              Math.max(128, screenH * 0.168),
          ),
        )
      : Number.POSITIVE_INFINITY;
  const onboardCopyScrollTopReservePx = Math.min(
    onboardCopyScrollTopReserveRaw,
    onboardCopyMaxTopReserveAndroidPx,
  );

  const goNextOrAuth = () => {
    if (isTransitioning || advanceLockRef.current) return;
    advanceLockRef.current = true;

    if (step >= TOTAL_STEPS - 1) {
      setIsTransitioning(true);
      Animated.timing(contentOpacity, {
        toValue: 0,
        duration: FADE_OUT_MS,
        easing: FADE_OUT_EASING,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) {
          setIsTransitioning(false);
          advanceLockRef.current = false;
          return;
        }
        InteractionManager.runAfterInteractions(() => {
          void (async () => {
            await setOnboardingSlidesSeenFlag();
            navigation.reset({
              index: 0,
              routes: [
                PREVIEW_SELECT_COUNTRY_BEFORE_REGISTRATION
                  ? {
                      name: 'SelectCountry',
                      params: { language: lang, previewBeforeAuth: true },
                    }
                  : { name: 'BackendAuth' },
              ],
            });
            setIsTransitioning(false);
            advanceLockRef.current = false;
          })();
        });
      });
      return;
    }

    setIsTransitioning(true);
    setStep((s) => s + 1);
    contentOpacity.setValue(1);
    requestAnimationFrame(() => {
      setIsTransitioning(false);
      advanceLockRef.current = false;
    });
  };

  const goNextOrAuthRef = useRef(goNextOrAuth);
  goNextOrAuthRef.current = goNextOrAuth;

  /**
   * Горизонтальний свайп: жест «листає справа наліво» (палець рухається вліво, dx < 0) —
   * наступний слайд. Назад по свайпу не перходимо.
   */
  const onboardingPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.05,
        onMoveShouldSetPanResponderCapture: (_, g) =>
          Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 1.12,
        onPanResponderTerminationRequest: () => true,
        onPanResponderRelease: (_, g) => {
          const threshold = 52;
          const vThreshold = 0.32;
          if (g.dx < -threshold || g.vx < -vThreshold) {
            goNextOrAuthRef.current();
          }
        },
      }),
    [],
  );

  const onCtaPressIn = () => {
    Animated.timing(ctaPressAnim, {
      toValue: 1,
      duration: 90,
      useNativeDriver: true,
    }).start();
  };

  const onCtaPressOut = () => {
    Animated.timing(ctaPressAnim, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start();
  };

  /** Менший зсув — нижній шар не виглядає як окрема товста «тінь». */
  const ctaFrontTranslateY = ctaPressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-3, 0],
  });

  const lemonGlow = ONBOARD_LEMON_GLOWS[step] ?? ONBOARD_LEMON_GLOWS[0];

  const skipFooterEl = (
    <Animated.View
      style={[
        styles.onboardFooter,
        {
          width: '100%',
          maxWidth: skipCtaMaxWidth,
          alignSelf: 'center',
          opacity: contentOpacity,
        },
      ]}
    >
      <View style={styles.dots} pointerEvents="none">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <View
            key={i}
            style={[styles.dot, i <= step ? styles.dotPassed : { backgroundColor: DOT_INACTIVE }]}
          />
        ))}
      </View>
      <Pressable
        onPress={goNextOrAuth}
        onPressIn={onCtaPressIn}
        onPressOut={onCtaPressOut}
        disabled={isTransitioning}
        style={styles.ctaOuter}
        android_ripple={rippleOnDarkSurface}
        accessibilityRole="button"
        accessibilityLabel={skipWord}
        accessibilityState={{ disabled: isTransitioning }}
      >
        <View style={styles.ctaBack} />
        <Animated.View
          style={[
            styles.ctaFront,
            {
              transform: [{ translateY: ctaFrontTranslateY }],
            },
          ]}
        >
          <View style={styles.skipRow}>
            <Text style={styles.skipText}>{skipWord}</Text>
            <Ionicons name="arrow-forward" size={skipArrowSize} color="#101010" accessible={false} />
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );

  /** Останній слайд: без крапок — лише «Продовжити». */
  const finalContinueFooterEl = (
    <Animated.View
      style={[
        styles.onboardFooter,
        styles.onboardFooterFinalContinue,
        {
          width: '100%',
          maxWidth: skipCtaMaxWidth,
          alignSelf: 'center',
          opacity: contentOpacity,
          zIndex: 200,
          elevation: onboardPixelTuningMobile ? 200 : 0,
        },
      ]}
    >
      <Pressable
        onPress={goNextOrAuth}
        onPressIn={onCtaPressIn}
        onPressOut={onCtaPressOut}
        disabled={isTransitioning}
        style={styles.ctaOuter}
        android_ripple={rippleOnDarkSurface}
        accessibilityRole="button"
        accessibilityLabel={continueWord}
        accessibilityState={{ disabled: isTransitioning }}
      >
        <View style={styles.ctaBack} />
        <Animated.View
          style={[
            styles.ctaFront,
            {
              transform: [{ translateY: ctaFrontTranslateY }],
            },
          ]}
        >
          <View style={styles.skipRow}>
            <Text style={styles.skipText}>{continueWord}</Text>
            <Ionicons name="arrow-forward" size={skipArrowSize} color="#101010" accessible={false} />
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );

  return (
    <View
      style={[
        styles.root,
        (isRouteSlide || isFriendsSlide) && { backgroundColor: ROUTE_SLIDE_BG },
      ]}
      {...onboardingPanResponder.panHandlers}
    >
      {isFinalBrandSlide ? (
        <View
          pointerEvents="box-none"
          style={[styles.finalSlideBackdrop, { width: screenW, height: screenH }]}
        >
          <View
            style={{
              width: screenW,
              marginTop: finalVideoBandTopOffset,
              zIndex: 1,
            }}
          >
            <View
              style={[
                styles.finalBrandHeroBand,
                {
                  width: screenW,
                  height: finalBrandHeroHeight,
                },
              ]}
            >
              <View
                pointerEvents="none"
                style={{
                  width: screenW,
                  height: finalOnboardImageHeight,
                  position: 'relative',
                  overflow: 'visible',
                  backgroundColor: '#000000',
                  zIndex: 1,
                }}
              >
                <Image
                  source={FINAL_ONBOARD_BRAND_HERO}
                  style={{
                    width: screenW,
                    height: finalOnboardImageHeight,
                    transform: [
                      {
                        translateY:
                          -onboardHeroPhotoLiftUpPx +
                          androidOnboardHeroImageExtraDownPx,
                      },
                    ],
                  }}
                  resizeMode="cover"
                  {...(onboardPixelTuningMobile ? { resizeMethod: 'resize' } : {})}
                  accessibilityIgnoresInvertColors
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel={slide.title || 'KRAÏNA'}
                />
              </View>
              <View
                pointerEvents="none"
                style={[
                  styles.finalBrandShadowGradientWrap,
                  {
                    width: screenW + 32,
                    left: -16,
                    height: Math.round(Math.min(158, screenH * 0.175)),
                    bottom: taglineBlockH - 36,
                    zIndex: 24,
                    elevation: onboardPixelTuningMobile ? 24 : 0,
                  },
                ]}
              >
                <LinearGradient
                  colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.2)']}
                  locations={[0, 0.62, 1]}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
                <LinearGradient
                  colors={[
                    'rgba(0,0,0,0)',
                    'rgba(0,0,0,0.22)',
                    'rgba(0,0,0,0.62)',
                    '#000000',
                    '#000000',
                  ]}
                  locations={[0, 0.22, 0.52, 0.88, 1]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
              </View>
              {Array.from({ length: 4 }, (_, finalRectI) => (
                <View
                  key={`final-onboard-rect36-${finalRectI}`}
                  pointerEvents="none"
                  collapsable={onboardPixelTuningMobile ? false : undefined}
                  style={[
                    styles.landmarksBottomFadeWrap,
                    styles.finalBrandRect36Strip,
                    {
                      left: heroBottomFadeStripLeftPx,
                      width: heroBottomFadeStripWidthPx,
                      height: Math.round(
                        Math.max(48, Math.min(84, screenH * 0.074)),
                      ),
                      bottom:
                        taglineBlockH -
                        98 +
                        finalRectI * 7 -
                        androidOnboardShadowStripExtraDownPx,
                      zIndex: 30 + finalRectI,
                      elevation:
                        onboardPixelTuningMobile ? 30 + finalRectI : 0,
                    },
                  ]}
                >
                  <DoubleRect37Strip
                    firstOpacity={0.12}
                    secondOpacity={0.09}
                    androidResize={onboardPixelTuningMobile}
                  />
                </View>
              ))}
              <View
                style={[
                  styles.finalBrandTaglineWrap,
                  styles.finalBrandTaglineWrapAboveStrips,
                  onboardPixelTuningMobile && {
                    transform: [
                      {
                        translateY: Math.round(
                          Math.max(12, screenH * 0.016),
                        ),
                      },
                    ],
                  },
                ]}
              >
                <View
                  style={[
                    styles.finalBrandTaglineVideoOuter,
                    {
                      height: finalTaglineVideoH,
                      width: Math.round(
                        Math.min(308, Math.round(screenW * 0.8)) * 0.92,
                      ),
                      /** Негативний відступ — відео заходить на колаж (трохи нижче за попередній варіант). */
                      marginTop:
                        14 - Math.round(Math.max(40, screenH * 0.048)),
                      zIndex: 101,
                      elevation: onboardPixelTuningMobile ? 101 : 0,
                    },
                  ]}
                >
                  <Video
                    source={FINAL_TAGLINE_ZOOM_VIDEO}
                    style={[
                      StyleSheet.absoluteFillObject,
                      { backgroundColor: 'transparent' },
                    ]}
                    videoStyle={{ backgroundColor: 'transparent' }}
                    resizeMode={ResizeMode.COVER}
                    shouldPlay
                    isLooping
                    isMuted
                    useNativeControls={false}
                    accessibilityLabel="KRAÏNA"
                    accessibilityIgnoresInvertColors
                  />
                </View>
                <Text
                  style={[
                    styles.finalVideoTaglineText,
                    {
                      fontSize: finalVideoTaglineSize,
                      lineHeight: finalVideoTaglineLineHeight,
                      /** Текст під анімацією: трохи нижче, ніж раніше (менше негативний margin). */
                      marginTop:
                        -Math.round(
                          Math.max(38, finalTaglineVideoH * 0.28),
                        ) +
                        12 +
                        onboardCopyShiftDownPx,
                      zIndex: 102,
                      elevation: onboardPixelTuningMobile ? 102 : 0,
                      paddingHorizontal: 8,
                    },
                  ]}
                  accessibilityRole="text"
                >
                  {slide.body}
                </Text>
              </View>
            </View>
            <View
              pointerEvents="none"
              style={{
                width: screenW,
                height: finalLowerVideoBandHeight,
                marginTop: finalLowerVideoGap,
                backgroundColor: '#000000',
              }}
            />
          </View>
        </View>
      ) : (
        <>
          <View
            style={[
              styles.bgSolid,
              { width: screenW, height: screenH },
              (isRouteSlide || isFriendsSlide) && { backgroundColor: ROUTE_SLIDE_BG },
            ]}
          />
          {isLandmarksSlide && landmarksBgLayout ? (
            <View
              style={[
                styles.landmarksPhotoClip,
                {
                  width: screenW,
                  height:
                    landmarksBgLayout.photoH +
                    landmarksScanHeroScrimClipBleedPx +
                    landmarksSlideOnlyClipBleedExtraPx,
                  top: -landmarksBgLayout.topBleed - 8,
                },
              ]}
            >
              <View
                pointerEvents="none"
                style={[
                  styles.landmarksPhotoImageClip,
                  {
                    width: screenW,
                    height: landmarksBgLayout.photoH,
                    zIndex: 0,
                    elevation: 0,
                  },
                ]}
              >
                <Image
                  source={LANDMARKS_SEARCH_BG}
                  style={[
                    styles.landmarksBgImage,
                    {
                      width: screenW,
                      height: landmarksBgLayout.photoH,
                      transform: [
                        { scale: landmarksBgLayout.photoZoomScale },
                        { translateY: landmarksBgLayout.photoImageTranslateY },
                      ],
                    },
                  ]}
                  resizeMode="contain"
                  {...(onboardPixelTuningMobile ? { resizeMethod: 'scale' } : {})}
                  accessibilityIgnoresInvertColors
                  accessible={false}
                />
              </View>
              {Array.from({ length: LANDMARKS_SCAN_HERO_SCRIM_COUNT }, (_, scrimI) => {
                const rawBase =
                  (landmarksHeroStripTop ??
                    Math.max(
                      0,
                      landmarksBgLayout.photoH -
                        landmarksHeroScrimH -
                        landmarksHeroStripLiftUpPx +
                        landmarksBgLayout.photoImageTranslateY,
                    )) +
                  landmarksSlideOnlyScrimNudgeDownPx -
                  iosDeLandmarksScrimNudgeUpPx -
                  androidDeLandmarksScrimNudgeUpPx -
                  nlLandmarksScrimNudgeUpPx -
                  esLandmarksScrimNudgeUpPx -
                  roLandmarksScrimNudgeUpPx -
                  itLandmarksScrimNudgeUpPx;
                const baseTop = Number.isFinite(rawBase) ? rawBase : 0;
                const rawTop = baseTop + scrimI * landmarksHeroScrimDupExtraDownPx;
                const top =
                  (Number.isFinite(rawTop) ? Math.max(0, rawTop) : 0) +
                  androidOnboardShadowStripExtraDownPx;
                return (
                  <View
                    key={`landmarks-hero-scrim-${scrimI}`}
                    pointerEvents="none"
                    collapsable={onboardPixelTuningMobile ? false : undefined}
                    style={[
                      styles.landmarksHeroBottomStrip,
                      {
                        width: landmarksRect37StripWidthPx,
                        left: landmarksRect37StripLeftPx,
                        top,
                        height: landmarksHeroScrimH,
                        zIndex: 10 + scrimI,
                        elevation: onboardPixelTuningMobile ? 4 + scrimI : 0,
                      },
                    ]}
                  >
                    <LinearGradient
                      colors={LANDMARKS_SCAN_HERO_SCRIM_GRADIENT_COLORS}
                      locations={LANDMARKS_SCAN_HERO_SCRIM_GRADIENT_LOCATIONS}
                      start={{ x: 0.5, y: 0 }}
                      end={{ x: 0.5, y: 1 }}
                      style={StyleSheet.absoluteFillObject}
                    />
                    <DoubleRect37Strip firstOpacity={1} secondOpacity={0.84} />
                  </View>
                );
              })}
              {onboardPixelTuningMobile
                ? Array.from({ length: 2 }, (_, androidRectI) => (
                    <View
                      key={`landmarks-android-rect-36-${androidRectI}`}
                      pointerEvents="none"
                      collapsable={false}
                      style={[
                        styles.landmarksBottomFadeWrap,
                        {
                          width: landmarksRect37StripWidthPx,
                          left: landmarksRect37StripLeftPx,
                          height: 76,
                          top:
                            Math.max(
                              0,
                              landmarksBgLayout.photoH -
                                74 +
                                androidRectI * 6 +
                                Math.round(Math.max(36, screenH * 0.038)) -
                                androidDeLandmarksScrimNudgeUpPx +
                                (lang === 'lt'
                                  ? iosLtLandmarksScrimNudgeUpPx +
                                    ltLandmarksImageNudgeDownPx +
                                    androidLtLandmarksImageExtraLiftPx
                                  : lang === 'lv'
                                    ? iosLvLandmarksScrimNudgeUpPx +
                                      lvLandmarksImageNudgeDownPx
                                    : lang === 'it'
                                      ? androidItLandmarksImageNudgeDownPx
                                      : 0) + androidHyLandmarksHeroLiftPx,
                            ) + androidOnboardShadowStripExtraDownPx,
                          zIndex: 14 + androidRectI,
                          elevation: 8 + androidRectI,
                        },
                      ]}
                    >
                      <DoubleRect37Strip firstOpacity={1} secondOpacity={0.84} />
                    </View>
                  ))
                : null}
            </View>
          ) : null}
          {isScanSlide && scanBgLayout && scanHeroInnerClipH != null ? (
            <View
              style={[
                styles.landmarksPhotoClip,
                {
                  width: scanHeroClipWidthPx,
                  left: scanHeroClipLeftPx,
                  height: scanHeroInnerClipH + landmarksScanHeroScrimClipBleedPx,
                  top: -scanBgLayout.topBleed - 8,
                },
              ]}
            >
              <View
                pointerEvents="none"
                style={[
                  styles.landmarksPhotoImageClip,
                  {
                    width: scanLayoutFullWidthPx,
                    left: scanHeroShadowHorizontalBleedPx,
                    height: scanHeroInnerClipH,
                    zIndex: 0,
                    elevation: 0,
                  },
                ]}
              >
                <Image
                  source={SCAN_SLIDE_HERO}
                  style={[
                    styles.landmarksBgImage,
                    {
                      width: scanLayoutFullWidthPx,
                      left: 0,
                      height: scanHeroInnerClipH,
                      zIndex: 0,
                      transform: [
                        { scaleY: scanBgLayout.photoScaleY },
                        { translateY: scanPhotoImageTranslateY },
                      ],
                    },
                  ]}
                  resizeMode="cover"
                  {...(onboardPixelTuningMobile ? { resizeMethod: 'scale' } : {})}
                  accessibilityIgnoresInvertColors
                  accessible={false}
                />
              </View>
              {Array.from({ length: LANDMARKS_SCAN_HERO_SCRIM_COUNT }, (_, scrimI) => {
                const rawBase =
                  Math.max(
                    0,
                    scanHeroInnerClipH -
                      landmarksHeroScrimH -
                      landmarksHeroStripLiftUpPx +
                      scanPhotoImageTranslateY,
                  ) +
                  androidOnboardShadowStripExtraDownPx +
                  scanSlideShadowOffsetDownPx;
                const rawTop = rawBase + scrimI * landmarksHeroScrimDupExtraDownPx;
                const top = Number.isFinite(rawTop) ? Math.max(0, rawTop) : 0;
                return (
                  <View
                    key={`scan-hero-scrim-${scrimI}`}
                    pointerEvents="none"
                    collapsable={onboardPixelTuningMobile ? false : undefined}
                    style={[
                      styles.landmarksHeroBottomStrip,
                      {
                        width: scanHeroClipWidthPx,
                        left: 0,
                        top,
                        height: landmarksHeroScrimH,
                        zIndex: 10 + scrimI,
                        elevation: onboardPixelTuningMobile ? 4 + scrimI : 0,
                      },
                    ]}
                  >
                    <LinearGradient
                      colors={LANDMARKS_SCAN_HERO_SCRIM_GRADIENT_COLORS}
                      locations={LANDMARKS_SCAN_HERO_SCRIM_GRADIENT_LOCATIONS}
                      start={{ x: 0.5, y: 0 }}
                      end={{ x: 0.5, y: 1 }}
                      style={StyleSheet.absoluteFillObject}
                    />
                    <DoubleRect37Strip
                      firstOpacity={1}
                      secondOpacity={0.84}
                      androidResize={onboardPixelTuningMobile}
                    />
                  </View>
                );
              })}
              {onboardPixelTuningMobile
                ? Array.from({ length: 2 }, (_, androidRectI) => (
                    <View
                      key={`scan-android-rect-36-${androidRectI}`}
                      pointerEvents="none"
                      collapsable={false}
                      style={[
                        styles.landmarksBottomFadeWrap,
                        {
                          width: scanHeroClipWidthPx,
                          left: 0,
                          height: 76,
                          top:
                            Math.max(
                              0,
                              scanHeroInnerClipH -
                                74 +
                                androidRectI * 6 +
                                Math.round(Math.max(36, screenH * 0.038)),
                            ) +
                            androidOnboardShadowStripExtraDownPx +
                            scanSlideShadowOffsetDownPx +
                            androidHyScanAndroidOnlyExtraLiftPx,
                          zIndex: 14 + androidRectI,
                          elevation: 8 + androidRectI,
                        },
                      ]}
                    >
                      <DoubleRect37Strip
                        firstOpacity={1}
                        secondOpacity={0.84}
                        androidResize={onboardPixelTuningMobile}
                      />
                    </View>
                  ))
                : null}
              {scanPhotoCoverFrame ? (
                <View
                  pointerEvents="none"
                  accessible={false}
                  collapsable={false}
                  style={{
                    position: 'absolute',
                    left: scanHeroShadowHorizontalBleedPx,
                    top: 0,
                    width: scanLayoutFullWidthPx,
                    height: scanHeroInnerClipH,
                    zIndex: 22,
                    elevation: onboardPixelTuningMobile ? 22 : 0,
                  }}
                >
                  <ScanHeroLemonCorners
                    containFrame={scanPhotoCoverFrame}
                    screenW={scanLayoutFullWidthPx}
                    imageTranslateY={scanPhotoImageTranslateY}
                    topNudgeDownPx={
                      Math.max(64, Math.round(screenH * 0.07)) +
                      Math.round((r.insets?.top ?? 0) * 0.85)
                    }
                    frameNudgeUpPx={38}
                    bottomCornersExtraUpPx={36}
                    topCornersExtraDownPx={14}
                    showTopCorners={false}
                    showBottomCorners
                  />
                </View>
              ) : null}
            </View>
          ) : null}
          {isLandmarksSlide || isScanSlide ? null : isRouteSlide ||
          isShareSlide ||
          isFriendsSlide ? (
            routeShareFriendsScrimLayout ? (
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: routeShareFriendsScrimLayout.outerLeft,
                  top: routeShareFriendsScrimLayout.outerTop,
                  width: routeShareFriendsScrimLayout.outerW,
                  height: routeShareFriendsScrimLayout.outerH,
                  backgroundColor: 'transparent',
                  zIndex: 1,
                  overflow: 'visible',
                }}
              >
                <View
                  style={{
                    width: routeShareFriendsScrimLayout.outerW,
                    height: routeShareFriendsScrimLayout.heroH,
                    overflow: 'visible',
                  }}
                >
                  <Image
                    source={
                      isRouteSlide
                        ? ROUTE_FIND_ILLUSTRATION
                        : isShareSlide
                          ? SHARE_ROUTES_ILLUSTRATION
                          : FRIENDS_SLIDE_HERO
                    }
                    style={{
                      width: screenW,
                      height: routeShareFriendsScrimLayout.heroH,
                      transform: [
                        { scale: 1.17 },
                        { scaleX: 1.03 },
                        { translateX: -6 },
                        {
                          translateY:
                            Math.round(screenH * 0.016) -
                            rsfHeroImageNudgeUpPx -
                            onboardHeroPhotoLiftUpPx -
                            rsfHeroSharedVerticalNudgeUpPx +
                            androidOnboardHeroImageExtraDownPx -
                            androidRsfHeroImageExtraLiftUpPx +
                            androidShareFriendsHeroExtraDownPx +
                            androidShareSlideHeroExtraDownPx +
                            androidEnShareHeroExtraLiftPx +
                            androidUkShareHeroExtraLiftPx +
                            androidDeShareHeroExtraLiftPx +
                            androidPlShareHeroExtraLiftPx +
                            androidNlShareHeroExtraLiftPx +
                            androidHyShareHeroExtraLiftPx +
                            androidItShareHeroExtraDownPx +
                            androidRoShareHeroExtraDownPx +
                            iosEnDeShareFriendsHeroExtraDownPx +
                            onboardLongTitleHeroLiftPx +
                            androidEnRouteHeroExtraLiftPx +
                            androidDeRouteHeroExtraLiftPx +
                            androidUkRouteHeroExtraLiftPx +
                            androidPlRouteHeroExtraLiftPx +
                            androidNlRouteHeroExtraLiftPx +
                            androidEsRouteHeroExtraLiftPx +
                            androidItRouteHeroExtraLiftPx +
                            androidHyRouteHeroExtraLiftPx +
                            androidRouteHeroExtraDownPx +
                            androidEnFriendsHeroExtraDownPx +
                            androidDeFriendsHeroExtraDownPx +
                            androidItFriendsHeroExtraDownPx +
                            androidUkFriendsHeroExtraDownPx +
                            androidPlFriendsHeroExtraDownPx +
                            androidRoFriendsHeroExtraDownPx +
                            androidNlFriendsHeroExtraDownPx +
                            androidEsFriendsHeroExtraDownPx +
                            androidLtFriendsHeroExtraDownPx +
                            androidLvFriendsHeroExtraDownPx +
                            iosDeShareHeroExtraDownPx +
                            iosDeFriendsHeroExtraDownPx +
                            iosPlFriendsHeroExtraDownPx,
                        },
                      ],
                    }}
                    resizeMode="cover"
                    {...(onboardPixelTuningMobile ? { resizeMethod: 'resize' } : {})}
                    accessibilityIgnoresInvertColors
                    accessible={false}
                  />
                </View>
                {Array.from(
                  {
                    length: isRouteSlide ? ROUTE_RSF_SCRIM_COUNT : RSF_HERO_SCRIM_COUNT,
                  },
                  (_, scrimI) => {
                    const lowerNudgePx = isRouteSlide
                      ? routeRsfScrimLowerNudgePx
                      : landmarksHeroScrimLowerNudgePx;
                    const rawTop =
                      routeShareFriendsScrimLayout.scrimBaseTop +
                      lowerNudgePx +
                      scrimI * landmarksHeroScrimDupExtraDownPx;
                    const top =
                      (Number.isFinite(rawTop) ? Math.max(0, rawTop) : 0) +
                      androidOnboardShadowStripExtraDownPx +
                      androidUkFriendsScrimExtraDownPx;
                    const gradColors = isRouteSlide
                      ? ROUTE_RSF_SCRIM_GRADIENT_COLORS
                      : RSF_HERO_SCRIM_GRADIENT_COLORS;
                    const gradLocs = isRouteSlide
                      ? ROUTE_RSF_SCRIM_GRADIENT_LOCATIONS
                      : RSF_HERO_SCRIM_GRADIENT_LOCATIONS;
                    const rectStripOpacity = 1;
                    return (
                      <View
                        key={`rsf-hero-scrim-${scrimI}`}
                        pointerEvents="none"
                        collapsable={onboardPixelTuningMobile ? false : undefined}
                        style={[
                          styles.landmarksHeroBottomStrip,
                          {
                            width: routeShareFriendsScrimLayout.heroFadeWidthPx,
                            left: routeShareFriendsScrimLayout.heroFadeLeftPx,
                            top,
                            height: landmarksHeroScrimH,
                            zIndex: 10 + scrimI,
                            elevation: onboardPixelTuningMobile ? 4 + scrimI : 0,
                          },
                        ]}
                      >
                        <LinearGradient
                          colors={gradColors}
                          locations={gradLocs}
                          start={{ x: 0.5, y: 0 }}
                          end={{ x: 0.5, y: 1 }}
                          style={StyleSheet.absoluteFillObject}
                        />
                        <DoubleRect37Strip
                          firstOpacity={rectStripOpacity}
                          secondOpacity={rectStripOpacity * 0.84}
                          androidResize={onboardPixelTuningMobile}
                        />
                      </View>
                    );
                  },
                )}
                {onboardPixelTuningMobile
                  ? Array.from(
                      { length: isRouteSlide ? 2 : 4 },
                      (_, androidRectI) => (
                        <View
                          key={`rsf-android-rect-36-${androidRectI}`}
                          pointerEvents="none"
                          collapsable={false}
                          style={[
                            styles.landmarksBottomFadeWrap,
                            {
                              width: routeShareFriendsScrimLayout.heroFadeWidthPx,
                              left: routeShareFriendsScrimLayout.heroFadeLeftPx,
                              height: 76,
                              top: Math.max(
                                0,
                                routeShareFriendsScrimLayout.heroH -
                                  74 +
                                  androidRectI * 6 +
                                  (isRouteSlide
                                    ? routeRsfScrimLowerNudgePx
                                    : landmarksHeroScrimLowerNudgePx) -
                                  androidRsfHeroImageExtraLiftUpPx +
                                  androidShareFriendsHeroExtraDownPx +
                                  androidUkFriendsScrimExtraDownPx +
                                  androidDeFriendsHeroExtraDownPx +
                                  androidItFriendsHeroExtraDownPx +
                                  androidPlFriendsHeroExtraDownPx +
                                  androidRoFriendsHeroExtraDownPx +
                                  androidNlFriendsHeroExtraDownPx +
                                  androidEsFriendsHeroExtraDownPx +
                                  androidLtFriendsHeroExtraDownPx +
                                  androidLvFriendsHeroExtraDownPx +
                                  androidRouteHeroExtraDownPx +
                                  androidEnRouteHeroExtraLiftPx +
                                  androidDeRouteHeroExtraLiftPx +
                                  androidUkRouteHeroExtraLiftPx +
                                  androidPlRouteHeroExtraLiftPx +
                                  androidNlRouteHeroExtraLiftPx +
                                  androidEsRouteHeroExtraLiftPx +
                                  androidItRouteHeroExtraLiftPx +
                                  androidHyRouteHeroExtraLiftPx +
                                  androidShareSlideHeroExtraDownPx +
                                  androidEnShareHeroExtraLiftPx +
                                  androidUkShareHeroExtraLiftPx +
                                  androidDeShareHeroExtraLiftPx +
                                  androidPlShareHeroExtraLiftPx +
                                  androidNlShareHeroExtraLiftPx +
                                  androidHyShareHeroExtraLiftPx +
                                  androidItShareHeroExtraDownPx +
                                  androidRoShareHeroExtraDownPx,
                              ),
                              zIndex: 18 + androidRectI,
                              elevation: 8 + androidRectI,
                            },
                          ]}
                        >
                          <DoubleRect37Strip firstOpacity={1} secondOpacity={0.84} />
                        </View>
                      ),
                    )
                  : null}
              </View>
            ) : null
          ) : (
            <LinearGradient
              colors={lemonGlow.colors}
              locations={lemonGlow.locations}
              start={lemonGlow.start}
              end={lemonGlow.end}
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: screenW,
                height: screenH,
                zIndex: 1,
              }}
            />
          )}
        </>
      )}
      <View
        pointerEvents="box-none"
        style={[
          styles.overlay,
          isFinalBrandSlide && styles.overlayFinalBrand,
          !isFinalBrandSlide && styles.overlayWithFixedCopy,
          /**
           * Android: у героя смуги з elevation до ~22 — без elevation оверлея копія малюється ПІД ними
           * (видно лише футер). Фінальний слайд не чіпаємо — там свій z-стек.
           */
          !isFinalBrandSlide &&
            onboardPixelTuningMobile &&
            styles.overlayHeroAndroidAboveHeroDecor,
          {
            paddingTop: r.insets.top + 8,
            paddingBottom: r.bottomPadding + onboardFooterExtraBottomPx,
            paddingHorizontal: r.horizontalPadding,
          },
        ]}
      >
        {isFinalBrandSlide ? (
          finalContinueFooterEl
        ) : (
          <>
            <View
              style={[
                styles.onboardCopyScroll,
                (isLandmarksSlide ||
                  isScanSlide ||
                  isRouteSlide ||
                  isShareSlide ||
                  isFriendsSlide) &&
                  styles.onboardCopyScrollLandmarks,
              ]}
            >
              <View
                style={[
                  styles.onboardCopyScrollInner,
                  (isLandmarksSlide || isScanSlide) &&
                    styles.onboardCopyScrollInnerLandmarks,
                  {
                    paddingTop: onboardCopyScrollTopReservePx,
                    paddingBottom: onboardCopyScrollInnerPaddingBottomPx,
                  },
                ]}
              >
              <Animated.View
                style={[
                  styles.column,
                  (isLandmarksSlide ||
                    isScanSlide ||
                    isRouteSlide ||
                    isShareSlide ||
                    isFriendsSlide) &&
                    styles.columnScanCopy,
                  {
                    width: '100%',
                    maxWidth: columnMaxWidth,
                    alignSelf: 'center',
                    opacity: contentOpacity,
                    ...((isRouteSlide ||
                      isShareSlide ||
                      isFriendsSlide) && {
                      zIndex: 10,
                      /**
                       * iOS: elevation 0 — без зайвої тіні. Android: 0 тут перебивав columnScanCopy
                       * і залишав копію ПІД смугами героя.
                       */
                      ...(onboardPixelTuningMobile
                        ? { elevation: 34 }
                        : { elevation: 0 }),
                    }),
                  },
                ]}
              >
                {isLandmarksSlide || isScanSlide ? (
                  <>
                    <View
                      collapsable={onboardPixelTuningMobile ? false : undefined}
                      style={[
                        styles.landmarksTextBlock,
                        isScanSlide && styles.landmarksTextBlockScanBelowPhoto,
                        onboardPlTitleBodyGapStyle,
                        onboardPixelTuningMobile && styles.landmarksTextBlockAndroidElevated,
                        {
                          transform: [
                            {
                              translateY:
                                onboardCopyBlockTranslateY +
                                landmarksScanCopyVisualLiftPx +
                                iosUkScanCopyNudgeUpPx +
                                androidHeroCopyExtraLiftPx +
                                onboardHeroCopyNudgeDownPx,
                            },
                          ],
                        },
                      ]}
                    >
                      <Text
                        accessibilityRole="header"
                        accessibilityLabel={slide.title}
                        style={[
                          styles.titleLandmarksPlain,
                          {
                            fontSize: leftAccentTitleSize,
                            lineHeight: Math.round(leftAccentTitleSize * 1.22),
                          },
                          styles.onboardRouteShareFriendsTextNoShadow,
                          isLandmarksSlide && {
                            marginTop: onboardPlTitleTopAfterHeroPx,
                          },
                          lang === 'pl' && isScanSlide && {
                            marginTop: onboardPlTitleTopAfterHeroPx,
                          },
                        ]}
                      >
                        {onboardingTitleDisplayed}
                      </Text>
                      <Text
                        style={[
                          styles.bodyLandmarksPlain,
                          {
                            fontSize: leftAccentBodySize,
                            lineHeight: Math.round(leftAccentBodySize * 1.55),
                          },
                          styles.onboardRouteShareFriendsTextNoShadow,
                        ]}
                      >
                        {isScanSlide
                          ? slide.body.replace(/\s*\n+\s*/g, ' ').trim()
                          : slide.body}
                      </Text>
                    </View>
                  </>
                ) : isRouteSlide || isShareSlide || isFriendsSlide ? (
                  <View
                    collapsable={onboardPixelTuningMobile ? false : undefined}
                    style={[
                      styles.landmarksTextBlock,
                      onboardPlTitleBodyGapStyle,
                      onboardRoShareTitleBodyGapStyle,
                      (isRouteSlide ||
                        isShareSlide ||
                        isFriendsSlide) && {
                        zIndex: 10,
                        elevation: onboardPixelTuningMobile ? 12 : 0,
                      },
                      onboardPixelTuningMobile && styles.landmarksTextBlockAndroidElevated,
                      {
                        transform: [
                          {
                            translateY:
                              onboardCopyBlockTranslateY +
                              rsfCopyVisualLiftPx +
                              androidHeroCopyExtraLiftPx +
                              onboardHeroCopyNudgeDownPx +
                              androidItShareCopyLiftPx +
                              androidRoShareCopyLiftPx +
                              iosDeRouteCopyNudgeDownPx +
                              iosDeShareCopyNudgeDownPx +
                              (isFriendsSlide
                                ? friendsCopyOnlyExtraDownPx
                                : 0) -
                              ONBOARD_DOTS_ROW_MARGIN_PX,
                          },
                        ],
                      },
                    ]}
                  >
                    <Text
                      accessibilityRole="header"
                      accessibilityLabel={slide.title}
                      style={[
                        styles.titleLandmarksPlain,
                        {
                          fontSize: leftAccentTitleSize,
                          lineHeight: Math.round(leftAccentTitleSize * 1.22),
                        },
                        styles.onboardRouteShareFriendsTextNoShadow,
                        lang === 'pl' && {
                          marginTop: onboardPlTitleTopAfterHeroPx,
                        },
                        isAndroidItShareSlide && {
                          includeFontPadding: false,
                          marginBottom: -4,
                        },
                        /**
                         * Android + ro + share: typewriter + flex-end — фіксована висота під 2 рядки,
                         * щоб блок не стрибав; щільніший низ до body.
                         */
                        isAndroidRoShareSlide && {
                          minHeight: Math.round(leftAccentTitleSize * 1.22 * 2),
                          marginBottom: -6,
                        },
                      ]}
                      {...(isAndroidRoShareSlide
                        ? { textBreakStrategy: 'simple' }
                        : {})}
                    >
                      {onboardingTitleDisplayed}
                    </Text>
                    <Text
                      style={[
                        styles.bodyLandmarksPlain,
                        {
                          fontSize: leftAccentBodySize,
                          lineHeight: Math.round(leftAccentBodySize * 1.55),
                        },
                        styles.onboardRouteShareFriendsTextNoShadow,
                        isAndroidItShareSlide && {
                          includeFontPadding: false,
                          marginTop: -2,
                        },
                        isAndroidRoShareSlide && {
                          marginTop: -4,
                        },
                      ]}
                      {...(isAndroidRoShareSlide
                        ? { textBreakStrategy: 'simple' }
                        : {})}
                    >
                      {isRouteSlide || isFriendsSlide
                        ? slide.body.replace(/\s*\n+\s*/g, ' ').trim()
                        : slide.body}
                    </Text>
                  </View>
                ) : (
                  <LemonBannerGlow
                    key={`copy-${step}`}
                    style={{ alignSelf: 'center', width: '100%', maxWidth: 341 }}
                    contentStyle={[
                      styles.titleBodyBlock,
                      onboardPlTitleBodyGapStyle,
                      {
                        transform: [
                          { translateY: onboardCopyBlockTranslateY },
                        ],
                      },
                    ]}
                    borderRadius={18}
                  >
                    <View>
                    <Text
                      accessibilityRole="header"
                      accessibilityLabel={slide.title}
                      style={[
                        styles.titleLeftAccent,
                        {
                          fontSize: leftAccentTitleSize,
                          lineHeight: Math.round(leftAccentTitleSize * 1.22),
                        },
                      ]}
                    >
                      {onboardingTitleDisplayed}
                    </Text>
                    <Text
                      style={[
                        styles.bodyLeftAccent,
                        {
                          fontSize: leftAccentBodySize,
                          lineHeight: Math.round(leftAccentBodySize * 1.55),
                        },
                      ]}
                    >
                      {slide.body}
                    </Text>
                    </View>
                  </LemonBannerGlow>
                )}
              </Animated.View>
              </View>
            </View>
            {skipFooterEl}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
    overflow: 'visible',
  },
  bgSolid: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: '#000000',
  },
  landmarksPhotoClip: {
    position: 'absolute',
    top: 0,
    left: 0,
    overflow: 'visible',
    zIndex: 1,
  },
  /** Пам’ятки / скан: обрізати scale/translate зображення, щоб не заходило в зону тексту. */
  landmarksPhotoImageClip: {
    position: 'absolute',
    top: 0,
    left: 0,
    overflow: 'hidden',
    zIndex: 1,
  },
  landmarksBgImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1,
  },
  landmarksBottomFadeWrap: {
    position: 'absolute',
    bottom: 0,
    zIndex: 3,
    overflow: 'visible',
  },
  landmarksBottomFadeImage: {
    width: '100%',
    height: '100%',
  },
  /** Скрім (градієнт + PNG) у низу фото; без обрізання м’яких країв. */
  landmarksHeroBottomStrip: {
    position: 'absolute',
    overflow: 'visible',
  },
  landmarksTextBlock: {
    alignItems: 'flex-start',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 341,
    gap: 12,
    transform: [{ translateY: 10 }],
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  /** Android: окремий elevated-шар для копії (разом з виправленням elevation на батьківській колонці). */
  landmarksTextBlockAndroidElevated: {
    ...Platform.select({
      android: { elevation: 18 },
      ios: {},
    }),
  },
  /** Скан: текст у чорній смузі під фото (без додаткового зсуву на картинку). */
  landmarksTextBlockScanBelowPhoto: {
    marginTop: 0,
    transform: [{ translateY: 0 }],
  },
  /** Пам’ятки / скан: колонка над фото-шаром (iOS інакше накладає шари). */
  columnScanCopy: {
    zIndex: 2,
    ...Platform.select({
      ios: {},
      /** Окремий шар — підстраховка, якщо діти без elevation все ще під героєм. */
      android: { elevation: 28 },
    }),
  },
  titleLandmarksPlain: {
    fontWeight: '700',
    color: ACCENT,
    textAlign: 'left',
    letterSpacing: -0.2,
    width: '100%',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
    ...Platform.select({
      ios: {},
      android: { fontFamily: 'sans-serif', includeFontPadding: false },
    }),
  },
  bodyLandmarksPlain: {
    fontWeight: '400',
    color: BODY,
    textAlign: 'left',
    letterSpacing: 0.05,
    width: '100%',
    textShadowColor: 'rgba(0, 0, 0, 0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
    ...Platform.select({
      ios: {},
      android: { fontFamily: 'sans-serif', includeFontPadding: false },
    }),
  },
  /** Маршрут / поділитися / друзі — без тіні на тексті. */
  onboardRouteShareFriendsTextNoShadow: {
    textShadowColor: 'transparent',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 0,
  },
  finalSlideBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: '#000000',
    zIndex: 0,
  },
  finalBrandHeroBand: {
    position: 'relative',
    backgroundColor: '#000000',
    justifyContent: 'flex-start',
    alignItems: 'stretch',
    /** Смуги Rectangle 37 поверх колажу і слогану — не обрізати. */
    overflow: 'visible',
  },
  finalBrandTaglineWrap: {
    paddingHorizontal: 18,
    paddingTop: 0,
    paddingBottom: 10,
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  /** Відео під слоганом; прозорий фон — під час наїзду на колаж видно картинку (не чорний шар). */
  finalBrandTaglineVideoOuter: {
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: 10,
    backgroundColor: 'transparent',
  },
  /** Слоган поверх смуг Rectangle 37. */
  finalBrandTaglineWrapAboveStrips: {
    position: 'relative',
    zIndex: 100,
    ...Platform.select({
      android: { elevation: 100 },
      ios: {},
    }),
  },
  /** М’яка тінь → чорний; зона над слоганом. */
  finalBrandShadowGradientWrap: {
    position: 'absolute',
    overflow: 'hidden',
  },
  /** Тло #000 + ледь видима текстура — без стороннього відтінку від PNG. */
  finalBrandRect36Strip: {
    backgroundColor: '#000000',
  },
  /** Слоган щільно під відео (узгоджено з finalTaglineVideoToTextGap у finalOnboardLayout). */
  finalVideoTaglineTextBelowVideo: {
    marginTop: 4,
  },
  finalVideoTaglineText: {
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0.35,
    maxWidth: 320,
    ...Platform.select({
      ios: {
        fontFamily: 'Georgia',
        fontStyle: 'italic',
        fontWeight: '400',
      },
          android: {
        fontFamily: 'serif',
        fontStyle: 'italic',
        fontWeight: '400',
      },
    }),
    textShadowColor: 'rgba(0,0,0,0.92)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 14,
  },
  overlay: {
    zIndex: 4,
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  /** Android: оверлей кроків 0…4 — вище декоративних смуг героя (elevation), інакше текст не видно. */
  overlayHeroAndroidAboveHeroDecor: {
    /** Вище за рамку скану (~22) та смуги — з запасом. */
    elevation: 56,
  },
  overlayFinalBrand: {
    /** Один рядок — футер унизу; без flex-спейсера зверху (на Android він міг перекривати відео). */
    justifyContent: 'flex-end',
    minHeight: 0,
  },
  /** Раніше — спейсер над футером на останньому слайді; лишаємо стиль, якщо знадобиться знову. */
  finalOverlayTopFill: {
    flex: 1,
    minHeight: 0,
  },
  /** Кроки 0…4: копія знизу в колонці без ScrollView. */
  overlayWithFixedCopy: {
    justifyContent: 'flex-start',
  },
  onboardCopyScroll: {
    flex: 1,
    minHeight: 0,
  },
  /** Прозорий фон, щоб не перекривати фото (Android). */
  onboardCopyScrollLandmarks: {
    backgroundColor: 'transparent',
  },
  onboardCopyScrollInner: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'flex-end',
    width: '100%',
  },
  onboardCopyScrollInnerLandmarks: {
    paddingTop: 0,
  },
  onboardFooter: {
    flexShrink: 0,
    paddingTop: 2,
  },
  /** Фінальний крок: без ряду крапок. */
  onboardFooterFinalContinue: {
    paddingTop: 4,
  },
  flexSpacer: {
    flex: 1,
    minHeight: 0,
  },
  column: {
    paddingBottom: 8,
  },
  /** Усі слайди: лайм зліва, білий текст. */
  titleBodyBlock: {
    alignItems: 'flex-start',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 341,
    gap: 12,
    transform: [{ translateY: 10 }],
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  titleLeftAccent: {
    fontWeight: '700',
    color: ACCENT,
    textAlign: 'left',
    letterSpacing: -0.2,
    width: '100%',
    textShadowColor: 'rgba(0, 0, 0, 0.72)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 12,
    ...Platform.select({
      ios: {},
      android: { fontFamily: 'sans-serif' },
    }),
  },
  bodyLeftAccent: {
    fontWeight: '400',
    color: BODY,
    textAlign: 'left',
    letterSpacing: 0.05,
    width: '100%',
    textShadowColor: 'rgba(0, 0, 0, 0.78)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
    ...Platform.select({
      ios: {},
      android: { fontFamily: 'sans-serif' },
    }),
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    gap: 8,
    marginTop: 20,
    marginBottom: 20,
    width: '100%',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  dotPassed: {
    backgroundColor: ACCENT,
  },
  ctaOuter: {
    minHeight: 48,
    width: '100%',
    alignSelf: 'stretch',
    height: 52,
    borderRadius: 999,
    borderWidth: 5,
    borderColor: 'rgba(225, 255, 0, 0.45)',
    position: 'relative',
    overflow: 'visible',
    marginTop: 2,
  },
  ctaBack: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    borderRadius: 999,
    /** Майже зливається з чорним фоном — без різкого оливкового шару. */
    backgroundColor: '#121308',
  },
  ctaFront: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(122, 144, 0, 0.55)',
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 2,
  },
  skipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
  },
  skipText: {
    fontWeight: '600',
    fontSize: 15,
    lineHeight: 19,
    color: '#101010',
    textAlign: 'center',
    ...Platform.select({
      ios: {},
      android: { fontFamily: 'sans-serif-medium' },
    }),
  },
});
