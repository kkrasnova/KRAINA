import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Dimensions,
  Easing,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { brandFontText } from './brandFont';
import { rippleOnDarkSurface } from './androidFeedback';
import FittingText from './FittingText';

const ACCENT = '#EEFF66';
const LEMON_BRIGHT = '#F5FF7A';
const BG_DARK = '#000000';
const TEXT_LIGHT = '#FFFFFF';
const BRAND_TEXT_FONT = brandFontText;

const EDGE_WIDTH = 72;
const DOWN_DISMISS_PX = 48;

/**
 * Terms sheet — always really closes (unmount + onClose), not only animates away.
 * Dismiss: back arrow | swipe down on handle | swipe left → right.
 */
export default function TermsOfUseSheetModal({
  visible,
  onClose,
  title,
  content,
  subtitle = 'KRAÏNA x ITty Company',
  backAccessibilityLabel = 'Back',
}) {
  const winH = Dimensions.get('window').height;
  const winW = Dimensions.get('window').width;
  const sheetHeight = Math.min(winH * 0.78, 680);

  const [mounted, setMounted] = useState(false);
  const translateY = useRef(new Animated.Value(winH)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);
  const forceCloseTimerRef = useRef(null);
  const dragAxisRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const mountedRef = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    mountedRef.current = mounted;
  }, [mounted]);

  const clearForceTimer = useCallback(() => {
    if (forceCloseTimerRef.current) {
      clearTimeout(forceCloseTimerRef.current);
      forceCloseTimerRef.current = null;
    }
  }, []);

  const finishClose = useCallback(() => {
    clearForceTimer();
    closingRef.current = false;
    dragAxisRef.current = null;
    translateY.setValue(winH);
    translateX.setValue(0);
    backdrop.setValue(0);
    setMounted(false);
    onCloseRef.current?.();
  }, [backdrop, clearForceTimer, translateX, translateY, winH]);

  const finishCloseRef = useRef(finishClose);
  useEffect(() => {
    finishCloseRef.current = finishClose;
  }, [finishClose]);

  const runDismiss = useCallback(
    (direction) => {
      if (closingRef.current) return;
      closingRef.current = true;
      clearForceTimer();

      // Hard guarantee: even if the animation callback glitches, we still close.
      forceCloseTimerRef.current = setTimeout(() => {
        if (mountedRef.current) finishCloseRef.current();
      }, 420);

      const anims =
        direction === 'right'
          ? [
              Animated.timing(translateX, {
                toValue: winW,
                duration: 240,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }),
              Animated.timing(backdrop, {
                toValue: 0,
                duration: 200,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
              }),
            ]
          : [
              Animated.timing(translateY, {
                toValue: winH,
                duration: 260,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }),
              Animated.timing(translateX, {
                toValue: 0,
                duration: 160,
                useNativeDriver: true,
              }),
              Animated.timing(backdrop, {
                toValue: 0,
                duration: 220,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
              }),
            ];

      Animated.parallel(anims).start(() => {
        finishCloseRef.current();
      });
    },
    [backdrop, clearForceTimer, translateX, translateY, winH, winW],
  );

  const dismissDownRef = useRef(() => runDismiss('down'));
  const dismissRightRef = useRef(() => runDismiss('right'));
  useEffect(() => {
    dismissDownRef.current = () => runDismiss('down');
    dismissRightRef.current = () => runDismiss('right');
  }, [runDismiss]);

  const springBack = useCallback(() => {
    if (closingRef.current) return;
    dragAxisRef.current = null;
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 22,
        stiffness: 280,
      }),
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        damping: 22,
        stiffness: 280,
      }),
      Animated.timing(backdrop, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdrop, translateX, translateY]);

  useEffect(() => {
    if (!visible) {
      // Parent already closed — tear down if we are still up.
      if (mountedRef.current && !closingRef.current) {
        clearForceTimer();
        setMounted(false);
        translateY.setValue(winH);
        translateX.setValue(0);
        backdrop.setValue(0);
      }
      return undefined;
    }

    closingRef.current = false;
    dragAxisRef.current = null;
    clearForceTimer();
    setMounted(true);
    translateY.stopAnimation();
    translateX.stopAnimation();
    backdrop.stopAnimation();
    translateX.setValue(0);
    translateY.setValue(sheetHeight + 120);
    backdrop.setValue(0);

    const id = requestAnimationFrame(() => {
      Animated.parallel([
        Animated.timing(backdrop, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 24,
          stiffness: 240,
          mass: 0.9,
        }),
      ]).start();
    });
    return () => cancelAnimationFrame(id);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mounted) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      dismissDownRef.current();
      return true;
    });
    return () => sub.remove();
  }, [mounted]);

  useEffect(() => () => clearForceTimer(), [clearForceTimer]);

  const handlePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_, g) => g.dy > 8 && g.dy >= Math.abs(g.dx) * 1.15,
        onMoveShouldSetPanResponderCapture: (_, g) => g.dy > 12 && g.dy > Math.abs(g.dx) * 1.2,
        onPanResponderTerminationRequest: (_, g) => !(g.dy > 12 && g.dy > Math.abs(g.dx) * 1.2),
        onPanResponderGrant: () => {
          dragAxisRef.current = 'y';
          translateY.stopAnimation();
          translateX.stopAnimation();
          translateX.setValue(0);
        },
        onPanResponderMove: (_, g) => {
          const dy = Math.max(0, g.dy);
          translateY.setValue(dy);
          backdrop.setValue(Math.max(0, 1 - dy / 280));
        },
        onPanResponderRelease: (_, g) => {
          if (g.dy > DOWN_DISMISS_PX || (g.dy > 28 && g.vy > 0.22)) {
            dismissDownRef.current();
            return;
          }
          springBack();
        },
        onPanResponderTerminate: () => {
          if (!closingRef.current) springBack();
        },
      }),
    [backdrop, springBack, translateX, translateY],
  );

  const edgePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_, g) =>
          g.dx > 4 && Math.abs(g.dx) > Math.abs(g.dy) * 0.8,
        onMoveShouldSetPanResponderCapture: (_, g) =>
          g.dx > 6 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          dragAxisRef.current = 'x';
          translateX.stopAnimation();
          translateY.setValue(0);
        },
        onPanResponderMove: (_, g) => {
          const dx = Math.max(0, g.dx);
          translateX.setValue(dx);
          backdrop.setValue(Math.max(0, 1 - dx / 260));
        },
        onPanResponderRelease: (_, g) => {
          if (g.dx > 36 || (g.dx > 20 && g.vx > 0.18)) {
            dismissRightRef.current();
            return;
          }
          springBack();
        },
        onPanResponderTerminate: () => {
          if (!closingRef.current) springBack();
        },
      }),
    [backdrop, springBack, translateX, translateY],
  );

  if (!mounted) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => dismissDownRef.current()}
    >
      <View style={styles.overlayRoot}>
        <Animated.View pointerEvents="none" style={[styles.backdrop, { opacity: backdrop }]} />
        <View style={styles.centerWrap} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.sheet,
              {
                height: sheetHeight,
                transform: [{ translateX }, { translateY }],
              },
            ]}
          >
            <View style={styles.dragZone} {...handlePanResponder.panHandlers}>
              <View style={styles.handleHit}>
                <View style={styles.handle} />
              </View>
              <View style={styles.header}>
                <FittingText style={styles.title} minimumFontScale={0.68}>
                  {title}
                </FittingText>
                <FittingText style={styles.subtitle} minimumFontScale={0.78}>
                  {subtitle}
                </FittingText>
              </View>
            </View>
            <View style={styles.divider} />

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              scrollEnabled
              showsVerticalScrollIndicator
              indicatorStyle="white"
              bounces
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              {...(Platform.OS === 'ios' ? { directionalLockEnabled: true } : {})}
            >
              <Text style={styles.body}>{content}</Text>
            </ScrollView>

            <View style={styles.edgeSwipeZone} {...edgePanResponder.panHandlers} />

            <Pressable
              onPress={() => dismissDownRef.current()}
              hitSlop={20}
              android_ripple={rippleOnDarkSurface}
              style={styles.backBtn}
              accessibilityRole="button"
              accessibilityLabel={backAccessibilityLabel}
            >
              <Ionicons name="chevron-back" size={24} color={ACCENT} />
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  centerWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  sheet: {
    width: '100%',
    maxWidth: 368,
    maxHeight: '88%',
    backgroundColor: BG_DARK,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(238, 255, 102, 0.5)',
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 18,
    shadowColor: LEMON_BRIGHT,
    shadowOpacity: 0.48,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 },
    elevation: 16,
    overflow: 'hidden',
  },
  backBtn: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 30,
    elevation: 30,
    minWidth: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  edgeSwipeZone: {
    position: 'absolute',
    left: 0,
    top: 56,
    bottom: 0,
    width: EDGE_WIDTH,
    zIndex: 15,
  },
  dragZone: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingTop: 2,
    paddingBottom: 4,
    zIndex: 5,
  },
  handleHit: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginBottom: 2,
  },
  handle: {
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(238, 255, 102, 0.55)',
    ...Platform.select({
      ios: {
        shadowColor: LEMON_BRIGHT,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.65,
        shadowRadius: 6,
      },
      default: {},
    }),
  },
  header: {
    alignItems: 'center',
    paddingTop: 4,
    marginBottom: 12,
    paddingHorizontal: 36,
  },
  title: {
    ...BRAND_TEXT_FONT,
    fontSize: 22,
    fontWeight: '500',
    color: TEXT_LIGHT,
    textAlign: 'center',
    marginBottom: 6,
    width: '100%',
    ...Platform.select({
      ios: {
        textShadowColor: 'rgba(238, 255, 102, 0.3)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 8,
      },
      default: {},
    }),
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    width: '100%',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(238, 255, 102, 0.28)',
    marginBottom: 12,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 12,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    color: 'rgba(255,255,255,0.88)',
  },
});
