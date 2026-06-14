import React, { useState, useEffect, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

/**
 * LazyScreen — заміна React.lazy для React Native (Metro не підтримує Suspense/lazy).
 *
 * Завантажує модуль через динамічний import() лише при першому рендері.
 * Після завантаження кешує компонент через ref, щоб не перезавантажувати при ре-рендерах.
 *
 * Використання:
 *   const FeedPage = (props) => <LazyScreen loader={() => import('./FeedPage')} {...props} />;
 *   <Stack.Screen name="Feed" component={FeedPage} />
 */
export default function LazyScreen({ loader, fallback, ...rest }) {
  const CachedRef = useRef(null);
  const [loaded, setLoaded] = useState(!!CachedRef.current);

  useEffect(() => {
    if (CachedRef.current) return;
    let cancelled = false;
    loader().then((mod) => {
      if (cancelled) return;
      if (mod && mod.default) {
        CachedRef.current = mod.default;
      } else {
        CachedRef.current = mod;
      }
      setLoaded(true);
    }).catch((err) => {
      if (__DEV__) console.warn('[LazyScreen] import failed', err);
    });
    return () => {
      cancelled = true;
    };
  }, [loader]);

  if (!CachedRef.current) {
    return fallback || (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#E1FF00" />
      </View>
    );
  }

  const Component = CachedRef.current;
  return <Component {...rest} />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
});
