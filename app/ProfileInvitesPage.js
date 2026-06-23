import React, { useCallback, useState, useEffect } from 'react';
import { FlashList } from '@shopify/flash-list';
import { View, StyleSheet, Alert, RefreshControl, DeviceEventEmitter, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { useSyncedAppLanguage } from './useAppLanguage';
import { pf } from './profileI18n';
import { st } from './chatsI18n';
import { lightTabBarScrollContentPadding } from './LightBottomTabBar';
import { socialListIncomingRequests, socialAcceptRequest, socialDeclineRequest } from './socialApi';
import { hasSocialApi } from './socialApi';
import { KRAINA_SOCIAL_GRAPH_CHANGED } from './socialFollowSyncEvents';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { getAppTheme, resolveAppTheme } from './themeStorage';
import { accentForTheme } from './themeAccent';
import { errorToUserText } from './errorText';
import {
  SocialPeopleSearchBar,
  SocialListActionBtn,
  SocialPersonRow,
  SocialPeopleEmptyState,
  socialPeopleListColors,
  socialPersonDisplayName,
} from './socialPeopleListUi';

export default function ProfileInvitesPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const langUk = String(language || 'en').split(/[-_]/)[0].toLowerCase() === 'uk';
  const [q, setQ] = useState('');
  const [invites, setInvites] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [appTheme, setAppTheme] = useState(resolveAppTheme(route?.params?.appTheme));

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const screenBg = isLight ? LIGHT_BAR_BG : APP_SCREEN_BG;
  const { textMain, muted, border } = socialPeopleListColors(isLight);
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;

  const shell = {
    user: route?.params?.user,
    language,
    ...(route?.params?.countryId != null ? { countryId: route.params.countryId } : {}),
    appTheme,
  };

  const reload = useCallback(async (withSpinner = false) => {
    if (withSpinner) setRefreshing(true);
    try {
      const t = await getAppTheme();
      setAppTheme(t === 'light' ? 'light' : 'dark');
      if (!hasSocialApi()) {
        setInvites([]);
        return;
      }
      try {
        const inv = await socialListIncomingRequests();
        setInvites(Array.isArray(inv) ? inv : []);
      } catch {
        setInvites([]);
      }
    } finally {
      if (withSpinner) setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(KRAINA_SOCIAL_GRAPH_CHANGED, () => {
      void reload();
    });
    return () => sub.remove();
  }, [reload]);

  const filtered = q.trim()
    ? invites.filter((x) =>
        `${x.display_name || ''} ${x.username || ''}`.toLowerCase().includes(q.trim().toLowerCase()),
      )
    : invites;

  const accept = async (item) => {
    try {
      await socialAcceptRequest(item.user_id);
      setInvites((prev) => prev.filter((x) => x.user_id !== item.user_id));
    } catch (e) {
      Alert.alert('', errorToUserText(e, language));
    }
  };

  const decline = async (item) => {
    try {
      await socialDeclineRequest(item.user_id);
      setInvites((prev) => prev.filter((x) => x.user_id !== item.user_id));
    } catch (e) {
      Alert.alert('', errorToUserText(e, language));
    }
  };

  const headerRight = (
    <Pressable
      onPress={() => navigation.navigate('StartChat', shell)}
      hitSlop={12}
      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1, padding: 4 }]}
      accessibilityRole="button"
      accessibilityLabel={st(language, 'startChatTitle')}
    >
      <Ionicons name="paper-plane-outline" size={22} color={isLight ? '#1E1E1E' : '#FFFFFF'} />
    </Pressable>
  );

  const listEmpty = (
    <SocialPeopleEmptyState
      icon="mail-open-outline"
      title={langUk ? 'Немає запрошень' : 'No invitations'}
      subtitle={langUk ? 'Нові запити зʼявляться тут' : 'New requests will appear here'}
      isLight={isLight}
      textMain={textMain}
      muted={muted}
    />
  );

  return (
    <View style={[styles.screen, { backgroundColor: screenBg }]}>
      <AppTopBar
        appTheme={appTheme}
        leftMode="back"
        onBackPress={() => navigation.goBack()}
        replaceCenterTitle={pf(language, 'invitesTitle')}
        rightSlot={headerRight}
        hideSendButton
      />
      <SocialPeopleSearchBar
        value={q}
        onChangeText={setQ}
        placeholder={pf(language, 'search')}
        isLight={isLight}
        accent={accent}
        textMain={textMain}
        muted={muted}
      />
      <FlashList
        data={filtered}
        keyExtractor={(item) => String(item.user_id)}
        estimatedItemSize={72}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: lightTabBarScrollContentPadding(insets.bottom, 20),
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void reload(true)}
            tintColor={accent}
          />
        }
        ListEmptyComponent={listEmpty}
        renderItem={({ item, index }) => (
          <SocialPersonRow
            avatarUrl={item.avatar_url}
            displayName={socialPersonDisplayName(item)}
            onPressName={() => {
              const username = String(item.username || '').replace(/^@/, '').trim();
              if (!username) return;
              navigation.push('SocialUserProfile', {
                ...shell,
                username,
                preloadedProfile: item,
              });
            }}
            actions={
              <>
                <SocialListActionBtn
                  icon="add"
                  onPress={() => accept(item)}
                  ripple={ripple}
                  isLight={isLight}
                  accessibilityLabel={langUk ? 'Прийняти' : 'Accept'}
                />
                <SocialListActionBtn
                  icon="close"
                  variant="danger"
                  onPress={() => decline(item)}
                  ripple={ripple}
                  isLight={isLight}
                  accessibilityLabel={langUk ? 'Відхилити' : 'Decline'}
                />
              </>
            }
            isLight={isLight}
            textMain={textMain}
            border={border}
            isLast={index === filtered.length - 1}
            ripple={ripple}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
});
