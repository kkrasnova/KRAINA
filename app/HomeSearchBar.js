import React, { memo } from 'react';
import { View, TextInput, StyleSheet, Platform, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ACCENT_BLUE, ACCENT_LEMON } from './themeAccent';

/**
 * Універсальний пошук: заокруглений прямокутник (не «капсула»), іконка зліва в бейджі, light/dark.
 */
const LIGHT_BG = '#F3F3F0';
const LIGHT_BORDER = 'rgba(30, 30, 30, 0.09)';
const LIGHT_BORDER_FOCUS = 'rgba(2, 18, 235, 0.45)';
const LIGHT_ICON_BADGE = 'rgba(98, 134, 228, 0.18)';
const LIGHT_PLACEHOLDER = '#6B6B6B';
const LIGHT_TEXT = '#1E1E1E';

const DARK_BG = 'rgba(38, 38, 38, 0.96)';
const DARK_BORDER = 'rgba(255, 255, 255, 0.11)';
const DARK_BORDER_FOCUS = 'rgba(225, 255, 0, 0.55)';
const DARK_ICON_BADGE = 'rgba(225, 255, 0, 0.14)';
const DARK_PLACEHOLDER = 'rgba(244, 244, 234, 0.45)';
const DARK_TEXT = '#F4F4EA';

/** Як картки на головній (~16), без повної капсули. */
const BAR_RADIUS = 14;
const BAR_MIN_H = 50;

function HomeSearchBar({
  variant = 'light',
  placeholder,
  value,
  onChangeText,
  editable = true,
  wrapStyle,
  onFocus,
  onBlur,
  onBarPress,
  onInputPressIn,
  focused = false,
  textInputRef,
  keyboardOnFocus = false,
}) {
  const isDark = variant === 'dark';

  const borderColor = focused
    ? isDark
      ? DARK_BORDER_FOCUS
      : LIGHT_BORDER_FOCUS
    : isDark
      ? DARK_BORDER
      : LIGHT_BORDER;

  const shellShadow = isDark
    ? {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
      }
    : {
        shadowColor: '#1E1E1E',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      };

  return (
    <Pressable
      onPress={onBarPress}
      style={[
        styles.shell,
        shellShadow,
        {
          backgroundColor: isDark ? DARK_BG : LIGHT_BG,
          borderColor,
          borderWidth: focused ? 2 : StyleSheet.hairlineWidth * 2,
        },
        Platform.OS === 'android' && {
          elevation: focused ? (isDark ? 8 : 4) : isDark ? 6 : 3,
        },
        wrapStyle,
      ]}
    >
      <View style={[styles.iconBadge, { backgroundColor: isDark ? DARK_ICON_BADGE : LIGHT_ICON_BADGE }]}>
        <Ionicons name="search" size={19} color={isDark ? ACCENT_LEMON : ACCENT_BLUE} />
      </View>
      <TextInput
        ref={textInputRef}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={isDark ? DARK_PLACEHOLDER : LIGHT_PLACEHOLDER}
        editable={editable}
        style={[styles.input, { color: isDark ? DARK_TEXT : LIGHT_TEXT }]}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        accessibilityLabel={placeholder}
        onFocus={onFocus}
        onBlur={onBlur}
        onPressIn={onInputPressIn}
        showSoftInputOnFocus={keyboardOnFocus}
        underlineColorAndroid="transparent"
        selectionColor={isDark ? ACCENT_LEMON : 'rgba(98, 134, 228, 0.55)'}
        cursorColor={isDark ? ACCENT_LEMON : ACCENT_BLUE}
        keyboardAppearance={isDark ? 'dark' : 'light'}
      />
    </Pressable>
  );
}

export default memo(HomeSearchBar);

const styles = StyleSheet.create({
  shell: {
    alignSelf: 'stretch',
    width: '100%',
    minHeight: BAR_MIN_H,
    borderRadius: BAR_RADIUS,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 6,
    paddingRight: 16,
    paddingVertical: 6,
    overflow: 'hidden',
    marginBottom: 18,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    paddingVertical: 0,
    paddingHorizontal: 0,
    margin: 0,
    lineHeight: 20,
    ...(Platform.OS === 'android' ? { includeFontPadding: false, textAlignVertical: 'center' } : {}),
  },
});
