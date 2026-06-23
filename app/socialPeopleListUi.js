import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import ProfileAvatarCircle from './ProfileAvatarCircle';
import { brandFontSans, brandFontSansSemibold } from './brandFont';
import { resolveFeedMediaUrl } from './feedMediaUrl';

export function socialPersonDisplayName(item) {
  const display = String(item?.display_name || item?.displayName || '').trim();
  if (display) return display;
  const name = String(item?.name || '').trim();
  if (name && !name.startsWith('@')) return name;
  const username = String(item?.username || '').replace(/^@/, '').trim();
  return username || name || '';
}

export function SocialPeopleSearchBar({
  value,
  onChangeText,
  placeholder,
  isLight,
  accent,
  textMain,
  muted,
  searchBusy = false,
}) {
  const [focused, setFocused] = useState(false);
  const active = focused || value.length > 0;
  const idleBorder = isLight ? 'rgba(30,30,30,0.1)' : 'rgba(255,255,255,0.1)';
  const shellBg = isLight ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.08)';

  return (
    <View
      style={[
        styles.searchWrap,
        {
          backgroundColor: shellBg,
          borderColor: active ? accent : idleBorder,
        },
      ]}
    >
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={muted}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.searchInput, brandFontSans, { color: textMain }]}
      />
      {searchBusy ? (
        <ActivityIndicator size="small" color={accent} style={styles.searchTrailing} />
      ) : active ? (
        <Ionicons name="search-outline" size={22} color={accent} style={styles.searchTrailing} />
      ) : null}
    </View>
  );
}

export function SocialListActionBtn({
  icon,
  onPress,
  variant = 'primary',
  disabled = false,
  ripple,
  accessibilityLabel,
  isLight = false,
}) {
  const isDanger = variant === 'danger';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      android_ripple={ripple}
      style={({ pressed }) => [
        styles.actionBtn,
        isDanger ? styles.actionBtnDanger : styles.actionBtnPrimary,
        !isDanger && isLight && styles.actionBtnPrimaryLight,
        (pressed || disabled) && { opacity: 0.82 },
      ]}
    >
      <Ionicons
        name={icon}
        size={isDanger ? 18 : icon === 'add' ? 22 : 16}
        color={isDanger ? '#FFFFFF' : '#1E1E1E'}
      />
    </Pressable>
  );
}

export function SocialPersonRow({
  avatarUrl,
  displayName,
  onPress,
  onPressName,
  actions = null,
  isLight,
  textMain,
  border,
  isLast = false,
  ripple,
}) {
  const uri = avatarUrl ? resolveFeedMediaUrl(String(avatarUrl)) : '';
  const rowBody = (
    <>
      <ProfileAvatarCircle uri={uri} size={44} isLight={isLight} />
      <Pressable
        onPress={onPressName || onPress}
        disabled={!onPressName && !onPress}
        style={styles.namePress}
      >
        <Text style={[styles.personName, brandFontSansSemibold, { color: textMain }]} numberOfLines={1}>
          {displayName}
        </Text>
      </Pressable>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </>
  );

  if (onPress && !actions) {
    return (
      <Pressable
        onPress={onPress}
        android_ripple={ripple}
        style={({ pressed }) => [
          styles.row,
          !isLast && { borderBottomColor: border, borderBottomWidth: StyleSheet.hairlineWidth },
          pressed && { opacity: 0.72 },
        ]}
      >
        {rowBody}
      </Pressable>
    );
  }

  return (
    <View
      style={[
        styles.row,
        !isLast && { borderBottomColor: border, borderBottomWidth: StyleSheet.hairlineWidth },
      ]}
    >
      {rowBody}
    </View>
  );
}

export function SocialPeopleEmptyState({ icon = 'people-outline', title, subtitle, isLight, textMain, muted }) {
  return (
    <View style={styles.emptyWrap}>
      <Ionicons
        name={icon}
        size={56}
        color={isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.14)'}
      />
      <Text style={[styles.emptyTitle, brandFontSansSemibold, { color: textMain }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.emptySubtitle, brandFontSans, { color: muted }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

export function socialPeopleListColors(isLight) {
  return {
    textMain: isLight ? '#1E1E1E' : '#FFFFFF',
    muted: isLight ? '#6B6B75' : '#8E8E93',
    border: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)',
  };
}

const styles = StyleSheet.create({
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 10,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
    minHeight: 48,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 10,
  },
  searchTrailing: {
    marginLeft: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  namePress: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  personName: {
    fontSize: 16,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnPrimary: {
    backgroundColor: '#FFFFFF',
  },
  actionBtnPrimaryLight: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  actionBtnDanger: {
    backgroundColor: '#EB4335',
  },
  emptyWrap: {
    paddingVertical: 56,
    paddingHorizontal: 28,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
});
