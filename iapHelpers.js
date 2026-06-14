
import { Platform } from 'react-native';
import {
  getIosSubscriptionId,
  getAndroidSubscriptionId,
  getExplorerIosSubscriptionId,
  getExplorerAndroidSubscriptionId,
} from './iapConfig';

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;


function toUnixMs(t) {
  if (t == null || typeof t !== 'number' || !Number.isFinite(t)) return null;
  return t > 1e12 ? t : t * 1000;
}


export async function resolveProExpirationIso(purchase, getActiveSubscriptions, subscriptionIds) {
  if (purchase?.platform === 'ios' && purchase.expirationDateIOS != null) {
    const ms = toUnixMs(purchase.expirationDateIOS);
    if (ms) return new Date(ms).toISOString();
  }

  if (typeof getActiveSubscriptions === 'function') {
    try {
      const ids =
        subscriptionIds && subscriptionIds.length
          ? subscriptionIds
          : [getIosSubscriptionId(), getAndroidSubscriptionId()];
      const active = await getActiveSubscriptions(ids);
      if (Array.isArray(active)) {
        const want = Platform.OS === 'android' ? getAndroidSubscriptionId() : getIosSubscriptionId();
        const row =
          active.find((s) => s.productId === want) ||
          active.find((s) => s.productId === purchase?.productId) ||
          active[0];
        if (row?.expirationDateIOS != null) {
          const ms = toUnixMs(row.expirationDateIOS);
          if (ms) return new Date(ms).toISOString();
        }
        if (row?.daysUntilExpirationIOS != null && typeof row.daysUntilExpirationIOS === 'number') {
          return new Date(Date.now() + row.daysUntilExpirationIOS * 86400000).toISOString();
        }
      }
    } catch (_) {}
  }

  return new Date(Date.now() + MONTH_MS).toISOString();
}


export function findSubscriptionProduct(subscriptions, sku) {
  if (!Array.isArray(subscriptions) || !sku) return null;
  return subscriptions.find((s) => s.id === sku) || null;
}

/** Визначає тариф за productId після покупки підписки. */
export function tierFromSubscriptionProductId(productId) {
  const ex = Platform.OS === 'android' ? getExplorerAndroidSubscriptionId() : getExplorerIosSubscriptionId();
  const pro = Platform.OS === 'android' ? getAndroidSubscriptionId() : getIosSubscriptionId();
  if (ex && productId === ex) return 'explorer';
  if (productId === pro) return 'pro';
  return 'pro';
}
