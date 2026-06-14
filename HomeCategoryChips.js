import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { HOME_CATEGORY_IDS } from './homeLandmarkCategories';
import { mt } from './mainPageI18n';
import { accentForTheme, onAccentButtonText } from './themeAccent';

export default function HomeCategoryChips({ language, appTheme, selectedId, onSelect }) {
  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const muted = isLight ? '#5C5C5C' : '#9A9A9A';

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: textMain }]}>{mt(language, 'homeCategoryTitle')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        decelerationRate="fast"
      >
        {HOME_CATEGORY_IDS.map((id) => {
          const selected = id === selectedId;
          return (
            <Pressable
              key={id}
              onPress={() => onSelect?.(id)}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: selected
                    ? accent
                    : isLight
                      ? 'rgba(0,0,0,0.06)'
                      : 'rgba(255,255,255,0.1)',
                  borderColor: selected ? accent : isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.14)',
                  opacity: pressed ? 0.88 : 1,
                },
              ]}
            >
              <Text
                style={[styles.chipText, { color: selected ? onAccentButtonText(isLight) : muted }]}
                numberOfLines={1}
              >
                {mt(language, `homeCat_${id}`)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: -4, marginBottom: 16 },
  title: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  scroll: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
