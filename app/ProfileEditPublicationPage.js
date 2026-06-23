import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Image,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { appLangBase } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';

import { pf } from './profileI18n';
import { lightTabBarScrollContentPadding } from './LightBottomTabBar';
import { getPostCaption, setPostCaption } from './profileStorage';
import { hasFeedApiToken, feedUpdatePost } from './feedApi';
import { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { getAppTheme, resolveAppTheme } from './themeStorage';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import { errorToUserText } from './errorText';
const PREVIEW = require('./assets/screenshot_2026-04-05_15.52.15.webp');

export default function ProfileEditPublicationPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const postId = route?.params?.postId;
  const coverUrl = route?.params?.coverUrl;
  const [text, setText] = useState('');
  const [appTheme, setAppTheme] = useState(resolveAppTheme(route?.params?.appTheme));
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [t, cap] = await Promise.all([
      getAppTheme(),
      getPostCaption(postId, pf(language, 'postCaption')),
    ]);
    setAppTheme(t === 'light' ? 'light' : 'dark');
    setText(cap);
  }, [language, postId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const publish = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const nextText = text.trim() || pf(language, 'postCaption');
      if (hasFeedApiToken() && postId) {
        await feedUpdatePost(String(postId), { content_text: nextText });
      }
      await setPostCaption(postId, nextText);
      Alert.alert('', language.startsWith('uk') ? 'Збережено' : 'Saved');
      navigation.goBack();
    } catch (e) {
      Alert.alert('', errorToUserText(e, language));
    } finally {
      setBusy(false);
    }
  };

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const screenBg = isLight ? LIGHT_BAR_BG : APP_SCREEN_BG;
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const softBg = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)';

  return (
    <View style={[styles.screen, { backgroundColor: screenBg }]}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} style={[styles.closeBtn, { backgroundColor: softBg }]}>
          <Ionicons name="close" size={24} color={textMain} />
        </Pressable>
        <Text style={[styles.title, { color: textMain }]}>{pf(language, 'editPost')}</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: lightTabBarScrollContentPadding(insets.bottom, 24),
        }}
        keyboardShouldPersistTaps="handled"
        {...(Platform.OS === 'ios' ? { contentInsetAdjustmentBehavior: 'never' } : {})}
      >
        <Image
          source={coverUrl ? { uri: coverUrl } : PREVIEW}
          style={styles.preview}
          resizeMode="cover"
        />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={pf(language, 'storyPlaceholder')}
          placeholderTextColor="#888"
          multiline
          style={[styles.story, { backgroundColor: softBg, color: textMain }]}
        />
        <Pressable
          style={[styles.rowBtn, { backgroundColor: softBg }]}
          onPress={() => Alert.alert('', pf(language, 'comingSoon'))}
        >
          <Text style={[styles.rowBtnText, { color: textMain }]}>{pf(language, 'addCity')}</Text>
          <Ionicons name="chevron-forward" size={20} color={isLight ? '#727272' : '#A0A0A0'} />
        </Pressable>
        <Pressable
          style={[styles.rowBtn, { backgroundColor: softBg }]}
          onPress={() => navigation.navigate('RouteFinder', route.params)}
        >
          <Text style={[styles.rowBtnText, { color: textMain }]}>{pf(language, 'markMap')}</Text>
          <Ionicons name="chevron-forward" size={20} color={isLight ? '#727272' : '#A0A0A0'} />
        </Pressable>
        <Pressable style={[styles.publish, { backgroundColor: accent, opacity: busy ? 0.6 : 1 }]} onPress={publish} disabled={busy}>
          <Text style={[styles.publishText, { color: onAccentButtonText(isLight) }]}>
            {pf(language, 'publish')}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: '700' },
  preview: {
    width: '100%',
    aspectRatio: 0.75,
    borderRadius: 20,
    backgroundColor: '#DDD',
    marginBottom: 16,
  },
  story: {
    minHeight: 120,
    borderRadius: 16,
    padding: 14,
    fontSize: 16,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  rowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  rowBtnText: { fontSize: 16 },
  publish: {
    marginTop: 20,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  publishText: { fontSize: 17, fontWeight: '700' },
});
