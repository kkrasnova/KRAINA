import { makeLazyLoader, prefetchLazyLoader } from './LazyScreen';
import { prefetchArchivePosts } from './archivePostsCache';

export const loadChatsPage = makeLazyLoader(() => require('./ChatsPage'));
export const loadChatThreadPage = makeLazyLoader(() => require('./ChatThreadPage'));
export const loadSettingsArchivePage = makeLazyLoader(() => require('./SettingsArchivePage'));

/** Попереднє завантаження екранів повідомлень (модуль + без спінера при першому відкритті). */
export function prefetchChatsBundle() {
  void prefetchLazyLoader(loadChatsPage);
  void prefetchLazyLoader(loadChatThreadPage);
}

/** Попереднє завантаження архіву з налаштувань — модуль + дані в памʼяті. */
export function prefetchArchiveBundle() {
  void prefetchLazyLoader(loadSettingsArchivePage);
  void prefetchArchivePosts();
}
