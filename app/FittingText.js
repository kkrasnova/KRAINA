import React from 'react';
import { Platform, Text } from 'react-native';

/**
 * Title/label text that shrinks to keep long translations visible
 * instead of hyphenating a single word across lines (e.g. IT "Geolocalizzazione").
 */
export default function FittingText({
  children,
  style,
  numberOfLines = 1,
  minimumFontScale = 0.55,
  allowFontScaling = true,
  ...rest
}) {
  return (
    <Text
      {...rest}
      style={style}
      numberOfLines={numberOfLines}
      adjustsFontSizeToFit
      minimumFontScale={minimumFontScale}
      allowFontScaling={allowFontScaling}
      maxFontSizeMultiplier={Platform.OS === 'ios' ? 1.25 : 1.35}
    >
      {children}
    </Text>
  );
}
