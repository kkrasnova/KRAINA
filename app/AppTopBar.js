import React, { useCallback, useEffect, useState, memo } from 'react';
import { View, Pressable, Text, StyleSheet, Platform, DeviceEventEmitter } from 'react-native';
import { runAfterInteractions } from './runAfterInteractions';
import { Image as ExpoImage } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import PddHeaderWordmark from './PddHeaderWordmark';
import { brandFontHeadMedium, brandFontSansMedium } from './brandFont';
import FittingText from './FittingText';
import { hasMessageApiToken, messagesListThreads } from './messageApi';
import { useAuthStore } from './auth/authStore';
import {
  chatsCacheKey,
  hasChatsCache,
  computeUnreadBadgeCount,
  computeUnreadBadgeFromApiRows,
  chatsLangUkFromUser,
  writeChatsCache,
  CHATS_CACHE_UPDATED,
} from './chatsThreadsCache';
import { mapInboxThreadRow } from './chatsDataPrefetch';
import {
  WS_EVENT_NEW_MESSAGE,
  WS_EVENT_THREAD_UPDATED,
  WS_EVENT_CONNECTED,
  WS_EVENT_DISCONNECTED,
  isWsConnected,
} from './chatRealtime';

export const APP_SCREEN_BG = '#000000';
/** Світла шапка (макет Figma) */
export const LIGHT_BAR_BG = '#F2F2EA';
const BAR_INNER_H = 52;
/** Висота рядка шапки (без safe area) — для абсолютного позиціонування пошуку на головній. */
export const APP_TOP_BAR_ROW_H = BAR_INNER_H;

/** Відступ від верху екрана до зони контенту під шапкою (safe + рядок + нижня межа). */
export function mainContentTopBelowTopBar(insetsTop) {
  return insetsTop + BAR_INNER_H + StyleSheet.hairlineWidth;
}
/** Однаковий відступ кнопок від лівого/правого краю шапки; слоти однакової ширини — логотип по центру */
const BAR_EDGE_INSET = 18;
const SIDE_TOUCH_W = 44;
const SIDE_SLOT_W = BAR_EDGE_INSET + SIDE_TOUCH_W;

/** Темна тема: меню — вектор (PNG 11.png занадто дрібний для retina, виглядав «мильним»). */
const LEFT_ICON_DARK = require('./assets/11.png');
const MENU_ICON = LEFT_ICON_DARK;
/** Як у `FeedPage` / шапці стрічки (історії та публікації). */
const SEND_ICON_LIGHT = require('./assets/15.png');
const SEND_ICON_DARK = require('./assets/11221.png');

/**
 * Зліва/справа: Ionicons (чіткі на retina). Центр із showBrandLogo: слово KRAÏNA (брендовий шрифт + градієнт).
 * leftMode="back" — кнопка назад.
 */
export default memo(function AppTopBar({
  appTheme = 'dark',
  onMenuPress,
  onSendPress,
  leftMode = 'menu',
  onBackPress,
  centerSubtitle,
  menuIconSource = MENU_ICON,
  /** Якщо true — правий слот порожній (зберігаємо ширину сітки) */
  hideSendButton = false,
  /** Якщо true — лівий слот без меню/«назад» (лише leftMode="menu" або порожній ряд при back), ширина сітки зберігається */
  hideMenuButton = false,
  /** Замість кнопки чатів справа — власний вузол (напр. меню адмін-панелі). */
  rightSlot = null,
  /** Замість меню/«назад» зліва — власний вузол (напр. «+» на профілі). */
  leftSlot = null,
  /** Світла тема: шапка без заливки — видно градієнт екрана (напр. Налаштування). */
  lightHeaderTransparent = false,
  /** Повністю прозора шапка (світла/темна) — узгодження з повноекранним градієнтом (тарифи). */
  transparentHeader = false,
  /** Світла тема: колір шапки (Figma Налаштування — суцільний #FFFFFF). */
  lightBarBackgroundColor,
  /** Світла тема: зліва — 122 (налаштування) або «гамбургер» як у Figma профілю. */
  lightMenuButton = 'settingsImage',
  /** Замість логотипа по центру — текст (напр. «Друзі»). */
  replaceCenterTitle,
  /** Логотип KRAÏNA по центру — лише на головній (MainPage). Усюди інакше: заголовок або порожній центр. */
  showBrandLogo = false,
}) {
  const insets = useSafeAreaInsets();
  const isLight = appTheme === 'light';
  const barBg = transparentHeader
    ? 'transparent'
    : !isLight
      ? APP_SCREEN_BG
      : lightBarBackgroundColor != null
        ? lightBarBackgroundColor
        : lightHeaderTransparent
          ? 'transparent'
          : LIGHT_BAR_BG;
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const backColor = !onBackPress
    ? 'rgba(128,128,128,0.45)'
    : isLight
      ? '#1E1E1E'
      : '#FFFFFF';

  const send = hideSendButton || rightSlot != null ? null : onSendPress || (() => {});
  const [unreadCount, setUnreadCount] = useState(0);
  const authUser = useAuthStore((s) => s.user);

  const readBadgeFromCache = useCallback(() => {
    if (!send || !hasMessageApiToken() || !authUser) {
      setUnreadCount(0);
      return;
    }
    setUnreadCount(computeUnreadBadgeCount(authUser, chatsLangUkFromUser(authUser)));
  }, [send, authUser]);

  const iconMenuDark = '#FFFFFF';
  const iconMenuLight = '#1E1E1E';
  const sendIcon = isLight ? SEND_ICON_LIGHT : SEND_ICON_DARK;
  const menuSize = 26;

  const pressOverlay = ({ pressed }) =>
    Platform.OS === 'ios' && pressed ? styles.pressedIOS : null;

  const reloadUnread = useCallback(async () => {
    if (!send || !hasMessageApiToken() || !authUser) {
      setUnreadCount(0);
      return;
    }
    const badgeLangUk = chatsLangUkFromUser(authUser);
    readBadgeFromCache();
    try {
      const [inboxRows, requestRows] = await Promise.all([
        messagesListThreads('inbox', badgeLangUk),
        messagesListThreads('requests', badgeLangUk),
      ]);
      const inbox = Array.isArray(inboxRows) ? inboxRows : [];
      const requests = Array.isArray(requestRows) ? requestRows : [];
      setUnreadCount(computeUnreadBadgeFromApiRows(inbox, requests));
      const mappedInbox = inbox.map((row) => mapInboxThreadRow(row));
      const mappedRequests = requests.map((row) => mapInboxThreadRow(row));
      const pendingCount = mappedRequests.filter((row) => row.pendingForMe).length;
      writeChatsCache(chatsCacheKey(authUser, 'inbox', badgeLangUk), mappedInbox, pendingCount, {
        user: authUser,
        langUk: badgeLangUk,
      });
      writeChatsCache(chatsCacheKey(authUser, 'requests', badgeLangUk), mappedRequests, pendingCount, {
        user: authUser,
        langUk: badgeLangUk,
      });
    } catch {
      readBadgeFromCache();
    }
  }, [send, readBadgeFromCache, authUser]);

  useEffect(() => {
    if (!send) return undefined;
    readBadgeFromCache();
    const subs = [
      DeviceEventEmitter.addListener(CHATS_CACHE_UPDATED, readBadgeFromCache),
      DeviceEventEmitter.addListener(WS_EVENT_NEW_MESSAGE, readBadgeFromCache),
      DeviceEventEmitter.addListener(WS_EVENT_THREAD_UPDATED, readBadgeFromCache),
      DeviceEventEmitter.addListener(WS_EVENT_CONNECTED, readBadgeFromCache),
    ];
    let timer = null;
    const startFallbackPoll = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (!isWsConnected()) void reloadUnread();
      }, 20000);
    };
    const task = runAfterInteractions(() => {
      if (!authUser) return;
      const lk = chatsLangUkFromUser(authUser);
      if (!hasChatsCache(chatsCacheKey(authUser, 'inbox', lk))) {
        void reloadUnread();
      }
    });
    if (!isWsConnected()) startFallbackPoll();
    const onDisconnected = DeviceEventEmitter.addListener(WS_EVENT_DISCONNECTED, () => {
      startFallbackPoll();
      void reloadUnread();
    });
    const onConnected = DeviceEventEmitter.addListener(WS_EVENT_CONNECTED, () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      readBadgeFromCache();
    });
    return () => {
      task.cancel();
      for (const sub of subs) sub.remove();
      onDisconnected.remove();
      onConnected.remove();
      if (timer) clearInterval(timer);
    };
  }, [reloadUnread, send, readBadgeFromCache, authUser]);

  const titleOnly =
    replaceCenterTitle != null && String(replaceCenterTitle).trim() !== ''
      ? replaceCenterTitle
      : !showBrandLogo && centerSubtitle != null && String(centerSubtitle).trim() !== ''
        ? centerSubtitle
        : null;

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingTop: insets.top,
          backgroundColor: barBg,
          borderBottomColor:
            transparentHeader
              ? isLight
                ? 'rgba(30, 30, 30, 0.06)'
                : 'rgba(255, 255, 255, 0.07)'
              : isLight && lightBarBackgroundColor != null
                ? 'rgba(30, 30, 30, 0.08)'
                : lightHeaderTransparent && isLight
                  ? 'rgba(30, 30, 30, 0.06)'
                  : isLight
                    ? 'rgba(30, 30, 30, 0.1)'
                    : 'rgba(255, 255, 255, 0.08)',
        },
      ]}
    >
      <View style={styles.row}>
        <View style={[styles.side, leftMode === 'menu' ? styles.sideMenu : styles.sideBack]}>
          {leftSlot != null ? (
            <View style={styles.leftSlotWrap}>{leftSlot}</View>
          ) : hideMenuButton && leftMode === 'menu' ? null : leftMode === 'back' ? (
            <Pressable
              onPress={onBackPress}
              hitSlop={12}
              style={({ pressed }) => [styles.iconHit, pressOverlay({ pressed })]}
              android_ripple={ripple}
              accessibilityRole="button"
              accessibilityLabel="Back"
              disabled={!onBackPress}
            >
              <Ionicons name="chevron-back" size={28} color={backColor} />
            </Pressable>
          ) : isLight ? (
            <Pressable
              onPress={onMenuPress}
              hitSlop={{ top: 14, bottom: 14, left: 8, right: 14 }}
              delayPressIn={0}
              delayPressOut={0}
              style={({ pressed }) => [styles.leftSlotHitLight, pressOverlay({ pressed })]}
              android_ripple={ripple}
              accessibilityRole="button"
              accessibilityLabel={lightMenuButton === 'hamburger' ? 'Menu' : 'Settings'}
              disabled={!onMenuPress}
            >
              {lightMenuButton === 'hamburger' ? (
                <Ionicons name="menu" size={menuSize} color={iconMenuLight} style={!onMenuPress ? { opacity: 0.35 } : null} />
              ) : (
                <Ionicons name="settings-outline" size={menuSize} color={iconMenuLight} style={!onMenuPress ? { opacity: 0.35 } : null} />
              )}
            </Pressable>
          ) : (
            <Pressable
              onPress={onMenuPress}
              hitSlop={{ top: 14, bottom: 14, left: 8, right: 14 }}
              delayPressIn={0}
              delayPressOut={0}
              style={({ pressed }) => [styles.iconHit, pressOverlay({ pressed })]}
              android_ripple={ripple}
              accessibilityRole="button"
              accessibilityLabel="Menu"
              disabled={!onMenuPress}
            >
              {menuIconSource !== MENU_ICON ? (
                <ExpoImage
                  source={menuIconSource}
                  style={[styles.menuImgFallback, !onMenuPress && styles.menuImgDisabled]}
                  contentFit="contain"
                  transition={0}
                />
              ) : (
                <Ionicons name="menu" size={menuSize} color={iconMenuDark} style={!onMenuPress ? { opacity: 0.35 } : null} />
              )}
            </Pressable>
          )}
        </View>
        <View
          style={[
            styles.centerLogo,
            showBrandLogo && centerSubtitle ? styles.centerLogoStacked : null,
          ]}
          pointerEvents="none"
        >
          {showBrandLogo ? (
            <>
              <PddHeaderWordmark isLight={isLight} fontSize={isLight ? 20 : 21} />
              {centerSubtitle ? (
                <FittingText
                  style={[
                    styles.centerSubtitle,
                    brandFontSansMedium,
                    { color: isLight ? '#181818' : 'rgba(255, 255, 255, 0.88)' },
                    Platform.OS === 'android' && styles.centerSubtitleAndroid,
                    Platform.OS === 'ios' && styles.centerSubtitleIOS,
                  ]}
                  minimumFontScale={0.78}
                >
                  {centerSubtitle}
                </FittingText>
              ) : null}
            </>
          ) : titleOnly ? (
            <FittingText
              style={[
                styles.replaceTitle,
                brandFontHeadMedium,
                { color: isLight ? '#181818' : 'rgba(255, 255, 255, 0.92)' },
              ]}
              numberOfLines={2}
              minimumFontScale={0.72}
            >
              {titleOnly}
            </FittingText>
          ) : (
            <View style={styles.centerSpacer} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
          )}
        </View>
        <View style={[styles.side, styles.sideSend]}>
          {rightSlot != null ? (
            <View style={styles.sendHit}>{rightSlot}</View>
          ) : send == null ? (
            <View style={styles.sendHit} />
          ) : (
            <Pressable
              onPress={send}
              hitSlop={12}
              delayPressIn={0}
              delayPressOut={0}
              style={({ pressed }) => [styles.sendHit, pressOverlay({ pressed })]}
              android_ripple={ripple}
              accessibilityRole="button"
              accessibilityLabel="Messages"
            >
              <View style={styles.sendIconWrap}>
                <ExpoImage
                  source={sendIcon}
                  style={styles.sendImg}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  transition={0}
                />
                {unreadCount > 0 ? (
                  <View
                    style={[
                      styles.msgBadge,
                      { borderColor: isLight ? '#F2F2EA' : '#000000' },
                    ]}
                  >
                    <Text style={styles.msgBadgeText}>{unreadCount > 99 ? '99+' : String(unreadCount)}</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: BAR_INNER_H,
    paddingHorizontal: 0,
  },
  side: {
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftSlotWrap: {
    minWidth: SIDE_TOUCH_W,
    minHeight: BAR_INNER_H,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: BAR_EDGE_INSET - 2,
  },
  sideMenu: {
    width: SIDE_SLOT_W,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: BAR_EDGE_INSET,
    paddingRight: 0,
  },
  /** Та сама ширина/відступ, що й sideMenu — логотип по центру однаково на iOS і Android */
  sideBack: {
    width: SIDE_SLOT_W,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: BAR_EDGE_INSET,
    paddingRight: 0,
  },
  /** iOS: легке затемнення при натисканні (на Android лишається ripple) */
  pressedIOS: {
    opacity: 0.65,
  },
  sideSend: {
    width: SIDE_SLOT_W,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: BAR_EDGE_INSET,
    paddingLeft: 0,
  },
  iconHit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Світла тема: іконка в слоті */
  leftSlotHitLight: {
    minWidth: SIDE_TOUCH_W,
    minHeight: BAR_INNER_H,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  sendHit: {
    minWidth: SIDE_TOUCH_W,
    minHeight: BAR_INNER_H,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  sendIconWrap: {
    position: 'relative',
    minWidth: 28,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendImg: { width: 20, height: 18 },
  msgBadge: {
    position: 'absolute',
    top: -10,
    right: -13,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FF3B30',
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#F2F2EA',
  },
  msgBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '800',
  },
  menuImgFallback: {
    width: 24,
    height: 16,
  },
  replaceTitle: {
    fontSize: 16,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 4,
    alignSelf: 'stretch',
    width: '100%',
  },
  centerSpacer: {
    minHeight: 22,
    alignSelf: 'stretch',
  },
  centerLogo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: BAR_INNER_H,
  },
  centerLogoStacked: {
    justifyContent: 'center',
    gap: 2,
  },
  centerSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: -0.14,
    marginTop: 3,
  },
  centerSubtitleAndroid: {
    includeFontPadding: false,
  },
  /** iOS: стабільна висота рядка під логотипом (без зайвого вертикального «padding» шрифту). */
  centerSubtitleIOS: {
    lineHeight: 18,
  },
  menuImgDisabled: {
    opacity: 0.35,
  },
});
