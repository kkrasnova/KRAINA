import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, DeviceEventEmitter } from 'react-native';
import { OFFLINE_NETWORK_CHANGED, getIsOnline } from './offline/networkStatus';
import { OFFLINE_OUTBOX_CHANGED, getOutboxItems } from './offline/outboxStore';

export default function OfflineStatusBanner({ isLight, top = 0 }) {
  const [online, setOnline] = useState(getIsOnline());
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let mounted = true;
    void getOutboxItems().then((arr) => {
      if (mounted) setPending(Array.isArray(arr) ? arr.length : 0);
    });
    const a = DeviceEventEmitter.addListener(OFFLINE_NETWORK_CHANGED, (v) => setOnline(!!v));
    const b = DeviceEventEmitter.addListener(OFFLINE_OUTBOX_CHANGED, (meta) => {
      setPending(Number(meta?.pending || 0));
    });
    return () => {
      mounted = false;
      a.remove();
      b.remove();
    };
  }, []);

  if (online && pending <= 0) return null;
  const text = !online
    ? pending > 0
      ? `Офлайн: дій у черзі ${pending}`
      : 'Офлайн-режим активний'
    : `Синхронізація: у черзі ${pending}`;
  return (
    <View style={[styles.wrap, { top, backgroundColor: isLight ? 'rgba(2,18,235,0.92)' : 'rgba(225,255,0,0.92)' }]}>
      <Text style={[styles.text, { color: isLight ? '#FFFFFF' : '#111' }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 10,
    right: 10,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    zIndex: 20,
  },
  text: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
});
