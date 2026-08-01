/** Android: App waits for FirstPage logo paint before hiding native splash. */
let resolved = false;
const waiters = [];

let splashHidden = false;
const hiddenListeners = new Set();

/** Fast Refresh / повторний mount App — щоб не лишати «залиплий» чорний оверлей. */
export function resetSplashLogoGate() {
  resolved = false;
  splashHidden = false;
  waiters.splice(0);
  hiddenListeners.clear();
}

export function notifySplashLogoPainted() {
  if (resolved) return;
  resolved = true;
  waiters.splice(0).forEach((resolve) => resolve());
}

export function waitForSplashLogoPainted(timeoutMs = 1400) {
  if (resolved) return Promise.resolve();
  return Promise.race([
    new Promise((resolve) => waiters.push(resolve)),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

export function notifySplashHidden() {
  if (splashHidden) return;
  splashHidden = true;
  hiddenListeners.forEach((listener) => listener());
}

export function subscribeSplashHidden(listener) {
  if (splashHidden) {
    listener();
    return () => {};
  }
  hiddenListeners.add(listener);
  return () => hiddenListeners.delete(listener);
}
