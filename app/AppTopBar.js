import React, { useCallback, useEffect, useState, memo } from 'react';
import { View, Pressable, Text, StyleSheet, Platform } from 'react-native';
import { runAfterInteractions } from './runAfterInteractions';
import { Image as ExpoImage } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import PddHeaderWordmark from './PddHeaderWordmark';
import { brandFontHeadMedium, brandFontSansMedium } from './brandFont';
import { hasMessageApiToken, messagesListThreads } from './messageApi';

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

  const iconMenuDark = '#FFFFFF';
  const iconMenuLight = '#1E1E1E';
  const planeSize = 24;
  const menuSize = 26;

  const pressOverlay = ({ pressed }) =>
    Platform.OS === 'ios' && pressed ? styles.pressedIOS : null;

  const reloadUnread = useCallback(async () => {
    if (!send || !hasMessageApiToken()) {
      setUnreadCount(0);
      return;
    }
    try {
      const [inboxRows, requestRows] = await Promise.all([
        messagesListThreads('inbox'),
        messagesListThreads('requests'),
      ]);
      const rows = [...(Array.isArray(inboxRows) ? inboxRows : []), ...(Array.isArray(requestRows) ? requestRows : [])];
      const next = rows.reduce(
        (acc, row) =>
          acc +
          Math.max(0, Number(row?.unread_count) || 0) +
          (row?.pending_for_me ? 1 : 0),
        0,
      );
      setUnreadCount(next);
    } catch {
      setUnreadCount(0);
    }
  }, [send]);

  useEffect(() => {
    if (!send) return undefined;
    const task = runAfterInteractions(() => {
      void reloadUnread();
    });
    const timer = setInterval(() => {
      void reloadUnread();
    }, 12000);
    return () => {
      task.cancel();
      clearInterval(timer);
    };
  }, [reloadUnread, send]);

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
                <Text
                  style={[
                    styles.centerSubtitle,
                    brandFontSansMedium,
                    { color: isLight ? '#181818' : 'rgba(255, 255, 255, 0.88)' },
                    Platform.OS === 'android' && styles.centerSubtitleAndroid,
                    Platform.OS === 'ios' && styles.centerSubtitleIOS,
                  ]}
                  numberOfLines={1}
                >
                  {centerSubtitle}
                </Text>
              ) : null}
            </>
          ) : titleOnly ? (
            <Text
              style={[
                styles.replaceTitle,
                brandFontHeadMedium,
                { color: isLight ? '#181818' : 'rgba(255, 255, 255, 0.92)' },
              ]}
              numberOfLines={2}
              adjustsFontSizeToFit={Platform.OS === 'ios'}
              minimumFontScale={0.82}
            >
              {titleOnly}
            </Text>
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
              hitSlop={{ top: 12, bottom: 12, left: 14, right: 8 }}
              delayPressIn={0}
              delayPressOut={0}
              style={({ pressed }) => [styles.sendHit, pressOverlay({ pressed })]}
              android_ripple={ripple}
              accessibilityRole="button"
              accessibilityLabel="Messages"
            >
              <View style={styles.sendIconWrap}>
                <Ionicons
                  name="paper-plane-outline"
                  size={planeSize}
                  color={isLight ? iconMenuLight : iconMenuDark}
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
