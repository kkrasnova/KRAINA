import React, { useRef } from 'react';
import { View, Text, StyleSheet, Animated, PanResponder, Pressable } from 'react-native';

const DELETE_W = 88;

/**
 * Свайп вліво — кнопка «Видалити». Без react-native-gesture-handler.
 */
export default function ChatSwipeRow({ children, onDelete, deleteLabel, disabled }) {
  const tx = useRef(new Animated.Value(0)).current;
  const startX = useRef(0);

  const close = () => {
    Animated.spring(tx, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        !disabled && Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: () => {
        tx.stopAnimation((v) => {
          startX.current = v;
        });
      },
      onPanResponderMove: (_, g) => {
        const next = Math.min(0, Math.max(-DELETE_W, startX.current + g.dx));
        tx.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        const pos = startX.current + g.dx;
        if (pos < -DELETE_W * 0.4 || g.vx < -0.4) {
          Animated.spring(tx, { toValue: -DELETE_W, useNativeDriver: true, friction: 8 }).start();
        } else {
          close();
        }
      },
    }),
  ).current;

  return (
    <View style={styles.wrap}>
      <View style={styles.deleteUnder}>
        <Pressable
          style={styles.deleteBtn}
          onPress={() => {
            onDelete?.();
            close();
          }}
          disabled={disabled}
        >
          <Text style={styles.deleteText}>{deleteLabel}</Text>
        </Pressable>
      </View>
      <Animated.View style={{ transform: [{ translateX: tx }] }} {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    position: 'relative',
  },
  deleteUnder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  deleteBtn: {
    width: DELETE_W,
    flex: 1,
    backgroundColor: '#E53935',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 13,
  },
});
