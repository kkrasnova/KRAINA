/**
 * Компактний формат великих лічильників (підписники, лайки, друзі),
 * щоб довгі числа не ламали верстку рядка статистики.
 * Поводиться як Instagram/Twitter: 999 → "999", 1_234 → "1.2K", 3_400_000 → "3.4M".
 */
export function formatCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';

  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);

  if (abs < 1000) return sign + String(Math.trunc(abs));

  const units = [
    { v: 1e9, s: 'B' },
    { v: 1e6, s: 'M' },
    { v: 1e3, s: 'K' },
  ];

  for (const { v, s } of units) {
    if (abs >= v) {
      // одна десяткова, без зайвого ".0"; округлення до десятих
      let scaled = Math.floor((abs / v) * 10) / 10;
      let suffix = s;
      // 999_950 → "1000.0K" → піднімаємо до "1M"
      if (scaled >= 1000) {
        scaled = 1;
        const idx = units.findIndex((u) => u.s === s);
        suffix = idx > 0 ? units[idx - 1].s : s;
      }
      const text = scaled % 1 === 0 ? String(scaled) : scaled.toFixed(1);
      return sign + text + suffix;
    }
  }

  return sign + String(Math.trunc(abs));
}
