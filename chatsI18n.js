import { appLangBase } from './appLang';
import { fillBundleMissingLangs, pickI18n } from './i18nBundle';

function pick(lang, table) {
  return pickI18n(lang, table);
}

const S = {
  title: {
    uk: 'Повідомлення',
    en: 'Messages',
    pl: 'Wiadomości',
    nl: 'Berichten',
    es: 'Mensajes',
    lt: 'Žinutės',
    lv: 'Ziņas',
    de: 'Nachrichten',
    ro: 'Mesaje',
    it: 'Messaggi',
    hy: 'Հաղորդագրություններ',
  },
  hint: {
    uk: 'Тут з’являться чати з іншими мандрівниками. Розділ у розробці.',
    en: 'Chats with other travelers will appear here. This section is in development.',
    pl: 'Tutaj pojawią się czaty. Sekcja w przygotowaniu.',
    nl: 'Chats verschijnen hier binnenkort.',
    es: 'Los chats aparecerán aquí. En desarrollo.',
    lt: 'Pokalbiai čia netrukus. Ruosiama.',
    lv: 'Čati drīzumā. Izstrādē.',
    de: 'Chats folgen in Kürze.',
    ro: 'Chat-urile vor apărea aici. În lucru.',
    it: 'Le chat arriveranno presto.',
    hy: 'Զրույցները կհայտնվեն այստեղ։ Բաժինը մշակման մեջ է։',
  },
  brandTitle: {
    uk: 'KRAÏNA',
    en: 'KRAÏNA',
  },
  searchPlaceholder: {
    uk: 'Пошук',
    en: 'Search',
  },
  delete: {
    uk: 'Видалити',
    en: 'Delete',
  },
  deleteThreadConfirm: {
    uk: 'Видалити цей чат? Його буде прибрано зі списку.',
    en: 'Delete this chat? It will be removed from your list.',
  },
  write: {
    uk: 'Написати',
    en: 'Write',
  },
  send: {
    uk: 'Надіслати',
    en: 'Send',
  },
  parameters: {
    uk: 'Параметри',
    en: 'Options',
  },
  sendPhoto: {
    uk: 'Відправити фото',
    en: 'Send photo',
  },
  viewProfile: {
    uk: 'Переглянути профіль',
    en: 'View profile',
  },
  shareContact: {
    uk: 'Поділитись контактом',
    en: 'Share contact',
  },
  shareLocation: {
    uk: 'Поділитись геолокацією',
    en: 'Share location',
  },
  deleteChat: {
    uk: 'Видалити чат',
    en: 'Delete chat',
  },
  routeCta: {
    uk: 'Маршрут',
    en: 'Route',
  },
  justNow: {
    uk: 'щойно',
    en: 'now',
  },
  minShortDot: {
    uk: 'хв.',
    en: 'm',
  },
  hourShort: {
    uk: 'год.',
    en: 'h',
  },
  dayOne: {
    uk: '1 день',
    en: '1 day',
  },
  pickFriend: {
    uk: 'Оберіть контакт для нового чату',
    en: 'Pick a contact to start a chat',
  },
  locationShared: {
    uk: 'Геолокацію додано в чат',
    en: 'Location added to chat',
  },
  needLocation: {
    uk: 'Увімкніть геолокацію',
    en: 'Enable location to share',
  },
  profileSoon: {
    uk: 'Профіль контакту незабаром',
    en: 'Contact profile coming soon',
  },
  chatCleared: {
    uk: 'Повідомлення очищено',
    en: 'Messages cleared',
  },
  clearMessages: {
    uk: 'Очистити повідомлення',
    en: 'Clear messages',
  },
  cloudSyncNote: {
    uk: 'Чати збережені на пристрої та в акаунті (якщо увійшли через Firebase).',
    en: 'Chats are saved on device and in your account when signed in with Firebase.',
  },
  backendChatsNote: {
    uk: 'Серверні чати: друзі — взаємні підписки. Інші повідомлення — у «Запитах», доки ви не приймете.',
    en: 'Server chats: friends are mutual follows. Messages from others appear in Requests until you accept.',
  },
  inboxTab: { uk: 'Чати', en: 'Chats' },
  requestsTab: { uk: 'Запити', en: 'Requests' },
  startChatTitle: { uk: 'Новий чат', en: 'New chat' },
  usernameLabel: { uk: 'Нікнейм у KRAÏNA', en: 'KRAÏNA username' },
  openChatCta: { uk: 'Відкрити чат', en: 'Open chat' },
  needBackendLogin: {
    uk: 'Увійдіть через email у KRAÏNA (бекенд), щоб писати користувачам сервера.',
    en: 'Sign in with KRAÏNA email (backend) to message users on the server.',
  },
  acceptRequest: { uk: 'Прийняти запит', en: 'Accept request' },
  requestBanner: {
    uk: 'Цей користувач ще не у друзях. Прийміть запит, щоб чат був у звичайному списку.',
    en: 'This person is not in your mutual friends yet. Accept to move the chat to your main list.',
  },
  apiMediaSoon: {
    uk: 'Фото в серверному чаті з’являться пізніше.',
    en: 'Photos in server chat are not synced yet.',
  },
  pickMutualOrUsername: {
    uk: 'Оберіть друга або введіть нікнейм',
    en: 'Pick a mutual friend or enter a username',
  },
};

fillBundleMissingLangs(S);

export function st(lang, key) {
  const row = S[key];
  if (!row) return '';
  return pick(lang, row);
}

export function formatChatTime(ts, lang) {
  const langUk = appLangBase(lang).split(/[-_]/)[0].toLowerCase() === 'uk';
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (langUk) {
    if (diff < 60000) return pick(lang, S.justNow);
    if (min < 60) return `${min} ${pick(lang, S.minShortDot)}`;
    if (h < 24) return `${h} ${pick(lang, S.hourShort)}`;
    if (d === 1) return pick(lang, S.dayOne);
    return pick(lang, { uk: `${d} дні`, en: `${d} days` });
  }
  if (diff < 60000) return pick(lang, S.justNow);
  if (min < 60) return `${min} ${pick(lang, S.minShortDot)}`;
  if (h < 24) return `${h} ${pick(lang, S.hourShort)}`;
  if (d === 1) return pick(lang, S.dayOne);
  return `${d} ${pick(lang, { uk: 'дні', en: 'days' })}`;
}
