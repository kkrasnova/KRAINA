import React, { useMemo, useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { brandFontText } from './brandFont';

const ACCENT = '#E1FF00';
const LEMON_BRIGHT = '#EEFF66';
const CODE_LENGTH = 6;
const BRAND_TEXT_FONT = brandFontText;

export default function ForgotPasswordOtpInput({
  value,
  onChangeText,
  onSubmitEditing,
  onFocus,
  onBlur,
  inputRef,
  focused = false,
  digitFontSize = 24,
  boxHeight = 56,
}) {
  const localRef = useRef(null);
  const ref = inputRef || localRef;
  const code = useMemo(() => (value || '').replace(/\D/g, '').slice(0, CODE_LENGTH), [value]);
  const activeIndex = code.length >= CODE_LENGTH ? CODE_LENGTH - 1 : code.length;

  const cells = useMemo(
    () => Array.from({ length: CODE_LENGTH }, (_, index) => code[index] || ''),
    [code],
  );

  return (
    <Pressable
      style={styles.wrap}
      onPress={() => ref.current?.focus()}
      accessibilityRole="none"
      accessibilityLabel="Verification code"
    >
      <View style={styles.row}>
        {cells.map((digit, index) => {
          const isFilled = digit !== '';
          const isActive = focused && index === activeIndex;
          return (
            <View
              key={index}
              style={[
                styles.box,
                { height: boxHeight },
                isFilled && styles.boxFilled,
                isActive && styles.boxActive,
              ]}
            >
              <Text
                style={[
                  styles.digit,
                  { fontSize: digitFontSize },
                  isFilled && styles.digitFilled,
                ]}
              >
                {digit}
              </Text>
              {isActive && !isFilled ? <View style={styles.cursor} /> : null}
            </View>
          );
        })}
      </View>
      <TextInput
        ref={ref}
        value={code}
        onChangeText={(text) => onChangeText?.(text.replace(/\D/g, '').slice(0, CODE_LENGTH))}
        onSubmitEditing={onSubmitEditing}
        onFocus={onFocus}
        onBlur={onBlur}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={CODE_LENGTH}
        keyboardAppearance="dark"
        selectionColor={ACCENT}
        returnKeyType="done"
        blurOnSubmit={false}
        caretHidden
        importantForAutofill="yes"
        style={styles.hiddenInput}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    position: 'relative',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 8,
    maxWidth: 340,
  },
  box: {
    width: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 4,
      },
      android: { elevation: 1 },
      default: {},
    }),
  },
  boxFilled: {
    borderColor: 'rgba(238, 255, 102, 0.35)',
    backgroundColor: 'rgba(225, 255, 0, 0.08)',
  },
  boxActive: {
    borderColor: LEMON_BRIGHT,
    backgroundColor: 'rgba(225, 255, 0, 0.1)',
    ...Platform.select({
      ios: {
        shadowColor: LEMON_BRIGHT,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.45,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  digit: {
    ...BRAND_TEXT_FONT,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.22)',
    textAlign: 'center',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  digitFilled: {
    color: ACCENT,
  },
  cursor: {
    position: 'absolute',
    width: 2,
    height: 24,
    borderRadius: 1,
    backgroundColor: LEMON_BRIGHT,
  },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.01,
    fontSize: 1,
    color: 'transparent',
  },
});
