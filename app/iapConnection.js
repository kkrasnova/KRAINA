/**
 * Безпечне підключення до Google Play / App Store billing.
 * На емуляторі без Play Store init часто падає — не валимо застосунок, лише повертаємо ok: false.
 */
export async function safeInitIapConnection() {
  try {
    const RNIap = await import('react-native-iap');
    try {
      const ok = await RNIap.initConnection();
      if (!ok) return { ok: false, RNIap: null };
      return { ok: true, RNIap };
    } catch (err) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[IAP] initConnection unavailable (emulator / no billing):', err?.message || err);
      }
      return { ok: false, RNIap: null };
    }
  } catch (e) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[IAP] module load failed:', e?.message || e);
    }
    return { ok: false, RNIap: null };
  }
}
