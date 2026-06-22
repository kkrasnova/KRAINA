import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Video, ResizeMode } from './expoAvCompat';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Ionicons from '@expo/vector-icons/Ionicons';
import { brandFontSansBold, brandFontSansMedium } from './brandFont';
import { useSyncedAppLanguage } from './useAppLanguage';

import { fc } from './feedComposerI18n';
import { prependUserFeedStory } from './feedLocalStorage';
import { hasFeedApiToken, ensureFeedApiReady, feedCreateStoryFromUri } from './feedApi';
import { HOME_TAB_ROUTE, HOME_TAB } from './homeTabPagerConstants';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import { useAuthStore } from './auth/authStore';
import { emitFeedMediaUpdated } from './feedSyncEvents';
import { errorToUserText } from './errorText';

export default function FeedStorySharePage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const authUser = useAuthStore((s) => s.user);
  const user = route?.params?.user || authUser;
  const uri = route?.params?.uri;
  const isLight = (route?.params?.appTheme || 'dark') === 'light';
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);

  const share = async () => {
    if (busy) return;
    const activeUser = user || authUser;
    if (!uri) {
      navigation.goBack();
      return;
    }
    if (!activeUser?.id) {
      Alert.alert(
        '',
        language === 'en'
          ? 'Sign in to share a story.'
          : 'Увійдіть в акаунт, щоб поділитись історією.',
      );
      return;
    }
    setBusy(true);
    try {
      // Пробуємо відновити backend-сесію перед публікацією, щоб історія потрапила в Postgres,
      // а не лише в локальне сховище (інакше її не побачать інші користувачі).
      await ensureFeedApiReady(activeUser);
      if (hasFeedApiToken()) {
        await feedCreateStoryFromUri(uri, caption.trim());
      } else {
        await prependUserFeedStory(activeUser, { uri, caption: caption.trim() });
      }
      emitFeedMediaUpdated({
        kind: 'story',
        userId: activeUser?.id ? String(activeUser.id) : '',
      });
      const shell = {
        user: activeUser,
        language,
        appTheme: route?.params?.appTheme || 'dark',
        ...(route?.params?.countryId != null ? { countryId: route.params.countryId } : {}),
      };
      navigation.navigate(HOME_TAB_ROUTE, { ...shell, tabIndex: HOME_TAB.FEED, routeFinderExtras: {} });
    } catch (e) {
      if (hasFeedApiToken()) {
        try {
          await prependUserFeedStory(activeUser, { uri, caption: caption.trim() });
          emitFeedMediaUpdated({
            kind: 'story',
            userId: activeUser?.id ? String(activeUser.id) : '',
          });
          const shell = {
            user: activeUser,
            language,
            appTheme: route?.params?.appTheme || 'dark',
            ...(route?.params?.countryId != null ? { countryId: route.params.countryId } : {}),
          };
          navigation.navigate(HOME_TAB_ROUTE, { ...shell, tabIndex: HOME_TAB.FEED, routeFinderExtras: {} });
          return;
        } catch (localErr) {
          Alert.alert('', errorToUserText(localErr, language));
          return;
        }
      }
      Alert.alert('', errorToUserText(e, language));
    } finally {
      setBusy(false);
    }
  };

  if (!uri) {
    navigation.goBack();
    return null;
  }

  const previewIsVideo = /\.(mp4|mov|m4v)(\?|$)/i.test(String(uri));
  const accent = accentForTheme(isLight);
  const btnTextColor = onAccentButtonText(isLight);
  const bottomExtra = 12;

  return (
    <View style={[styles.screen, isLight && styles.screenLight]}>
      <View style={styles.mediaLayer} pointerEvents="none">
        {previewIsVideo ? (
          <Video
            source={{ uri }}
            style={styles.media}
            resizeMode={ResizeMode.COVER}
            shouldPlay
            isLooping
            isMuted
            useNativeControls={false}
          />
        ) : (
          <Image source={{ uri }} style={styles.media} resizeMode="cover" />
        )}
      </View>

      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0.55)', 'transparent']}
        style={[styles.topFade, { height: insets.top + 72 }]}
      />

      <Pressable
        style={[styles.closeBtn, isLight && styles.closeBtnLight, { top: insets.top + 10 }]}
        onPress={() => navigation.goBack()}
        hitSlop={14}
      >
        <Ionicons name="close" size={22} color={isLight ? '#1E1E1E' : '#F2F2EA'} />
      </Pressable>

      <Text
        style={[styles.headerTitle, brandFontSansBold, isLight && styles.headerTitleLight, { top: insets.top + 18 }]}
        pointerEvents="none"
      >
        {fc(language, 'story')}
      </Text>

      <KeyboardAvoidingView
        style={styles.bottomChrome}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <LinearGradient
          pointerEvents="none"
          colors={['transparent', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.88)']}
          style={styles.bottomFade}
        />

        <SafeAreaView edges={['bottom']} style={{ paddingBottom: bottomExtra }}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            bounces={false}
            contentContainerStyle={styles.bottomContent}
          >
            <View style={[styles.inputShell, isLight && styles.inputShellLight]}>
              {Platform.OS === 'ios' ? (
                <BlurView intensity={36} tint={isLight ? 'light' : 'dark'} style={styles.inputBlur} />
              ) : null}
              <TextInput
                style={[styles.input, brandFontSansMedium, { color: isLight ? '#1E1E1E' : '#FFFFFF' }]}
                placeholder={fc(language, 'addDescription')}
                placeholderTextColor={isLight ? 'rgba(30,30,30,0.45)' : 'rgba(255,255,255,0.5)'}
                value={caption}
                onChangeText={setCaption}
                multiline
                maxLength={500}
              />
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.shareBtn,
                { backgroundColor: accent },
                busy && { opacity: 0.65 },
                pressed && !busy && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                !isLight && {
                  shadowColor: accent,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.35,
                  shadowRadius: 10,
                },
              ]}
              onPress={share}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={fc(language, 'shareStory')}
            >
              {busy ? (
                <ActivityIndicator color={btnTextColor} />
              ) : (
                <Text style={[styles.shareBtnText, brandFontSansBold, { color: btnTextColor }]}>
                  {fc(language, 'shareStory')}
                </Text>
              )}
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  screenLight: { backgroundColor: '#0a0a0a' },
  mediaLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0a0a0a',
  },
  media: {
    width: '100%',
    height: '100%',
  },
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 8,
  },
  closeBtn: {
    position: 'absolute',
    left: 20,
    zIndex: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnLight: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderColor: 'rgba(30,30,30,0.12)',
  },
  headerTitle: {
    position: 'absolute',
    alignSelf: 'center',
    left: 0,
    right: 0,
    zIndex: 18,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: '#F2F2EA',
    letterSpacing: 0.2,
  },
  headerTitleLight: {
    color: '#1E1E1E',
  },
  bottomChrome: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
    paddingTop: 56,
  },
  bottomFade: {
    ...StyleSheet.absoluteFillObject,
  },
  bottomContent: {
    paddingHorizontal: 16,
    gap: 12,
    paddingTop: 4,
  },
  inputShell: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  inputShellLight: {
    borderColor: 'rgba(30,30,30,0.12)',
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  inputBlur: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.45,
  },
  input: {
    minHeight: 52,
    maxHeight: 120,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    lineHeight: 22,
  },
  shareBtn: {
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  shareBtnText: { fontSize: 17 },
});
