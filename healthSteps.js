import { Platform } from 'react-native';

/** Локальний календарний ключ YYYY-MM-DD */
export function localDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Узгоджуємо ключ дня з ISO HealthKit / Health Connect (локальна дата, не «slice» рядка). */
function dayKeyFromHealthTimestamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) {
    const s = String(iso);
    return s.length >= 10 ? s.slice(0, 10) : '';
  }
  return localDateKey(d);
}

export function isStepsPlatformSupported() {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

let iosStepsReady = false;

/** Після вимкнення синхронізації в налаштуваннях — щоб знову показалась системна картка дозволів. */
export function resetIosHealthSession() {
  iosStepsReady = false;
}

async function ensureIosStepsPermission() {
  if (Platform.OS !== 'ios') return false;
  if (iosStepsReady) return true;
  let AppleHealthKit;
  try {
    AppleHealthKit = require('react-native-health');
  } catch {
    return false;
  }
  const Perms = AppleHealthKit?.Constants?.Permissions;
  const stepRead = Perms?.StepCount ?? Perms?.Steps;
  if (!stepRead) return false;

  const available = await new Promise((resolve) => {
    try {
      AppleHealthKit.isAvailable((_e, ok) => resolve(!!ok));
    } catch {
      resolve(false);
    }
  });
  if (!available) return false;

  const ok = await new Promise((resolve) => {
    try {
      AppleHealthKit.initHealthKit(
        {
          permissions: {
            read: [stepRead],
            write: [],
          },
        },
        (err) => resolve(!err),
      );
    } catch {
      resolve(false);
    }
  });
  iosStepsReady = ok;
  return ok;
}

let androidHcInitialized = false;

function hasAndroidStepsReadGrant(list) {
  if (!Array.isArray(list)) return false;
  return list.some((p) => {
    if (!p) return false;
    const rt = String(p.recordType || '');
    const at = String(p.accessType || '').toLowerCase();
    return rt === 'Steps' && at === 'read';
  });
}

async function ensureAndroidStepsPermission() {
  if (Platform.OS !== 'android') return false;
  let hc;
  try {
    hc = require('react-native-health-connect');
  } catch {
    return false;
  }
  const status = await hc.getSdkStatus();
  if (status !== hc.SdkAvailabilityStatus.SDK_AVAILABLE) return false;
  if (!androidHcInitialized) {
    const ok = await hc.initialize();
    if (!ok) return false;
    androidHcInitialized = true;
  }
  let granted = [];
  try {
    granted = await hc.getGrantedPermissions();
  } catch {
    granted = [];
  }
  if (hasAndroidStepsReadGrant(granted)) return true;
  try {
    const res = await hc.requestPermission([{ accessType: 'read', recordType: 'Steps' }]);
    if (hasAndroidStepsReadGrant(res)) return true;
    let after = [];
    try {
      after = await hc.getGrantedPermissions();
    } catch {
      after = [];
    }
    return hasAndroidStepsReadGrant(after);
  } catch {
    return false;
  }
}

/**
 * Результат запиту доступу до кроків (для UI: різні повідомлення).
 * @returns {Promise<'ok' | 'denied' | 'hc_unavailable' | 'unsupported'>}
 */
export async function requestStepsAccessOutcome() {
  if (!isStepsPlatformSupported()) return 'unsupported';
  if (Platform.OS === 'android') {
    try {
      require('react-native-health-connect');
    } catch {
      return 'hc_unavailable';
    }
    const ok = await ensureAndroidStepsPermission();
    if (ok) return 'ok';
    let hc;
    try {
      hc = require('react-native-health-connect');
    } catch {
      return 'hc_unavailable';
    }
    try {
      const stNum = await hc.getSdkStatus();
      if (stNum !== hc.SdkAvailabilityStatus.SDK_AVAILABLE) return 'hc_unavailable';
    } catch {
      return 'hc_unavailable';
    }
    return 'denied';
  }
  const ok = await ensureIosStepsPermission();
  return ok ? 'ok' : 'denied';
}

/**
 * Запит доступу до кроків (HealthKit / Health Connect). Повертає true, якщо можна читати дані.
 */
export async function requestStepsPermission() {
  return (await requestStepsAccessOutcome()) === 'ok';
}

function mergeDayMaps(a, b) {
  const out = { ...a };
  for (const k of Object.keys(b || {})) {
    out[k] = (out[k] || 0) + (b[k] || 0);
  }
  return out;
}

/** iOS: добові зразки; якщо порожньо — не вважаємо це успіхом для графіка. */
function iosFetchDailySamples(AppleHealthKit, start, end) {
  return new Promise((resolve, reject) => {
    try {
      AppleHealthKit.getDailyStepCountSamples(
        {
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          period: 1440,
          includeManuallyAdded: true,
        },
        (err, results) => {
          if (err) {
            reject(new Error(String(err)));
            return;
          }
          const byDay = {};
          for (const row of Array.isArray(results) ? results : []) {
            const k = dayKeyFromHealthTimestamp(row.startDate);
            if (!k) continue;
            byDay[k] = (byDay[k] || 0) + Math.round(Number(row.value) || 0);
          }
          resolve(byDay);
        },
      );
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

/** iOS: запасний шлях — окремий запит на кожен календарний день (надійніше на частині прошивок). */
async function iosFetchPerDayQueries(AppleHealthKit, numDays) {
  const byDay = {};
  const anchor = new Date();
  anchor.setHours(12, 0, 0, 0);
  for (let i = numDays - 1; i >= 0; i -= 1) {
    const d = new Date(anchor);
    d.setDate(anchor.getDate() - i);
    const key = localDateKey(d);
    const count = await new Promise((resolve) => {
      try {
        AppleHealthKit.getStepCount(
          { date: d.toISOString(), includeManuallyAdded: true },
          (err, res) => {
            if (err) resolve(0);
            else resolve(Math.round(Number(res?.value) || 0));
          },
        );
      } catch {
        resolve(0);
      }
    });
    byDay[key] = count;
  }
  return byDay;
}

/** Android: зведення за період через readRecords (якщо aggregate недоступний або порожній). */
async function androidFetchStepsViaReadRecords(hc, start, end) {
  const byDay = {};
  let pageToken;
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  for (let guard = 0; guard < 40; guard += 1) {
    let page;
    try {
      page = await hc.readRecords('Steps', {
        timeRangeFilter: { operator: 'between', startTime: startIso, endTime: endIso },
        pageSize: 500,
        ...(pageToken ? { pageToken } : {}),
      });
    } catch {
      break;
    }
    const recs = page?.records || [];
    for (const rec of recs) {
      const t = rec.startTime || rec.startDate;
      if (!t) continue;
      const k = dayKeyFromHealthTimestamp(t);
      if (!k) continue;
      byDay[k] = (byDay[k] || 0) + Math.round(Number(rec.count) || 0);
    }
    pageToken = page?.pageToken;
    if (!pageToken) break;
  }
  return byDay;
}

/**
 * Денні суми кроків за останні `numDays` днів (ключ — localDateKey).
 */
export async function fetchDailyStepsMapLastDays(numDays = 7) {
  const n = Math.min(30, Math.max(1, Math.floor(Number(numDays)) || 7));
  const byDay = {};
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (n - 1));

  if (Platform.OS === 'ios') {
    const ok = await ensureIosStepsPermission();
    if (!ok) throw new Error('steps_permission_denied');
    const AppleHealthKit = require('react-native-health');

    let fromSamples = {};
    try {
      fromSamples = await iosFetchDailySamples(AppleHealthKit, start, end);
    } catch {
      fromSamples = {};
    }

    const sampleKeys = Object.keys(fromSamples).filter((k) => (fromSamples[k] || 0) > 0);
    if (sampleKeys.length === 0) {
      return iosFetchPerDayQueries(AppleHealthKit, n);
    }
    return fromSamples;
  }

  if (Platform.OS === 'android') {
    const ok = await ensureAndroidStepsPermission();
    if (!ok) throw new Error('steps_permission_denied');
    const hc = require('react-native-health-connect');

    let fromAgg = {};
    try {
      const groups = await hc.aggregateGroupByPeriod({
        recordType: 'Steps',
        timeRangeFilter: {
          operator: 'between',
          startTime: start.toISOString(),
          endTime: end.toISOString(),
        },
        timeRangeSlicer: { period: 'DAYS', length: 1 },
      });
      for (const g of groups || []) {
        const k = dayKeyFromHealthTimestamp(g.startTime);
        if (!k) continue;
        const raw = g.result?.COUNT_TOTAL;
        const val = Math.round(Number(raw) || 0);
        fromAgg[k] = val;
      }
    } catch {
      fromAgg = {};
    }

    const aggTotal = Object.values(fromAgg).reduce((a, b) => a + (Number(b) || 0), 0);
    if (Object.keys(fromAgg).length === 0 || aggTotal === 0) {
      const fromRead = await androidFetchStepsViaReadRecords(hc, start, end);
      return Object.keys(fromRead).length ? fromRead : fromAgg;
    }
    return fromAgg;
  }

  return byDay;
}

export function buildStepsSeriesForChart(byDay, numDays = 7) {
  const labels = [];
  const data = [];
  const n = Math.min(30, Math.max(1, Math.floor(Number(numDays)) || 7));
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = localDateKey(d);
    labels.push(`${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`);
    data.push(byDay[key] != null ? byDay[key] : 0);
  }
  return { labels, data };
}
