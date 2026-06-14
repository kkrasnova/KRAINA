import { createNavigationContainerRef } from '@react-navigation/native';

/** Для оверлеїв (нижня панель) поза Stack.Screen. */
export const navigationRef = createNavigationContainerRef();

// External store for components that need to react to navigation state changes
// without forcing a re-render of the root App. Used by LightBottomTabBar via
// useSyncExternalStore so only the bar re-renders on each navigation event.
let navStateVersion = 0;
const navStateListeners = new Set();

export function notifyNavStateChange() {
  navStateVersion += 1;
  for (const fn of navStateListeners) {
    try { fn(); } catch { /* ignore listener errors */ }
  }
}

export function subscribeNavState(listener) {
  navStateListeners.add(listener);
  return () => {
    navStateListeners.delete(listener);
  };
}

export function getNavStateVersion() {
  return navStateVersion;
}
