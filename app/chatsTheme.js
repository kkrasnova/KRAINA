import { accentForTheme, onAccentButtonText } from './themeAccent';
import { APP_SCREEN_BG } from './AppTopBar';

/** Градієнти аватарів за хешем імені (Telegram / iMessage style). */
export const CHAT_AVATAR_GRADIENTS = [
  ['#0212EB', '#0095F6'],
  ['#667EEA', '#764BA2'],
  ['#F093FB', '#F5576C'],
  ['#4FACFE', '#00F2FE'],
  ['#43E97B', '#38F9D7'],
  ['#FA709A', '#FEE140'],
  ['#A18CD1', '#FBC2EB'],
  ['#FF9A56', '#FF6A88'],
];

export function chatAvatarGradient(name) {
  let h = 0;
  const s = String(name || '');
  for (let i = 0; i < s.length; i += 1) {
    h = (h + s.charCodeAt(i) * (i + 3)) % CHAT_AVATAR_GRADIENTS.length;
  }
  return CHAT_AVATAR_GRADIENTS[h];
}

/** Спільні кольори та стилі для ChatsPage / StartChatPage. */
export function getChatsTheme(isLight) {
  const accent = accentForTheme(isLight);
  return {
    isLight,
    accent,
    onAccent: onAccentButtonText(isLight),
    bg: isLight ? '#FFFFFF' : APP_SCREEN_BG,
    listBg: isLight ? '#FFFFFF' : APP_SCREEN_BG,
    surface: isLight ? '#FFFFFF' : 'rgba(255,255,255,0.06)',
    surfaceMuted: isLight ? '#F2F2F7' : 'rgba(255,255,255,0.05)',
    textMain: isLight ? '#1E1E1E' : '#FFFFFF',
    textMuted: isLight ? '#6B6B6B' : '#8E8E93',
    border: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
    borderSubtle: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)',
    searchBg: isLight ? '#F2F2F7' : 'rgba(255,255,255,0.08)',
    segmentBg: isLight ? '#F2F2F7' : 'rgba(255,255,255,0.08)',
    segmentActive: isLight ? '#FFFFFF' : 'rgba(255,255,255,0.14)',
    avatarFallback: isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.14)',
    emptyIconBg: isLight ? 'rgba(2,18,235,0.06)' : 'rgba(225,255,0,0.1)',
    unreadTint: isLight ? 'rgba(2,18,235,0.07)' : 'rgba(225,255,0,0.12)',
    cardShadow: isLight
      ? {
          shadowColor: '#1A1A2E',
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.07,
          shadowRadius: 12,
          elevation: 3,
        }
      : {},
    searchShadow: isLight
      ? {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.04,
          shadowRadius: 6,
          elevation: 1,
        }
      : {},
  };
}
