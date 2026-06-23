/**
 * In-app notification banners for new chat messages.
 *
 * Shows a brief animated toast at the top of the screen when a new message
 * arrives via WebSocket while the user is in the app.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Animated,
  StyleSheet,
  Text,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { accentForTheme } from './themeAccent';
import { navigationRef } from './navigationRef';

const TOAST_DURATION = 4000;

let toastRef = null;

/**
 * Register a reference to the ChatToast component so it can be triggered
 * from anywhere in the app.
 */
export function setChatToastRef(ref) {
  toastRef = ref;
}

/**
 * Show a chat notification toast from anywhere in the app.
 */
export function showChatToast({ threadId, senderName, preview, theme }) {
  if (toastRef && typeof toastRef.show === 'function') {
    toastRef.show({ threadId, senderName, preview, theme });
  }
}

/**
 * ChatToast — mount this once at the App root level.
 * It displays an animated banner when showChatToast is called.
 * Uses the global navigationRef from navigationRef.js.
 */
export default function ChatToast() {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-120)).current;
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState({ threadId: '', senderName: '', preview: '', theme: 'dark' });
  const hideTimerRef = useRef(null);

  const hide = useCallback(() => {
    Animated.timing(translateY, {
      toValue: -120,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setVisible(false);
    });
  }, [translateY]);

  const hideRef = useRef(hide);
  hideRef.current = hide;

  const show = useCallback(
    ({ threadId, senderName, preview, theme }) => {
      setData({ threadId, senderName, preview: preview || '', theme: theme || 'dark' });
      setVisible(true);

      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
        tension: 80,
      }).start();

      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        hideRef.current();
      }, TOAST_DURATION);
    },
    [translateY],
  );

  const onTap = useCallback(() => {
    hide();
    if (data.threadId && navigationRef.isReady()) {
      navigationRef.navigate('ChatThread', {
        threadId: data.threadId,
        useMessageApi: true,
      });
    }
  }, [data.threadId, hide]);

  // Expose `show` for the ref (can be called from anywhere via showChatToast())
  useEffect(() => {
    setChatToastRef({ show });
    return () => setChatToastRef(null);
  }, [show]);

  // Clean up timer
  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  if (!visible) return null;

  const isLight = data.theme === 'light';
  const accent = accentForTheme(isLight);
  const bg = isLight ? '#FFFFFF' : '#1C1C1E';
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const textMuted = isLight ? '#5C5C5C' : '#8E8E93';
  const displaySender = data.senderName || 'KRAÏNA';

  return (
    <Pressable
      onPress={onTap}
      style={styles.touchArea}
      accessibilityRole="button"
      accessibilityLabel={data.senderName + ': ' + data.preview}
    >
      <Animated.View
        style={[
          styles.toast,
          {
            backgroundColor: bg,
            top: insets.top + 8,
            transform: [{ translateY }],
            borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.12)',
          },
        ]}
      >
        <View style={styles.dotRow}>
          <View style={[styles.dot, { backgroundColor: accent }]} />
          <Text style={[styles.senderName, { color: textMain }]} numberOfLines={1}>
            {displaySender}
          </Text>
        </View>
        <Text style={[styles.preview, { color: textMuted }]} numberOfLines={1}>
          {data.preview || 'New message'}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touchArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
  },
  toast: {
    marginHorizontal: 12,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  dotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  senderName: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  preview: {
    fontSize: 13,
    lineHeight: 18,
    paddingLeft: 16,
  },
});
