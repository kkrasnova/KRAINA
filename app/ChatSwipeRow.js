import React, { useRef, useCallback, isValidElement, cloneElement } from 'react';
import { View, StyleSheet, Animated, PanResponder, Pressable, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { RenderProfiler } from './performanceMetrics';

const ACTION_W = 88;
const FULL_DELETE_DX = ACTION_W * 2.4;

/**
 * Свайп вліво — кнопка «Видалити»; далі свайп або тап — видалення.
 * Без react-native-gesture-handler (сумісність з FlashList).
 */
export default function ChatSwipeRow({ children, onDelete, deleteLabel, disabled }) {
  const tx = useRef(new Animated.Value(0)).current;
  const startX = useRef(0);
  const dragging = useRef(false);

  const close = useCallback(() => {
    Animated.spring(tx, { toValue: 0, useNativeDriver: true, friction: 8, tension: 140 }).start();
  }, [tx]);

  const open = useCallback(() => {
    Animated.spring(tx, { toValue: -ACTION_W, useNativeDriver: true, friction: 8, tension: 140 }).start();
  }, [tx]);

  const triggerDelete = useCallback(() => {
    Animated.timing(tx, { toValue: -520, duration: 200, useNativeDriver: true }).start(({ finished }) => {
      if (finished) onDelete?.();
    });
  }, [tx, onDelete]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => {
        if (disabled) return false;
        return Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.35;
      },
      onPanResponderTerminationRequest: () => !dragging.current,
      onPanResponderGrant: () => {
        dragging.current = true;
        tx.stopAnimation((v) => {
          startX.current = v;
        });
      },
      onPanResponderMove: (_, g) => {
        let next = startX.current + g.dx;
        if (next < -ACTION_W) {
          const over = -ACTION_W - next;
          next = -ACTION_W - over * 0.28;
          next = Math.max(next, -FULL_DELETE_DX);
        }
        tx.setValue(Math.min(0, next));
      },
      onPanResponderRelease: (_, g) => {
        dragging.current = false;
        const pos = startX.current + g.dx;
        const vx = g.vx;

        if (pos <= -FULL_DELETE_DX * 0.72 || vx < -1.1) {
          triggerDelete();
          return;
        }
        if (pos <= -ACTION_W * 0.32 || (vx < -0.35 && pos < -24)) {
          open();
          return;
        }
        close();
      },
      onPanResponderTerminate: () => {
        dragging.current = false;
        close();
      },
    }),
  ).current;

  return (
    <RenderProfiler id="ChatSwipeRow">
      <View style={styles.wrap}>
        <View style={styles.deleteUnder} pointerEvents="box-none">
          <Pressable
            style={({ pressed }) => [styles.deleteBtn, pressed && styles.deleteBtnPressed]}
            onPress={triggerDelete}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={deleteLabel}
          >
            <Ionicons name="trash-outline" size={21} color="#FFF" />
            {deleteLabel ? (
              <Text style={styles.deleteLabel} numberOfLines={1}>
                {deleteLabel}
              </Text>
            ) : null}
          </Pressable>
        </View>
        <Animated.View style={{ transform: [{ translateX: tx }] }} {...panResponder.panHandlers}>
          {isValidElement(children)
            ? cloneElement(children, { delayPressIn: Math.max(children.props.delayPressIn || 0, 80) })
            : children}
        </Animated.View>
      </View>
    </RenderProfiler>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    position: 'relative',
  },
  deleteUnder: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: ACTION_W,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  deleteBtn: {
    width: '100%',
    minHeight: 56,
    backgroundColor: '#FF453A',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 6,
    shadowColor: '#FF453A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 3,
  },
  deleteBtnPressed: {
    backgroundColor: '#E0352B',
    transform: [{ scale: 0.96 }],
  },
  deleteLabel: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
});
