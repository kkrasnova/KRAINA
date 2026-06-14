import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { brandFontText } from './brandFont';
import { rippleOnDarkSurface } from './androidFeedback';

const ACCENT = '#E1FF00';
const TEXT_DARK = '#121212';
const BORDER = 'rgba(255, 255, 255, 0.22)';
const INACTIVE_TEXT = '#FFFFFF';

const BRAND_TEXT_FONT = brandFontText;

function AuthTabButton({ label, selected, onPress, accessibilityLabel }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        selected ? styles.buttonActive : styles.buttonInactive,
        pressed && styles.buttonPressed,
      ]}
      android_ripple={rippleOnDarkSurface}
      accessibilityRole="tab"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
    >
      <Text
        style={[styles.buttonText, selected ? styles.buttonTextActive : styles.buttonTextInactive]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function AuthTabSwitcher({
  activeTab,
  onChange,
  loginLabel,
  registerLabel,
  style,
}) {
  return (
    <View style={[styles.row, style]} accessibilityRole="tablist">
      <AuthTabButton
        label={loginLabel}
        selected={activeTab === 'login'}
        onPress={() => onChange('login')}
        accessibilityLabel={loginLabel}
      />
      <AuthTabButton
        label={registerLabel}
        selected={activeTab === 'register'}
        onPress={() => onChange('register')}
        accessibilityLabel={registerLabel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
    alignItems: 'stretch',
  },
  button: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  buttonInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: BORDER,
  },
  buttonActive: {
    backgroundColor: ACCENT,
    borderWidth: 1,
    borderColor: '#B8D600',
    ...Platform.select({
      ios: {
        shadowColor: ACCENT,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonText: {
    fontSize: 14,
    lineHeight: 18,
    textAlign: 'center',
  },
  buttonTextInactive: {
    color: INACTIVE_TEXT,
    ...(Platform.OS === 'android'
      ? { fontFamily: 'sans-serif-medium', includeFontPadding: false }
      : { ...BRAND_TEXT_FONT, fontWeight: '500' }),
  },
  buttonTextActive: {
    color: TEXT_DARK,
    ...(Platform.OS === 'android'
      ? { fontFamily: 'sans-serif-medium', includeFontPadding: false }
      : { ...BRAND_TEXT_FONT, fontWeight: '700' }),
  },
});
