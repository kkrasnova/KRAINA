function clean(s) {
  return String(s || '').trim();
}

export function parseGoogleMapsLatLng(url) {
  const u = clean(url);
  if (!u) return null;

  const patterns = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i,
    /[?&]q=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i,
    /[?&]ll=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i,
  ];

  for (const re of patterns) {
    const m = u.match(re);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
}

export function buildAiStoryDraft(input) {
  const titleUk = clean(input?.titleUk);
  const titleEn = clean(input?.titleEn);
  const descUk = clean(input?.descUk);
  const descEn = clean(input?.descEn);
  const oldUri = clean(input?.oldUri);
  const newUri = clean(input?.newUri);
  const bgUri = clean(input?.bgUri || newUri || oldUri);
  const mapsUrl = clean(input?.mapsUrl);
  const coords = parseGoogleMapsLatLng(mapsUrl);

  const placeUk = titleUk || titleEn || 'пам’ятка';
  const placeEn = titleEn || titleUk || 'landmark';

  const qUk = `Що найкраще описує "${placeUk}"?`;
  const qEn = `What best describes "${placeEn}"?`;

  const introUk = descUk || `Коротка історія про ${placeUk}.`;
  const introEn = descEn || `A short story about ${placeEn}.`;

  const factBodyUk = descUk || `${placeUk} має історичну або культурну цінність.`;
  const factBodyEn = descEn || `${placeEn} has historical or cultural value.`;

  return {
    coords,
    storyPatch: {
      builtAt: '',
      shortIntroUk: introUk,
      shortIntroEn: introEn,
      quiz: {
        questionUk: qUk,
        questionEn: qEn,
        options: [
          { textUk: 'Культурна/історична пам’ятка', textEn: 'A cultural/historical landmark', correct: true },
          { textUk: 'Сучасний бізнес-центр', textEn: 'A modern business center', correct: false },
          { textUk: 'Спортивна арена', textEn: 'A sports arena', correct: false },
        ],
        multiHintUk: `${placeUk} має історичну або культурну цінність.`,
        multiHintEn: `${placeEn} has historical or cultural value.`,
      },
      photoFact: {
        bgUri,
        titleUk: `Факт про ${placeUk}`,
        titleEn: `Fact about ${placeEn}`,
        bodyUk: factBodyUk,
        bodyEn: factBodyEn,
      },
      beforeAfter: {
        oldUri,
        newUri: newUri || bgUri,
      },
      secondFact: {
        titleUk: `Було / стало: ${placeUk}`,
        titleEn: `Before / after: ${placeEn}`,
        bodyUk: `Порівняйте історичне та сучасне фото ${placeUk}.`,
        bodyEn: `Compare historical and modern photos of ${placeEn}.`,
      },
      closingUk: `Тепер ви знаєте більше про ${placeUk}.`,
      closingEn: `Now you know more about ${placeEn}.`,
    },
  };
}
