import { fillBundleMissingLangs, pickI18n } from './i18nBundle';

function pick(lang, table) {
  return pickI18n(lang, table);
}

const S = {
  friends: {
    uk: 'Друзі',
    en: 'Friends',
  },
  world: {
    uk: 'Світ',
    en: 'World',
  },
  stories: {
    uk: 'Історії',
    en: 'Stories',
  },
  postsSection: {
    uk: 'Публікації',
    en: 'Posts',
  },
  route: {
    uk: 'Маршрут',
    en: 'Route',
  },
  createSoon: {
    uk: 'Незабаром тут можна буде додати історію або пост.',
    en: 'Soon you will be able to add a story or post here.',
  },
  createStory: {
    uk: 'Створити',
    en: 'Create',
    pl: 'Utwórz',
    nl: 'Maken',
    es: 'Crear',
    de: 'Erstellen',
  },
  me: {
    uk: 'Ви',
    en: 'You',
    pl: 'Ty',
    nl: 'Jij',
    es: 'Tú',
    de: 'Du',
  },
  friendsHint: {
    uk: 'Публікації людей, на яких ви підписані й які підписані на вас.',
    en: 'Posts from people you follow who follow you back.',
  },
  worldHint: {
    uk: 'Публікації мандрівників з усього світу.',
    en: 'Travel posts from around the world.',
  },
  feedFriendsEmptyHeadline: {
    uk: 'Поки що порожньо',
    en: 'Nothing here yet',
  },
  feedWorldEmptyHeadline: {
    uk: 'Світ чекає',
    en: 'The world awaits',
  },
  feedFriendsEmptyCta: {
    uk: 'Знайти друзів',
    en: 'Find friends',
  },
  feedWorldEmptyCta: {
    uk: 'Створити пост',
    en: 'Create a post',
  },
  storyEmpty: {
    uk: 'Немає активних історій (24 год).',
    en: 'No active stories (24h window).',
  },
  storyStats: {
    uk: 'Статистика',
    en: 'Stats',
  },
  storySwipeUpHint: {
    uk: 'Вмахніть вгору — хто переглянув і статистика',
    en: 'Swipe up — viewers & stats',
  },
  storyViewersTitle: {
    uk: 'Хто переглянув',
    en: 'Who viewed',
  },
  storyNoViews: {
    uk: 'Поки що немає переглядів.',
    en: 'No views yet.',
  },
  storyClose: {
    uk: 'Закрити',
    en: 'Close',
  },
  routeLine: {
    uk: 'Маршрут',
    en: 'Route',
  },
  shareRoute: {
    uk: 'Поділитись маршрутом',
    en: 'Share route',
  },
  storyShare: {
    uk: 'Поділитись',
    en: 'Share',
  },
  storyReply: {
    uk: 'Відповісти',
    en: 'Reply',
  },
  postLike: { uk: 'Лайк', en: 'Like' },
  postComment: { uk: 'Коментар', en: 'Comment' },
  postSend: { uk: 'Надіслати', en: 'Send' },
  postCommentsTitle: { uk: 'Коментарі', en: 'Comments' },
  postCommentPlaceholder: { uk: 'Напишіть коментар…', en: 'Write a comment…' },
  postShareToFriend: { uk: 'Надіслати другу', en: 'Send to friend' },
  postNoFriendsToShare: { uk: 'Немає друзів для пересилання.', en: 'No friends to share with.' },
  postSharedOk: { uk: 'Надіслано у повідомлення.', en: 'Sent in messages.' },
  routeToFriend: { uk: 'Маршрут другу', en: 'Route to friend' },
  storyLike: {
    uk: 'Лайк',
    en: 'Like',
  },
  storyReplyTitle: {
    uk: 'Повідомлення автору',
    en: 'Message the author',
  },
  storyReplyPlaceholder: {
    uk: 'Відповідь на сторіс…',
    en: 'Reply to story…',
  },
  storyYourStoryHint: {
    uk: 'Ваша історія',
    en: 'Your story',
  },
  storyAuthorComposerHint: {
    uk: 'Це ваша історія — відповіді пишуть лише глядачі',
    en: 'Your story — only viewers can reply here',
  },
  storyCaptionMore: {
    uk: 'Розгорнути текст',
    en: 'Show full text',
  },
  storyCaptionLess: {
    uk: 'Згорнути',
    en: 'Show less',
  },
  storyMore: {
    uk: 'Меню',
    en: 'Menu',
  },
  storyAuthorMenuSubtitle: {
    uk: 'Керування цією історією',
    en: 'Manage this story',
  },
  storyMenuStats: {
    uk: 'Статистика',
    en: 'Stats',
  },
  storyMenuDelete: {
    uk: 'Видалити історію',
    en: 'Delete story',
  },
  storyDeleteConfirmTitle: {
    uk: 'Видалити історію?',
    en: 'Delete this story?',
  },
  storyDeleteConfirmBody: {
    uk: 'Її більше не буде видно підписникам.',
    en: 'Followers will no longer see it.',
  },
  storyDeleteFailed: {
    uk: 'Не вдалося видалити.',
    en: 'Could not delete.',
  },
  storyMediaLoadError: {
    uk: 'Не вдалося завантажити медіа. Перевірте мережу або URL сервера.',
    en: 'Could not load media. Check network or API URL.',
  },
  storySend: {
    uk: 'Надіслати',
    en: 'Send',
  },
  storyNeedLogin: {
    uk: 'Увійдіть у профіль, щоб писати в повідомленнях.',
    en: 'Sign in to send messages.',
  },
  storyCannotReplySelf: {
    uk: 'Не можна відповісти на власний сторіс.',
    en: 'You can’t reply to your own story.',
  },
  storyReplyFailed: {
    uk: 'Не вдалося надіслати. Спробуйте ще раз.',
    en: 'Could not send. Try again.',
  },
  openInMaps: {
    uk: 'Відкрити в картах',
    en: 'Open in maps',
  },
  followThisRoute: {
    uk: 'Іти маршрутом',
    en: 'Follow this route',
  },
  postNoRouteOrMapPoint: {
    uk: 'Для цього поста немає маршруту чи точки на карті.',
    en: 'No route or map point for this post.',
  },
  shareKrainaRoute: {
    uk: 'Маршрут KRAÏNA: {title}',
    en: 'KRAÏNA route: {title}',
  },
  storyReplyMessagePrefix: {
    uk: 'Відповідь на сторіс: ',
    en: 'Story reply: ',
  },
  storyReplyStoryUrlLine: {
    uk: 'Медіа (посилання)',
    en: 'Media (link)',
  },
  storyReplyStoryIdLine: {
    uk: 'ID сторіс',
    en: 'Story ID',
  },
  storyDmAttachmentTitle: {
    uk: 'Відповідь на сторіс',
    en: 'Story reply',
  },
  storyLikersTitle: {
    uk: 'Вподобали',
    en: 'Likes',
  },
  storySwipeStatsHint: {
    uk: 'Проведіть вгору — статистика',
    en: 'Swipe up for stats',
  },
  profileAddTitle: {
    uk: 'Додати',
    en: 'Add',
  },
  profileAddStory: {
    uk: 'Історію (24 год)',
    en: 'Story (24h)',
  },
  profileAddPost: {
    uk: 'Публікацію',
    en: 'Post',
  },
  composerNeedLogin: {
    uk: 'Увійдіть у акаунт KRAÏNA, щоб публікувати історії та пости.',
    en: 'Sign in to your KRAÏNA account to publish stories and posts.',
  },
};

fillBundleMissingLangs(S);

export function ft(lang, key) {
  return pick(lang, S[key] || {});
}
