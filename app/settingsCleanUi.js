import React from 'react';
import { View, Text, StyleSheet, Platform, Pressable, Switch } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { accentForTheme, onAccentButtonText } from './themeAccent';

export function settingsCleanPalette(isLight) {
  return {
    isLight,
    accent: accentForTheme(isLight),
    onAccentTxt: onAccentButtonText(isLight),
    textMain: isLight ? '#1E1E1E' : '#FFFFFF',
    textMuted: isLight ? '#727272' : 'rgba(255,255,255,0.68)',
    hairline: isLight ? 'rgba(30, 30, 30, 0.1)' : 'rgba(255, 255, 255, 0.1)',
  };
}

export function settingsSwitchColors(isLight, accent, on) {
  return {
    trackColor: {
      false: isLight ? '#D8D8D4' : '#2A2A2A',
      true: isLight ? 'rgba(2,18,235,0.45)' : 'rgba(225,255,0,0.45)',
    },
    thumbColor: isLight ? (on ? accent : '#AEAEAA') : on ? accent : '#888888',
    ios_backgroundColor: isLight ? '#D8D8D4' : '#2A2A2A',
  };
}

export function SettingsCleanHero({ palette, icon, iconPosition = 'left', title, titleStyle, subtitle, subtitleStyle }) {
  const iconEl = icon ? <Ionicons name={icon} size={32} color={palette.accent} /> : null;

  if (icon && iconPosition === 'right') {
    return (
      <View style={styles.hero}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroTextCol}>
            <Text
              style={[styles.heroTitle, styles.heroTitleInRow, titleStyle, { color: palette.textMain }]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.84}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text style={[styles.heroLead, subtitleStyle, { color: palette.textMuted }]}>{subtitle}</Text>
            ) : null}
          </View>
          <View style={styles.heroMarkRight}>{iconEl}</View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.hero}>
      {iconEl ? <View style={styles.heroMark}>{iconEl}</View> : null}
      <Text
        style={[styles.heroTitle, titleStyle, { color: palette.textMain }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.84}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text style={[styles.heroLead, subtitleStyle, { color: palette.textMuted }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

export function SettingsCleanSwitchRow({
  palette,
  icon,
  title,
  titleStyle,
  subtitle,
  subtitleStyle,
  value,
  onValueChange,
  disabled = false,
  switchPointerEvents = 'auto',
  isLast = false,
  spaced = false,
}) {
  const sw = settingsSwitchColors(palette.isLight, palette.accent, value);
  return (
    <View
      style={[
        styles.row,
        spaced && styles.rowSpaced,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.hairline },
      ]}
    >
      <View style={styles.iconSlot}>
        <Ionicons name={icon} size={22} color={palette.accent} />
      </View>
      <View style={styles.rowTexts}>
        <Text style={[styles.rowTitle, titleStyle, { color: palette.textMain }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.rowSubtitle, subtitleStyle, { color: palette.textMuted }]}>{subtitle}</Text>
        ) : null}
      </View>
      <View style={styles.switchSlot}>
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          pointerEvents={switchPointerEvents}
          trackColor={sw.trackColor}
          thumbColor={sw.thumbColor}
          ios_backgroundColor={sw.ios_backgroundColor}
        />
      </View>
    </View>
  );
}

export function SettingsCleanPressRow({
  palette,
  icon,
  title,
  titleStyle,
  subtitle,
  subtitleStyle,
  onPress,
  disabled = false,
  showChevron = true,
  isLast = false,
  spaced = false,
  ripple,
  right,
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      android_ripple={ripple}
      style={({ pressed }) => [
        styles.row,
        spaced && styles.rowSpaced,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.hairline },
        pressed && !disabled && { opacity: 0.88 },
      ]}
    >
      <View style={styles.iconSlot}>
        <Ionicons name={icon} size={22} color={palette.accent} />
      </View>
      <View style={styles.rowTexts}>
        <Text style={[styles.rowTitle, titleStyle, { color: palette.textMain }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.rowSubtitle, subtitleStyle, { color: palette.textMuted }]}>{subtitle}</Text>
        ) : null}
      </View>
      {right != null ? right : showChevron ? <Ionicons name="chevron-forward" size={20} color={palette.textMuted} /> : null}
    </Pressable>
  );
}

export function SettingsCleanFootnote({ palette, children, style }) {
  return (
    <Text style={[styles.footnote, { color: palette.textMuted }, style]}>{children}</Text>
  );
}

export function SettingsCleanLegalNote({
  palette,
  prefix,
  privacyLabel,
  join,
  termsLabel,
  onPrivacyPress,
  onTermsPress,
  style,
}) {
  return (
    <Text style={[styles.legalNote, { color: palette.textMuted }, style]}>
      {prefix}
      <Text style={[styles.legalLink, { color: palette.accent }]} onPress={onPrivacyPress}>
        {privacyLabel}
      </Text>
      {join}
      <Text style={[styles.legalLink, { color: palette.accent }]} onPress={onTermsPress}>
        {termsLabel}
      </Text>
      .
    </Text>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'flex-start',
    paddingTop: 6,
    paddingBottom: 20,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    gap: 12,
  },
  heroTextCol: {
    flex: 1,
    minWidth: 0,
  },
  heroMark: {
    marginBottom: 14,
  },
  heroMarkRight: {
    paddingTop: 2,
    flexShrink: 0,
  },
  heroTitle: {
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.4,
    textAlign: 'left',
    alignSelf: 'stretch',
    marginBottom: 8,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  heroTitleInRow: {
    marginBottom: 6,
  },
  heroLead: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'left',
    alignSelf: 'stretch',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 58,
    paddingVertical: 11,
    gap: 12,
  },
  rowSpaced: {
    marginTop: 18,
  },
  iconSlot: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTexts: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  switchSlot: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    fontSize: 15,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  rowSubtitle: {
    fontSize: 13,
    marginBottom: 2,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  footnote: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
    marginBottom: 8,
    opacity: 0.88,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  legalNote: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 20,
    marginBottom: 8,
    opacity: 0.9,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  legalLink: {
    textDecorationLine: 'underline',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  pagePad: {
    paddingHorizontal: 20,
  },
});
