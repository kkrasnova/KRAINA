/**
 * Теги для фільтрів на головній (гори, море, місто тощо).
 * Якщо id немає в мапі — показ у фільтрах «Місто» та «Історія».
 */
export const HOME_CATEGORY_IDS = [
  'all',
  'mountains',
  'sea',
  'city',
  'forest',
  'history',
  'faith',
];

const TAGS = {
  colosseum: ['history', 'city'],
  trevi: ['city', 'faith', 'sea'],
  pantheon: ['history', 'faith', 'city'],
  vatican: ['faith', 'history', 'city'],
  sophia: ['faith', 'history', 'city'],
  lavra: ['faith', 'history', 'mountains'],
  maidan: ['city'],
  motherland: ['mountains', 'city', 'history'],
  palace_culture: ['city', 'history'],
  old_town_waw: ['city', 'history'],
  brandenburg: ['history', 'city'],
  reichstag: ['history', 'city'],
  prado: ['history', 'city'],
  retiro: ['forest', 'city'],
  rijksmuseum: ['history', 'city'],
  canal_ring: ['sea', 'city'],
  gediminas: ['mountains', 'history', 'city'],
  old_town_vln: ['city', 'history'],
  old_town_riga: ['city', 'history'],
  art_nouveau: ['city', 'history'],
  palace_parliament: ['history', 'city'],
  old_town_buh: ['city', 'history'],
  republic_sq: ['city', 'history'],
  cascade: ['mountains', 'city', 'history'],
  lviv_rynok: ['city', 'history'],
  lviv_opera: ['city', 'history'],
  lviv_high_castle: ['mountains', 'city', 'history'],
  lviv_svobody: ['city'],
  lviv_dom_sobor: ['faith', 'history', 'city'],
  lviv_lychakiv: ['history', 'city'],
  lviv_palace: ['history', 'city'],
};

export function landmarkMatchesHomeCategory(lmId, catId) {
  if (catId === 'all' || catId == null || catId === '') return true;
  const t = TAGS[lmId];
  if (!t) return catId === 'city' || catId === 'history';
  return t.includes(catId);
}
