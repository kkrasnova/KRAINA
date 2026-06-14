import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG, mainContentTopBelowTopBar } from './AppTopBar';
import { getAppTheme } from './themeStorage';
import { appLangBase } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';

import GeoMapExplorer from './GeoMapExplorer';
import { gm } from './geoMapI18n';

/**
 * Повноекранна карта каталогу KRAÏNA (зі стеку налаштувань / посилань).
 * Той самий геомодуль, що й вкладка «Карта» в головному пейджері.
 */
export default function ExploreMapPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const [appTheme, setAppTheme] = useState(route?.params?.appTheme || 'dark');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = await getAppTheme();
      if (!cancelled) setAppTheme(t === 'light' ? 'light' : 'dark');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isLight = appTheme === 'light';
  const bg = isLight ? LIGHT_BAR_BG : APP_SCREEN_BG;

  return (
    <View style={[styles.screen, { backgroundColor: bg }]}>
      <AppTopBar
        appTheme={appTheme}
        leftMode="back"
        onBackPress={() => navigation.goBack()}
        replaceCenterTitle={gm(language, 'mapTab')}
        hideSendButton
      />
      <View style={styles.mapHost}>
        <GeoMapExplorer
          navigation={navigation}
          route={route}
          topContentInset={mainContentTopBelowTopBar(insets.top)}
          bottomInset={insets.bottom + 28}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  mapHost: { flex: 1 },
});
