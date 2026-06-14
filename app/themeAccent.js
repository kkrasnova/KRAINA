/** Світла тема: синій (Figma). Темна: лимон (Figma #E1FF00). */
export const ACCENT_BLUE = '#0212EB';
export const ACCENT_LEMON = '#E1FF00';

/** Нижня панель, темна тема: неактивні іконки (Figma stroke #F2F2EA). */
export const TAB_ICON_INACTIVE_DARK = '#F2F2EA';

export function accentForTheme(isLight) {
  return isLight ? ACCENT_BLUE : ACCENT_LEMON;
}

/** Активна іконка таб-бара: на світлій панелі — синій, у темній — лимон. */
export function tabBarActiveIconTint(isLight) {
  return isLight ? ACCENT_BLUE : ACCENT_LEMON;
}

/** Центральна кнопка сканера: світла тема — синій, темна — лимон. */
export function tabBarFabBackground(isLight) {
  return isLight ? ACCENT_BLUE : ACCENT_LEMON;
}

/** Іконка в FAB: на синьому тлі — біла, на лимоні — темна. */
export function tabBarFabIconTint(isLight) {
  return isLight ? '#FFFFFF' : '#1E1E1E';
}

/** Текст на кнопці з акцентом: білий на синьому, темний на лимоні. */
export function onAccentButtonText(isLight) {
  return isLight ? '#FFFFFF' : '#1E1E1E';
}
