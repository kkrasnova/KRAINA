import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAppAdminUser } from './adminGate';

const PREFIX = '@kraina_subscription_v1:';
const RETENTION_OFFER_PREFIX = '@kraina_retention_offer_v1:';

export const PRO_PRICE_USD = 19.99;

/** Display-only “was” price for Pro (e.g. strikethrough in the plan picker). */
export const PRO_LIST_PRICE_USD = 24.99;

/** Explorer — проміжний тариф (продуктова модель). */
export const EXPLORER_PRICE_USD = 4.99;

export const FREE_LIMITS = {
  scans: 1,
  routes: 3,
  historyViews: 3,
};

export const EXPLORER_LIMITS = {
  scans: 5,
  routes: 3,
  historyViews: Number.POSITIVE_INFINITY,
};

function stableUserKey(user) {
  if (!user || typeof user !== 'object') return 'anon';
  const id = user.id || user.firebaseUid;
  if (id) return String(id);
  const em = (user.email || '').trim().toLowerCase();
  if (em) return em;
  return 'anon';
}

function storageKey(user) {
  return `${PREFIX}${stableUserKey(user)}`;
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function defaultState() {
  return {
    tier: null,
    planChosenAt: null,
    proExpiresAt: null,
    usageMonth: currentMonthKey(),
    usage: {
      scans: 0,
      routes: 0,
      historyViews: 0,
    },
  };
}


export async function getSubscriptionState(user) {
  let state = defaultState();
  try {
    const raw = await AsyncStorage.getItem(storageKey(user));
    if (raw) {
      const parsed = JSON.parse(raw);
      state = { ...defaultState(), ...parsed, usage: { ...defaultState().usage, ...parsed.usage } };
    }
  } catch (_) {}

  if (state.usageMonth !== currentMonthKey()) {
    state.usageMonth = currentMonthKey();
    state.usage = { scans: 0, routes: 0, historyViews: 0 };
    await persistRaw(user, state);
  }

  const paidTiers = ['pro', 'explorer', 'family'];
  const isPaidActive =
    paidTiers.includes(state.tier) && state.proExpiresAt && new Date(state.proExpiresAt) > new Date();
  const isProUnlimited = isPaidActive && (state.tier === 'pro' || state.tier === 'family');

  const needsPlanChoice = state.tier === null;

  let limits = { ...FREE_LIMITS };
  if (isProUnlimited) {
    limits = { scans: Infinity, routes: Infinity, historyViews: Infinity };
  } else if (isPaidActive && state.tier === 'explorer') {
    limits = { ...EXPLORER_LIMITS };
  }

  const out = {
    tier: state.tier,
    planChosenAt: state.planChosenAt,
    proExpiresAt: state.proExpiresAt,
    needsPlanChoice,
    /** @deprecated використовуйте isPaidActive / isProUnlimited; залишено для сумісності */
    isProActive: isProUnlimited,
    isPaidActive,
    isProUnlimited,
    isExplorerActive: isPaidActive && state.tier === 'explorer',
    usage: state.usage,
    usageMonth: state.usageMonth,
    limits,
  };

  if (isAppAdminUser(user)) {
    const far = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString();
    return {
      ...out,
      tier: 'pro',
      planChosenAt: out.planChosenAt || new Date().toISOString(),
      proExpiresAt: far,
      needsPlanChoice: false,
      isProActive: true,
      isPaidActive: true,
      isProUnlimited: true,
      isExplorerActive: false,
      limits: { scans: Infinity, routes: Infinity, historyViews: Infinity },
    };
  }

  return out;
}

async function persistRaw(user, state) {
  try {
    await AsyncStorage.setItem(storageKey(user), JSON.stringify(state));
  } catch (_) {}
}


export async function setPlanChoice(user, tier, options = {}) {
  const prev = await readRaw(user);
  const state = {
    ...defaultState(),
    ...prev,
    usage: { ...defaultState().usage, ...prev.usage },
  };
  const now = new Date().toISOString();
  const prevTier = state.tier;
  const tierChanged = prevTier !== tier;

  state.planChosenAt = state.planChosenAt || now;
  state.tier = tier;
  if (tier === 'free') {
    state.proExpiresAt = null;
  } else if (tier === 'pro' || tier === 'family') {
    const days = typeof options.demoProDays === 'number' ? options.demoProDays : 30;
    state.proExpiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  } else if (tier === 'explorer') {
    const days =
      typeof options.demoExplorerDays === 'number' ? options.demoExplorerDays : 30;
    state.proExpiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }
  if (tierChanged) {
    state.usageMonth = currentMonthKey();
    state.usage = { scans: 0, routes: 0, historyViews: 0 };
  }
  await persistRaw(user, state);
  return getSubscriptionState(user);
}

async function readRaw(user) {
  try {
    const raw = await AsyncStorage.getItem(storageKey(user));
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}


export async function tryConsume(user, feature) {
  if (isAppAdminUser(user)) {
    return { ok: true, reason: 'admin' };
  }
  const state = await readRaw(user);
  let full = { ...defaultState(), ...state, usage: { ...defaultState().usage, ...state.usage } };
  if (full.usageMonth !== currentMonthKey()) {
    full.usageMonth = currentMonthKey();
    full.usage = { scans: 0, routes: 0, historyViews: 0 };
  }

  const paidTiers = ['pro', 'explorer', 'family'];
  const isPaidActive =
    paidTiers.includes(full.tier) && full.proExpiresAt && new Date(full.proExpiresAt) > new Date();
  const isProUnlimited = isPaidActive && (full.tier === 'pro' || full.tier === 'family');
  if (isProUnlimited) {
    await persistRaw(user, full);
    return { ok: true, reason: 'pro' };
  }

  const key =
    feature === 'scan' ? 'scans' : feature === 'route' ? 'routes' : feature === 'history' ? 'historyViews' : null;
  if (!key) return { ok: false, reason: 'unknown_feature' };

  const limits =
    isPaidActive && full.tier === 'explorer'
      ? EXPLORER_LIMITS
      : FREE_LIMITS;
  const limit = limits[key];
  if (limit === Number.POSITIVE_INFINITY) {
    await persistRaw(user, full);
    return { ok: true, reason: 'explorer_unlimited_feature' };
  }
  const used = full.usage[key] || 0;
  if (used >= limit) {
    await persistRaw(user, full);
    return { ok: false, reason: 'limit', remaining: 0, limit };
  }
  full.usage[key] = used + 1;
  await persistRaw(user, full);
  return { ok: true, remaining: limit - full.usage[key], limit };
}


export async function hasUsedRetentionOffer(user) {
  try {
    const v = await AsyncStorage.getItem(`${RETENTION_OFFER_PREFIX}${stableUserKey(user)}`);
    return v === '1';
  } catch {
    return false;
  }
}

/** +30 днів до поточного тарифу (одноразова пропозиція утримання). */
export async function applyRetentionOffer(user, extraDays = 30) {
  const state = await readRaw(user);
  const tier = state.tier;
  if (!['explorer', 'pro', 'family'].includes(tier)) {
    return { ok: false, reason: 'not_paid' };
  }
  const currentMs = state.proExpiresAt ? new Date(state.proExpiresAt).getTime() : Date.now();
  const baseMs = Math.max(currentMs, Date.now());
  const newExp = new Date(baseMs + extraDays * 24 * 60 * 60 * 1000).toISOString();
  await extendPaidSubscription(user, tier, newExp);
  try {
    await AsyncStorage.setItem(`${RETENTION_OFFER_PREFIX}${stableUserKey(user)}`, '1');
  } catch (_) {}
  return { ok: true, tier, expiresAt: newExp, extraDays };
}

export async function extendPaidSubscription(user, tier, expiresAtIso) {
  const paid = ['explorer', 'pro', 'family'];
  if (!paid.includes(tier)) return;
  const state = await readRaw(user);
  const full = { ...defaultState(), ...state };
  full.tier = tier;
  full.proExpiresAt = expiresAtIso;
  full.planChosenAt = full.planChosenAt || new Date().toISOString();
  await persistRaw(user, full);
}

export async function extendProSubscription(user, expiresAtIso) {
  await extendPaidSubscription(user, 'pro', expiresAtIso);
}

/**
 * Застосувати підписку з GET /api/profile/me (або відповіді billing/verify).
 * Не затирає локальний платний стан, якщо на сервері лише дефолтний free без джерела (payment_provider null).
 */
export async function applyBackendSubscriptionToLocal(user, subscription) {
  if (!user || !subscription || typeof subscription !== 'object') {
    return { applied: false, reason: 'missing' };
  }
  const pt = String(subscription.plan_type || 'free').toLowerCase();
  const pp = subscription.payment_provider;
  const active = subscription.is_active !== false;
  const expRaw = subscription.expires_at;
  const expMs = expRaw ? new Date(expRaw).getTime() : null;
  const paidTiers = ['explorer', 'pro', 'family'];
  const paidOk =
    active &&
    paidTiers.includes(pt) &&
    (expMs == null || !Number.isFinite(expMs) || expMs > Date.now());

  if (paidOk) {
    const tier = pt === 'explorer' ? 'explorer' : pt === 'family' ? 'family' : 'pro';
    const iso =
      expRaw && Number.isFinite(expMs)
        ? new Date(expRaw).toISOString()
        : new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString();
    await extendPaidSubscription(user, tier, iso);
    return { applied: true, tier };
  }

  if (pt === 'free' && (pp === 'admin' || pp === 'apple' || pp === 'google' || pp === 'stripe')) {
    await setPlanChoice(user, 'free');
    return { applied: true, tier: 'free' };
  }

  return { applied: false, reason: 'server_default_free_or_inactive' };
}
