import React, { useRef, useState } from 'react';
import {
  Pressable,
  View,
  Text,
  StyleSheet,
  Platform,
  Animated,
} from 'react-native';
import { noAndroidRipple } from '../../androidFeedback';

function hexToRgba(hex, alpha = 1) {
  let hexValue = String(hex || '').replace('#', '');
  if (hexValue.length === 3) {
    hexValue = hexValue
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const r = parseInt(hexValue.substring(0, 2), 16);
  const g = parseInt(hexValue.substring(2, 4), 16);
  const b = parseInt(hexValue.substring(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return `rgba(0, 0, 0, ${alpha})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}


const LEMON = '#E1FF00';


export default function GlowingLanguageButton({
  flag,
  labelNode,
  flagFontSize = 26,
  selected = false,
  onPress,
  minHeight = 42,
  style,
  accessibilityLabel,
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);

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
      tension: 320,
      useNativeDriver: true,
    }).start();
  };

  const lemonActive = pressed || selected;
  const leftBg = pressed
    ? hexToRgba(LEMON, 0.82)
    : 'rgba(255, 255, 255, 0.13)';
  const borderColor = 'transparent';
  const rightBg = pressed
    ? hexToRgba(LEMON, 0.26)
    : 'rgba(8, 9, 14, 0.96)';

  return (
    <Animated.View
      style={[
        styles.wrap,
        { transform: [{ scale }], opacity: pressed ? 0.9 : 1 },
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
            borderRadius: 999,
            borderCurve: 'continuous',
            borderColor,
            ...(Platform.OS === 'android' ? { elevation: 0 } : {}),
          },
          selected && styles.cardSelected,
        ]}
      >
        <View style={[styles.split, { minHeight: Math.max(34, minHeight - 2) }]}>
          <View
            style={[
              styles.leftPane,
              {
                backgroundColor: leftBg,
                borderRightColor: lemonActive ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.08)',
                borderTopLeftRadius: 999,
                borderBottomLeftRadius: 999,
              },
            ]}
          >
            <Text style={[styles.flag, { fontSize: flagFontSize }]}>{flag ?? ''}</Text>
          </View>
          <View
            style={[
              styles.rightPane,
              {
                backgroundColor: rightBg,
                borderTopRightRadius: 999,
                borderBottomRightRadius: 999,
              },
            ]}
          >
            {labelNode}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const FLAG_PANE_W = 56;

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  card: {
    width: '100%',
    borderRadius: 999,
    borderWidth: 0,
    overflow: 'hidden',
    backgroundColor: 'rgba(6, 7, 11, 0.95)',
  },
  cardSelected: {
    borderWidth: 0,
  },
  split: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 999,
    overflow: 'hidden',
  },
  leftPane: {
    width: FLAG_PANE_W,
    borderRightWidth: 1,
    borderTopLeftRadius: 999,
    borderBottomLeftRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  flag: {
    lineHeight: 32,
    textAlign: 'center',
    textShadowColor: 'rgba(255,255,255,0.45)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
    ...Platform.select({
      android: { textAlignVertical: 'center', includeFontPadding: true },
      ios: {},
    }),
  },
  rightPane: {
    flex: 1,
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
    justifyContent: 'center',
    paddingVertical: 4,
    paddingLeft: 12,
    paddingRight: 10,
    minWidth: 0,
  },
});
