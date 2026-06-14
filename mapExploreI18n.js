import { appLangBase } from './appLang';

function pick(lang, table) {
  const b = appLangBase(lang);
  return table[b] ?? table.en ?? table.uk;
}

const S = {
  title: {
    uk: 'Карта та точки',
    en: 'Map & places',
  },
  openMap: {
    uk: 'Відкрити в картах',
    en: 'Open in maps',
  },
  tapHint: {
    uk: 'Оберіть точку нижче, щоб побачити деталі.',
    en: 'Pick a place below for details.',
  },
};

export function mx(lang, key) {
  return pick(lang, S[key] || {});
}

const POIS_UK = [
  { id: 'kyiv-lavra', title: 'Києво-Печерська лавра', lat: 50.4346, lng: 30.5562 },
  { id: 'lviv-rinok', title: 'Площа Ринок, Львів', lat: 49.8414, lng: 24.0315 },
  { id: 'odesa-prym', title: 'Приморський бульвар, Одеса', lat: 46.4825, lng: 30.7415 },
  { id: 'kamyanets', title: 'Кам’янець-Подільська фортеця', lat: 48.6736, lng: 26.5806 },
  { id: 'bakota', title: 'Бакота (Дністер)', lat: 48.598, lng: 26.938 },
];

const POIS_EN = [
  { id: 'kyiv-lavra', title: 'Kyiv Pechersk Lavra', lat: 50.4346, lng: 30.5562 },
  { id: 'lviv-rinok', title: 'Rynok Square, Lviv', lat: 49.8414, lng: 24.0315 },
  { id: 'odesa-prym', title: 'Odesa seaside boulevard', lat: 46.4825, lng: 30.7415 },
  { id: 'kamyanets', title: 'Kamianets-Podilskyi fortress', lat: 48.6736, lng: 26.5806 },
  { id: 'bakota', title: 'Bakota (Dniester)', lat: 48.598, lng: 26.938 },
];

export function getMapPois(lang) {
  const b = appLangBase(lang);
  return b === 'uk' ? POIS_UK : POIS_EN;
}
