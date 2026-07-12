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
    uk: 'Пошук у чатах',
    en: 'Search chats',
  },
  composeSearchA11y: {
    uk: 'Знайти людину за нікнеймом',
    en: 'Find someone by username',
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
  messagePlaceholder: {
    uk: 'Повідомлення...',
    en: 'Message...',
    pl: 'Wiadomość...',
    de: 'Nachricht...',
    es: 'Mensaje...',
    it: 'Messaggio...',
    ro: 'Mesaj...',
    nl: 'Bericht...',
    lt: 'Žinutė...',
    lv: 'Ziņa...',
    hy: 'Հաղորդագրություն...',
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
  openGallery: {
    uk: 'Галерея',
    en: 'Gallery',
  },
  galleryDenied: {
    uk: 'Потрібен доступ до фотогалереї.',
    en: 'Photo library access is required.',
  },
  openCamera: {
    uk: 'Камера',
    en: 'Camera',
  },
  takePhoto: {
    uk: 'Камера',
    en: 'Camera',
  },
  voiceMessage: {
    uk: 'Голосове',
    en: 'Voice',
  },
  holdToRecord: {
    uk: 'Утримуйте для запису',
    en: 'Hold to record',
  },
  needMicPermission: {
    uk: 'Увімкніть доступ до мікрофона',
    en: 'Enable microphone access',
  },
  needCameraPermission: {
    uk: 'Увімкніть доступ до камери',
    en: 'Enable camera access',
  },
  recordingVoice: {
    uk: 'Запис…',
    en: 'Recording…',
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
  clearMessagesConfirm: {
    uk: 'Очистити всі повідомлення в цьому чаті?',
    en: 'Clear all messages in this chat?',
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
  recentChatsSection: { uk: 'Нещодавні', en: 'Recent' },
  startChatTitle: { uk: 'Знайти людину', en: 'Find someone' },
  usernameLabel: { uk: 'Нікнейм у KRAÏNA', en: 'KRAÏNA username' },
  openChatCta: { uk: 'Написати', en: 'Message' },
  usernameRequired: {
    uk: 'Введіть нікнейм',
    en: 'Enter a username',
  },
  needBackendLogin: {
    uk: 'Не вдалося підключити чати до вашого акаунта. Спробуйте вийти та увійти знову.',
    en: 'Could not connect chats to your account. Try signing out and back in.',
  },
  connectingChats: {
    uk: 'Підключення чатів…',
    en: 'Connecting chats…',
  },
  connectChatsHint: {
    uk: 'Натисніть «Спробувати знову» або увійдіть знову з увімкненим «Запамʼятати мене».',
    en: 'Tap “Try again” or sign in again with “Remember me” enabled.',
  },
  connectChatsRetry: {
    uk: 'Спробувати знову',
    en: 'Try again',
  },
  reauthForChatsCta: {
    uk: 'Увійти знову',
    en: 'Sign in again',
  },
  reauthGoogleForChatsCta: {
    uk: 'Увійти через Google',
    en: 'Sign in with Google',
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
    uk: 'Введіть нікнейм — можна написати будь-кому',
    en: 'Enter a username to message anyone',
  },
  globalSearchSubtitle: {
    uk: 'Друзям повідомлення йде одразу в «Чати». Іншим — у «Запити», доки вони не приймуть.',
    en: 'Friends get messages in Chats right away. Others see them in Requests until they accept.',
  },
  globalSearchResults: { uk: 'Знайдені користувачі', en: 'People found' },
  globalSearchEmpty: { uk: 'Нікого не знайдено за цим нікнеймом', en: 'No users found for this username' },
  globalSearchBusy: { uk: 'Шукаємо…', en: 'Searching…' },
  mutualFriendsSection: {
    uk: 'Взаємні друзі',
    en: 'Mutual friends',
  },
  startChatOrDivider: {
    uk: 'або',
    en: 'or',
  },
  noMutualFriendsHint: {
    uk: 'Поки немає взаємних друзів — введіть нікнейм вище',
    en: 'No mutual friends yet — enter a username above',
  },
  emptyInboxTitle: {
    uk: 'Поки що немає чатів',
    en: 'No chats yet',
  },
  emptyInboxBody: {
    uk: 'Напишіть другу або знайдіть мандрівника за нікнеймом',
    en: 'Message a friend or find a traveler by username',
  },
  emptyRequestsTitle: {
    uk: 'Немає нових запитів',
    en: 'No new requests',
  },
  emptyRequestsBody: {
    uk: 'Повідомлення від людей поза вашим колом друзів з’являться тут',
    en: 'Messages from people outside your circle will appear here',
  },
  newChatCta: {
    uk: 'Новий чат',
    en: 'New chat',
  },
  declineRequest: {
    uk: 'Відхилити',
    en: 'Decline',
  },
  emptyThreadTitle: {
    uk: 'Почніть розмову',
    en: 'Start the conversation',
    pl: 'Rozpocznij rozmowę',
    de: 'Starte die Unterhaltung',
    es: 'Empieza la conversación',
    it: 'Inizia la conversazione',
    nl: 'Begin het gesprek',
    ro: 'Începe conversația',
    lt: 'Pradėkite pokalbį',
    lv: 'Sāciet sarunu',
    hy: 'Սկսեք զրույցը',
  },
  emptyThreadBody: {
    uk: 'Напишіть привіт або оберіть ідею нижче',
    en: 'Say hello or pick an idea below',
    pl: 'Przywitaj się lub wybierz pomysł poniżej',
    de: 'Sag Hallo oder wähle eine Idee unten',
    es: 'Saluda o elige una idea abajo',
    it: 'Saluta o scegli un’idea qui sotto',
    nl: 'Zeg hallo of kies een idee hieronder',
    ro: 'Spune salut sau alege o idee mai jos',
    lt: 'Pasisveikinkite arba pasirinkite idėją žemiau',
    lv: 'Sveicinieties vai izvēlieties ideju zemāk',
    hy: 'Ողջույն ասեք կամ ընտրեք գաղափար ստորև',
  },
  emptyThreadSayHi: {
    uk: 'Привіт, @{name}! 👋',
    en: 'Hi @{name}! 👋',
    pl: 'Cześć @{name}! 👋',
    de: 'Hi @{name}! 👋',
    es: '¡Hola @{name}! 👋',
    it: 'Ciao @{name}! 👋',
    nl: 'Hoi @{name}! 👋',
    ro: 'Salut @{name}! 👋',
    lt: 'Labas, @{name}! 👋',
    lv: 'Sveiki, @{name}! 👋',
    hy: 'Ողջույն, @{name}! 👋',
  },
  icebreakerLandmark: {
    uk: 'Я щойно відвідав памʼятку в KRAINA 🗺️',
    en: 'I just visited a landmark in KRAINA 🗺️',
    pl: 'Właśnie odwiedziłem zabytek w KRAINA 🗺️',
    de: 'Ich habe gerade ein Wahrzeichen in KRAINA besucht 🗺️',
    es: 'Acabo de visitar un lugar en KRAINA 🗺️',
    it: 'Ho appena visitato un luogo in KRAINA 🗺️',
    nl: 'Ik heb net een bezienswaardigheid in KRAINA bezocht 🗺️',
    ro: 'Tocmai am vizitat un obiectiv în KRAINA 🗺️',
    lt: 'Ką tik aplankiau lankomą vietą KRAINA 🗺️',
    lv: 'Tikko apmeklēju apskates vietu KRAINA 🗺️',
    hy: 'Հենց նոր այցելեցի հուշարձան KRAINA-ում 🗺️',
  },
  icebreakerRoute: {
    uk: 'Складемо маршрут разом? 🧭',
    en: 'Want to plan a route together? 🧭',
    pl: 'Ułożymy trasę razem? 🧭',
    de: 'Sollen wir eine Route zusammen planen? 🧭',
    es: '¿Armamos una ruta juntos? 🧭',
    it: 'Facciamo un percorso insieme? 🧭',
    nl: 'Zullen we samen een route plannen? 🧭',
    ro: 'Facem un traseu împreună? 🧭',
    lt: 'Sudarysime maršrutą kartu? 🧭',
    lv: 'Izveidosim maršrutu kopā? 🧭',
    hy: 'Միասին երթուղի կկազմենք? 🧭',
  },
  icebreakerTravel: {
    uk: 'Де ти зараз мандруєш? ✈️',
    en: 'Where are you traveling now? ✈️',
    pl: 'Gdzie teraz podróżujesz? ✈️',
    de: 'Wo reist du gerade? ✈️',
    es: '¿Dónde viajas ahora? ✈️',
    it: 'Dove stai viaggiando ora? ✈️',
    nl: 'Waar reis je nu? ✈️',
    ro: 'Unde călătorești acum? ✈️',
    lt: 'Kur dabar keliaujate? ✈️',
    lv: 'Kur jūs tagad ceļojat? ✈️',
    hy: 'Որտե՞ղ եք հիմա ճանապարհորդում ✈️',
  },
  icebreakerKraina: {
    uk: 'KRAINA — круто відкривати міста разом 🇺🇦',
    en: 'KRAINA is great for discovering cities together 🇺🇦',
    pl: 'KRAINA to świetny sposób na odkrywanie miast razem 🇺🇦',
    de: 'KRAINA ist toll, um Städte gemeinsam zu entdecken 🇺🇦',
    es: 'KRAINA es genial para descubrir ciudades juntos 🇺🇦',
    it: 'KRAINA è perfetta per scoprire città insieme 🇺🇦',
    nl: 'KRAINA is geweldig om samen steden te ontdekken 🇺🇦',
    ro: 'KRAINA e grozav pentru a descoperi orașe împreună 🇺🇦',
    lt: 'KRAINA puikiai tinka miestams kartu atrasti 🇺🇦',
    lv: 'KRAINA ir lieliska pilsētu kopīgai atklāšanai 🇺🇦',
    hy: 'KRAINA-ն հիանալի է քաղաքները միասին բացահայտելու համար 🇺🇦',
  },

  // --- WebSocket connection status ---
  connected: {
    uk: 'Підключено',
    en: 'Connected',
    pl: 'Połączono',
    de: 'Verbunden',
    es: 'Conectado',
    it: 'Connesso',
    nl: 'Verbonden',
    ro: 'Conectat',
    lt: 'Prisijungta',
    lv: 'Savienots',
  },
  reconnecting: {
    uk: 'Перепідключення…',
    en: 'Reconnecting…',
    pl: 'Ponowne łączenie…',
    de: 'Wiederverbinden…',
    es: 'Reconectando…',
    it: 'Riconnessione…',
    nl: 'Opnieuw verbinden…',
    ro: 'Reconectare…',
    lt: 'Jungiamasi iš naujo…',
    lv: 'Atkārtota savienošana…',
  },

  // --- Audio calls ---
  callBtn: {
    uk: 'Аудіодзвінок',
    en: 'Audio call',
  },
  callIncoming: {
    uk: 'Вхідний дзвінок…',
    en: 'Incoming call…',
  },
  callOutgoing: {
    uk: 'Дзвінок…',
    en: 'Calling…',
  },
  callConnected: {
    uk: 'З&#x27;єднано',
    en: 'Connected',
  },
  callEnd: {
    uk: 'Завершити',
    en: 'End',
  },
  callMute: {
    uk: 'Вимкнути мікрофон',
    en: 'Mute',
  },
  callUnmute: {
    uk: 'Увімкнути мікрофон',
    en: 'Unmute',
  },
  callSpeakerOn: {
    uk: 'Гучномовець',
    en: 'Speaker',
  },
  callSpeakerOff: {
    uk: 'Динамік',
    en: 'Earpiece',
  },
  callAccept: {
    uk: 'Прийняти',
    en: 'Accept',
  },
  callDecline: {
    uk: 'Відхилити',
    en: 'Decline',
  },
  callNoNative: {
    uk: 'Дзвінки потребують нативної збірки з @livekit/react-native. Перезберіть додаток через expo-dev-client.',
    en: 'Calls require a native build with @livekit/react-native. Rebuild the app with expo-dev-client.',
  },
  callsUnavailable: {
    uk: 'Дзвінки тимчасово недоступні. Налаштуйте LiveKit на сервері (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET).',
    en: 'Calls are temporarily unavailable. Configure LiveKit on the server (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET).',
  },
  callEnded: {
    uk: 'Дзвінок завершено',
    en: 'Call ended',
  },

  // --- Video calls ---
  callVideoBtn: {
    uk: 'Відеодзвінок',
    en: 'Video call',
  },
  callSwitchToVideo: {
    uk: 'Увімкнути відео',
    en: 'Switch to video',
  },
  callSwitchToAudio: {
    uk: 'Вимкнути відео',
    en: 'Switch to audio',
  },
  callCameraOn: {
    uk: 'Камера увімкнена',
    en: 'Camera on',
  },
  callCameraOff: {
    uk: 'Камера вимкнена',
    en: 'Camera off',
  },
  callSwitchCamera: {
    uk: 'Повернути камеру',
    en: 'Flip camera',
  },
  callWaitingVideo: {
    uk: 'Очікування відео…',
    en: 'Waiting for video…',
  },
};


fillBundleMissingLangs(S);

export function st(lang, key) {
  const row = S[key];
  if (!row) return '';
  return pick(lang, row);
}

export function chatIcebreakerKeys() {
  return ['emptyThreadSayHi', 'icebreakerLandmark', 'icebreakerRoute', 'icebreakerTravel', 'icebreakerKraina'];
}

export function formatChatIcebreaker(lang, key, peerName) {
  const name = String(peerName || '').replace(/^@/, '').trim() || 'friend';
  return st(lang, key).replace(/\{name\}/g, name);
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
