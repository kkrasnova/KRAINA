import { useAuthStore } from './auth/authStore';

/** Єдиний об'єкт користувача для ключів AsyncStorage стрічки (пости/історії). */
export function resolveFeedLocalUser(routeUser, opts = {}) {
  const authUser = opts.authUser ?? useAuthStore.getState().user;
  const profileUserId = opts.profileUserId ?? useAuthStore.getState().profileMe?.profile?.user_id;

  const id =
    profileUserId ||
    authUser?.id ||
    routeUser?.id ||
    routeUser?.firebaseUid ||
    null;
  const email = String(authUser?.email || routeUser?.email || '').trim().toLowerCase() || null;
  const firebaseUid = authUser?.firebaseUid || routeUser?.firebaseUid || null;

  if (!id && !email && !firebaseUid) {
    return routeUser || authUser || null;
  }

  return {
    ...(routeUser && typeof routeUser === 'object' ? routeUser : {}),
    ...(authUser && typeof authUser === 'object' ? authUser : {}),
    ...(id ? { id: String(id) } : {}),
    ...(email ? { email } : {}),
    ...(firebaseUid ? { firebaseUid: String(firebaseUid) } : {}),
  };
}

/** Усі можливі ключі сховища для одного акаунта (міграція старих записів). */
export function feedStorageCandidateKeys(user) {
  if (!user || typeof user !== 'object') return ['anon'];
  const keys = new Set();
  if (user.id) keys.add(String(user.id));
  if (user.firebaseUid) keys.add(String(user.firebaseUid));
  const em = String(user.email || '').trim().toLowerCase();
  if (em) keys.add(em);
  if (!keys.size) keys.add('anon');
  return [...keys];
}
