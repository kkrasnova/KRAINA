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
} from 'react-native';
// import { Video, ResizeMode } from 'expo-av'; // Temporarily disabled
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { appLangBase } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';

import { fc } from './feedComposerI18n';
import { prependUserFeedStory } from './feedLocalStorage';
import { hasFeedApiToken, feedCreateStoryFromUri } from './feedApi';
import { HOME_TAB_ROUTE, HOME_TAB } from './homeTabPagerConstants';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import { useAuthStore } from './auth/authStore';
import { emitFeedMediaUpdated } from './feedSyncEvents';

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
    if (!user || !uri || busy) return;
    setBusy(true);
    try {
      if (hasFeedApiToken()) {
        await feedCreateStoryFromUri(uri, caption.trim());
      } else {
        await prependUserFeedStory(user, { uri, caption: caption.trim() });
      }
      emitFeedMediaUpdated({
        kind: 'story',
        userId: user?.id ? String(user.id) : '',
      });
      const shell = {
        user,
        language,
        appTheme: route?.params?.appTheme || 'dark',
        ...(route?.params?.countryId != null ? { countryId: route.params.countryId } : {}),
      };
      navigation.navigate(HOME_TAB_ROUTE, { ...shell, tabIndex: HOME_TAB.FEED, routeFinderExtras: {} });
    } catch (e) {
      Alert.alert('', e?.message || 'Error');
    } finally {
      setBusy(false);
    }
  };

  if (!uri) {
    navigation.goBack();
    return null;
  }

  const previewIsVideo = /\.(mp4|mov|m4v)(\?|$)/i.test(String(uri));

  return (
    <View style={[styles.screen, isLight && styles.screenLight]}>
      <View style={styles.previewWrap}>
        {previewIsVideo ? (
          <Video
            source={{ uri }}
            style={styles.previewImg}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
            isLooping
            isMuted
            useNativeControls
          />
        ) : (
          <Image source={{ uri }} style={styles.previewImg} resizeMode="contain" />
        )}
      </View>
      <Pressable
        style={[
          styles.closeBtn,
          isLight && styles.closeBtnLight,
          { top: insets.top + 10 },
        ]}
        onPress={() => navigation.goBack()}
        hitSlop={14}
      >
        <Ionicons name="close" size={22} color={isLight ? '#1E1E1E' : '#F2F2EA'} />
      </Pressable>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.bottom}
      >
        <View style={{ flex: 1 }} />
        <View style={[styles.bottomBlock, { paddingBottom: insets.bottom + 12 }]}>
          <View style={[styles.inputBlur, isLight && styles.inputBlurLight]}>
            <TextInput
              style={[styles.input, { color: isLight ? '#1E1E1E' : '#FFFFFF' }]}
              placeholder={fc(language, 'addDescription')}
              placeholderTextColor={isLight ? 'rgba(30,30,30,0.45)' : 'rgba(255,255,255,0.45)'}
              value={caption}
              onChangeText={setCaption}
              multiline
              maxLength={500}
            />
          </View>
          <Pressable
            style={[
              styles.shareBtn,
              { backgroundColor: accentForTheme(isLight) },
              busy && { opacity: 0.6 },
            ]}
            onPress={share}
            disabled={busy}
          >
            <Text style={[styles.shareBtnText, { color: onAccentButtonText(isLight) }]}>
              {fc(language, 'shareStory')}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  screenLight: { backgroundColor: '#F6F6F6' },
  previewWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  previewImg: { width: '100%', height: '100%' },
  flex: { flex: 1 },
  closeBtn: {
    position: 'absolute',
    left: 20,
    zIndex: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnLight: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(30,30,30,0.12)',
  },
  bottomBlock: { paddingHorizontal: 16, zIndex: 2 },
  inputBlur: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
    /** Без градієнта на весь низ екрана — трохи щільніший фон поля, щоб текст читався на яскравому фото. */
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  inputBlurLight: {
    borderColor: 'rgba(30,30,30,0.12)',
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  input: {
    minHeight: 52,
    maxHeight: 120,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  shareBtn: {
    borderRadius: 23,
    paddingVertical: 16,
    alignItems: 'center',
  },
  shareBtnText: { fontSize: 17, fontWeight: '700' },
});
