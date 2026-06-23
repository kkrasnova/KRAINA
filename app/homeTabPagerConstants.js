/** Єдиний екран з нижніми вкладками + свайп між ними. */
export const HOME_TAB_ROUTE = 'HomeTabPager';

export const HOME_TAB = {
  MAIN: 0,
  FEED: 1,
  SCANNER: 2,
  MAP: 3,
  PROFILE: 4,
};

/** Натискання центральної кнопки камери на вкладці сканера — зробити знімок. */
export const LANDMARK_SCANNER_CAPTURE_EVENT = 'kraina_landmark_scanner_capture_v1';

/** Миттєве перемикання вкладки в PagerView (до оновлення navigation state). */
export const HOME_TAB_SWITCH_EVENT = 'kraina_home_tab_switch_v1';
