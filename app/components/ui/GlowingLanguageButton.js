import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  View,
  Text,
  StyleSheet,
  Platform,
  Animated,
} from 'react-native';
import { noAndroidRipple } from '../../androidFeedback';

const LEMON = '#E1FF00';
const INK = '#0A0B0C';

export default function GlowingLanguageButton({
  flag,
  labelNode,
  flagFontSize = 22,
  selected = false,
  onPress,
  minHeight = 52,
  compact = false,
  style,
  accessibilityLabel,
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const selectPop = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const [pressed, setPressed] = useState(false);
  const wasSelected = useRef(selected);

  useEffect(() => {
    if (selected && !wasSelected.current) {
      selectPop.setValue(0);
      Animated.spring(selectPop, {
        toValue: 1,
        friction: 6,
        tension: 240,
        useNativeDriver: true,
      }).start();
    } else {
      selectPop.setValue(selected ? 1 : 0);
    }
    wasSelected.current = selected;
  }, [selected, selectPop]);

  const onPressIn = () => {
    setPressed(true);
    Animated.spring(scale, {
      toValue: 0.98,
      friction: 8,
      tension: 400,
      useNativeDriver: true,
    }).start();
  };

  const onPressOut = () => {
    setPressed(false);
    Animated.spring(scale, {
      toValue: 1,
      friction: 7,
      tension: 300,
      useNativeDriver: true,
    }).start();
  };

  const flagScale = selectPop.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.1, 1],
  });

  const radius = compact ? 18 : 20;
  const flagBox = compact ? 30 : 36;
  const checkBox = compact ? 20 : 24;

  return (
    <Animated.View
      style={[
        styles.wrap,
        { transform: [{ scale }], opacity: pressed ? 0.94 : 1 },
        style,
      ]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={accessibilityLabel}
        android_ripple={noAndroidRipple}
        style={[
          styles.card,
          {
            minHeight,
            borderRadius: radius,
            borderColor: selected ? LEMON : 'rgba(255,255,255,0.1)',
            borderWidth: selected ? 1.5 : 1,
            backgroundColor: selected ? LEMON : 'rgba(255,255,255,0.05)',
            ...(Platform.OS === 'ios'
              ? {
                  shadowColor: selected ? LEMON : '#000',
                  shadowOpacity: selected ? 0.35 : 0.25,
                  shadowRadius: selected ? 12 : 6,
                  shadowOffset: { width: 0, height: selected ? 4 : 2 },
                }
              : { elevation: selected ? 5 : 1 }),
          },
        ]}
      >
        <View
          style={[
            styles.row,
            {
              minHeight: Math.max(compact ? 28 : 34, minHeight - 8),
              paddingVertical: compact ? 5 : 8,
              paddingHorizontal: compact ? 8 : 12,
              gap: compact ? 8 : 12,
            },
          ]}
        >
          <Animated.View
            style={[
              styles.flagBadge,
              {
                width: flagBox,
                height: flagBox,
                borderRadius: compact ? 10 : 12,
                backgroundColor: selected ? 'rgba(0,0,0,0.1)' : 'rgba(225,255,0,0.1)',
                transform: [{ scale: flagScale }],
              },
            ]}
          >
            <Text
              style={[
                styles.flag,
                {
                  fontSize: flagFontSize,
                  lineHeight: Math.round(flagFontSize * 1.2),
                },
              ]}
            >
              {flag ?? ''}
            </Text>
          </Animated.View>

          <View style={styles.labelFlex}>{labelNode}</View>

          {selected ? (
            <View
              style={[
                styles.checkBadge,
                { width: checkBox, height: checkBox, borderRadius: checkBox / 2 },
              ]}
            >
              <Text style={[styles.checkMark, compact && { fontSize: 11 }]}>✓</Text>
            </View>
          ) : (
            <View style={styles.idleRing} />
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  card: {
    width: '100%',
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flagBadge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  flag: {
    textAlign: 'center',
    ...Platform.select({
      android: { textAlignVertical: 'center', includeFontPadding: true },
      ios: {},
    }),
  },
  labelFlex: {
    flex: 1,
    minWidth: 0,
  },
  checkBadge: {
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    fontSize: 12,
    fontWeight: '800',
    color: LEMON,
    marginTop: -1,
  },
  idleRing: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: 'rgba(225,255,0,0.28)',
  },
});
