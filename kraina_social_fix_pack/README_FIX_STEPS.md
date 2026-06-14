# KRAINA social interactions fix pack

Цель: привести социальные взаимодействия к модели популярных соцсетей:
- подписка направленная: user A follows user B, это НЕ делает B follows A;
- публичный профиль: подписка создаётся сразу;
- приватный профиль: создаётся follow request, accept создаёт только A -> B;
- лайки постов атомарные и безопасные от двойного тапа/гонок;
- комментарии поддерживают ответы, лайки комментариев, soft delete;
- репосты хранятся отдельно и имеют счётчик на посте;
- followers-only посты видят только подписчики, а не все пользователи публичного профиля.

Порядок внедрения:
1. Добавь SQL как новый файл:
   backend/src/migrations/sql/026_social_interactions_v2.sql

2. В backend/src/services/socialService.ts замени:
   - acceptFriendRequest
   - acceptFirestoreFollowIntoPostgres
   Также поменяй выборку фида/историй в feedService.ts, см. backend_patch.md.

3. В backend/src/services/feedService.ts:
   - замени canViewerAccessPost
   - замени togglePostLike
   - замени addPostComment
   - добавь функции togglePostRepost, toggleCommentLike, deletePostCommentByAuthor

4. В backend/src/routes/feedRoutes.ts:
   - добавь импорты новых функций
   - расширь comment schema
   - добавь routes для repost/comment-like/delete-comment

5. В feedApi.js добавь методы:
   - feedTogglePostRepost
   - feedToggleCommentLike
   - feedDeletePostComment

6. После правок:
   cd backend
   npm run build
   npm run migrate  # или твой существующий скрипт миграций
   npm start
