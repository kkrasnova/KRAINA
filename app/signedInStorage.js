import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Мітка «користувач увійшов і має лишатись залогіненим».
 * Живе в AsyncStorage. Знімається ЛИШЕ при явному виході з акаунту.
 * Cold start без сесії/JWT все одно може відновити user з цієї мітки.
 */
export const SIGNED_IN_USER_KEY = '@kraina_signed_in_user_v1';

export async function markSignedIn(user) {
  if (!user || typeof user !== 'object') return;
  const id = user.id != null ? String(user.id) : '';
  const email = user.email != null ? String(user.email) : '';
  if (!id && !email) return;
  const payload = {
    id: id || email,
    email,
    role: user.role || (user.isAdmin ? 'admin' : 'user'),
    name: user.name || undefined,
    provider: user.provider || undefined,
    savedAt: Date.now(),
  };
  try {
    await AsyncStorage.setItem(SIGNED_IN_USER_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export async function getSignedInUser() {
  try {
    const raw = await AsyncStorage.getItem(SIGNED_IN_USER_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (!j || typeof j !== 'object') return null;
    if (!j.id && !j.email) return null;
    return j;
  } catch {
    return null;
  }
}

export async function clearSignedIn() {
  try {
    await AsyncStorage.removeItem(SIGNED_IN_USER_KEY);
  } catch {
    /* ignore */
  }
}

export async function isSignedInMarked() {
  return !!(await getSignedInUser());
}
