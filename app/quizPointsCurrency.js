/**
 * Конвертація балів вікторини в «гроші» для UI:
 * 1 бал = 1 грн (UA) або 1 євроцент (інші).
 */

export function quizXpToMoneyMinor(xp) {
  const n = Math.max(0, Math.round(Number(xp) || 0));
  return n;
}

/**
 * @param {number} xp
 * @param {string} language
 * @returns {{ amountLabel: string, currencyCode: string, note: string }}
 */
export function formatQuizXpAsMoney(xp, language = 'uk') {
  const minor = quizXpToMoneyMinor(xp);
  const lang = String(language || 'uk').split(/[-_]/)[0].toLowerCase();
  if (lang === 'uk') {
    return {
      amountLabel: `${minor} грн`,
      currencyCode: 'UAH',
      note: '1 бал = 1 грн',
    };
  }
  const euros = (minor / 100).toFixed(2);
  return {
    amountLabel: `€${euros}`,
    currencyCode: 'EUR',
    note: '1 бал = 1 євроцент',
  };
}
