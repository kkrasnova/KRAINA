import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { getAppThemeSync } from './themeStorage';

/** Кеш завантажених lazy-модулів (той самий loader → той самий компонент). */
const lazyComponentCache = new Map();

function resolveLazyComponent(mod) {
  const candidate = mod?.default ?? mod;
  if (typeof candidate === 'function') return candidate;
  if (__DEV__) {
    console.warn('[LazyScreen] lazy module did not export a component', mod);
  }
  return null;
}

/**
 * Dev-safe lazy loader for Metro / RN 0.83+.
 * Dynamic import() splits async bundles and crashes HMR in dev
 * ("Expected HMRClient.setup() call at startup").
 * Sync require() deferred to the next tick keeps lazy-first-render semantics.
 */
export function makeLazyLoader(syncLoad, mapModule) {
  return () =>
    Promise.resolve()
      .then(syncLoad)
      .then((mod) => (mapModule ? mapModule(mod) : { default: mod?.default ?? mod }));
}

/** Попереднє завантаження екрана — щоб при навігації не було спінера LazyScreen. */
export function prefetchLazyLoader(loader) {
  if (!loader) return Promise.resolve(null);
  const cached = lazyComponentCache.get(loader);
  if (cached) {
    return cached instanceof Promise ? cached : Promise.resolve(cached);
  }
  const pending = loader()
    .then((mod) => {
      const Component = resolveLazyComponent(mod);
      if (Component) lazyComponentCache.set(loader, Component);
      else lazyComponentCache.delete(loader);
      return Component;
    })
    .catch((err) => {
      lazyComponentCache.delete(loader);
      if (__DEV__) console.warn('[LazyScreen] prefetch failed', err);
      return null;
    });
  lazyComponentCache.set(loader, pending);
  return pending;
}

/**
 * LazyScreen — заміна React.lazy для React Native (Metro не підтримує Suspense/lazy).
 *
 * Завантажує модуль через makeLazyLoader + require() лише при першому рендері.
 * Після завантаження кешує компонент через ref, щоб не перезавантажувати при ре-рендерах.
 *
 * Використання:
 *   const FeedPage = (props) => (
 *     <LazyScreen loader={makeLazyLoader(() => require('./FeedPage'))} {...props} />
 *   );
 *   <Stack.Screen name="Feed" component={FeedPage} />
 */
export default function LazyScreen({ loader, fallback, ...rest }) {
  const initialCached = lazyComponentCache.get(loader);
  const CachedRef = useRef(
    initialCached && typeof initialCached === 'function' ? initialCached : null,
  );
  const [, setLoaded] = useState(!!CachedRef.current);

  useEffect(() => {
    if (CachedRef.current) return;
    const cached = lazyComponentCache.get(loader);
    if (cached && typeof cached === 'function') {
      CachedRef.current = cached;
      setLoaded(true);
      return;
    }
    let cancelled = false;
    const finish = (Component) => {
      if (cancelled || !Component) return;
      CachedRef.current = Component;
      setLoaded(true);
    };
    if (cached instanceof Promise) {
      cached.then(finish);
      return () => {
        cancelled = true;
      };
    }
    loader()
      .then((mod) => {
        const Component = resolveLazyComponent(mod);
        if (Component) lazyComponentCache.set(loader, Component);
        else lazyComponentCache.delete(loader);
        finish(Component);
      })
      .catch((err) => {
        if (__DEV__) console.warn('[LazyScreen] import failed', err);
      });
    return () => {
      cancelled = true;
    };
  }, [loader]);

  const Component = CachedRef.current;
  if (!Component || typeof Component !== 'function') {
    return fallback || (
      <View style={[styles.center, { backgroundColor: getAppThemeSync() === 'light' ? LIGHT_BAR_BG : APP_SCREEN_BG }]} />
    );
  }

  return <Component {...rest} />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: APP_SCREEN_BG,
  },
});
