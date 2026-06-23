import { DeviceEventEmitter } from 'react-native';
import { CommonActions } from '@react-navigation/native';
import { navigationRef } from './navigationRef';
import { HOME_TAB_ROUTE, HOME_TAB, HOME_TAB_SWITCH_EVENT } from './homeTabPagerConstants';
import { buildShellParamsForNavigate } from './shellNavigate';

function clampTab(i) {
  const n = Number(i);
  if (!Number.isFinite(n)) return 0;
  return Math.min(4, Math.max(0, Math.floor(n)));
}

/** Екрани з нижньою панеллю, але не HomeTabPager — повертаємось на pager. */
const OVERLAY_TAB_ROUTES = new Set([
  'Chats',
  'StartChat',
  'RouteResults',
  'RouteNavigation',
  'ProfilePage',
  'ProfileGamificationHub',
  'ProfileEdit',
  'ProfileFriends',
  'ProfileInvites',
  'ProfilePostDetail',
  'ProfileComments',
  'ProfileLikes',
  'ProfileEditPublication',
]);

/**
 * Миттєве перемикання вкладки головного pager:
 * 1) одразу емітимо подію для PagerView.setPageWithoutAnimation;
 * 2) на HomeTabPager — лише setParams (без повного navigate);
 * 3) з оверлей-екранів — navigate на HomeTabPager.
 */
export function switchHomeTab(tabIndex, extra = {}, themeOverride) {
  if (!navigationRef.isReady()) return false;

  const t = clampTab(tabIndex);
  const route = navigationRef.getCurrentRoute();
  const params = buildShellParamsForNavigate(
    { tabIndex: t, routeFinderExtras: {}, ...extra },
    themeOverride,
  );

  DeviceEventEmitter.emit(HOME_TAB_SWITCH_EVENT, t);

  if (route?.name === HOME_TAB_ROUTE) {
    const cur = clampTab(route.params?.tabIndex);
    if (cur === t && Object.keys(extra).length === 0) return true;
    navigationRef.dispatch(CommonActions.setParams(params));
    return true;
  }

  if (route?.name && OVERLAY_TAB_ROUTES.has(route.name)) {
    navigationRef.navigate(HOME_TAB_ROUTE, params);
    return true;
  }

  navigationRef.navigate(HOME_TAB_ROUTE, params);
  return true;
}

export function isHomeTabActive(tabIndex) {
  if (!navigationRef.isReady()) return false;
  const route = navigationRef.getCurrentRoute();
  if (route?.name !== HOME_TAB_ROUTE) return false;
  return clampTab(route.params?.tabIndex) === clampTab(tabIndex);
}

/** Після публікації історії/поста — скидаємо стек і одразу показуємо стрічку. */
export function resetToHomeFeedTab(navigation, extra = {}, themeOverride) {
  const params = buildShellParamsForNavigate(
    { tabIndex: HOME_TAB.FEED, routeFinderExtras: {}, ...extra },
    themeOverride,
  );
  DeviceEventEmitter.emit(HOME_TAB_SWITCH_EVENT, HOME_TAB.FEED);
  navigation.reset({
    index: 0,
    routes: [{ name: HOME_TAB_ROUTE, params }],
  });
}
