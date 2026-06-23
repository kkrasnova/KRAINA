import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useAppTheme } from './useAppTheme';

/** @deprecated Використовуйте WalkReminderSetup — кроки тепер там же, без окремого екрана в налаштуваннях. */
export default function SettingsStepsPage({ navigation, route }) {
  const { screenBg } = useAppTheme(route?.params?.appTheme);

  useEffect(() => {
    navigation.replace('WalkReminderSetup', {
      ...(route?.params || {}),
      fromOnboarding: false,
    });
  }, [navigation, route?.params]);

  return <View style={{ flex: 1, backgroundColor: screenBg }} />;
}
