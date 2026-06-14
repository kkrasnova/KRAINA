/**
 * Нижня таб-панель на головному екрані показується лише після готовності контенту
 * (підписка + gate), щоб не «стрибала» поверх завантаження / логотипа.
 */
let mainPageContentReady = false;
const listeners = new Set();

export function setMainPageContentReady(ready) {
  const next = !!ready;
  if (next === mainPageContentReady) return;
  mainPageContentReady = next;
  listeners.forEach((fn) => fn());
}

export function getMainPageContentReady() {
  return mainPageContentReady;
}

export function subscribeMainPageContentReady(onStoreChange) {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}
