import { useAuthStore } from './auth/authStore';
import { hasBackendSession } from './backendAuthApi';
import { ApiError } from './auth/types';
import { rememberDeletedFeedPostIds } from './feedDeletedTombstones';
import { ensureFeedSocialReady, feedDeletePost, feedListMyPosts } from './feedApi';
import {
  getFeedPostBackendId,
  getLocalFeedPostIdsForBackendId,
  getUserFeedPosts,
  removeFeedPostBackendIdMapEntry,
  removeUserFeedPost,
} from './feedLocalStorage';
import {
  isLocalFeedPostId,
  isLocalFeedPostShadowedByApi,
  isServerFeedPostId,
  resolveBackendFeedPostId,
  waitForFeedPostSync,
} from './feedPostSyncBridge';
import { invalidateProfilePostsWarm } from './profilePostsCache';
import { emitFeedMediaUpdated } from './feedSyncEvents';

async function expandDeletionIds(user, idsToRemove, backendId) {
  if (!user || !idsToRemove.size) return;
  const viewerUserId = String(
    useAuthStore.getState().profileMe?.profile?.user_id || user?.id || '',
  );

  let apiPostSnapshot = null;
  if (backendId && hasBackendSession()) {
    try {
      const posts = await feedListMyPosts(80);
      apiPostSnapshot =
        (Array.isArray(posts) ? posts : []).find((p) => String(p.id) === String(backendId)) ||
        null;
    } catch {
      /* */
    }
  }

  const locals = await getUserFeedPosts(user);
  for (const local of locals) {
    const lid = String(local?.id || '');
    if (!isLocalFeedPostId(lid)) continue;
    const mapped = await getFeedPostBackendId(user, lid);
    if (mapped && idsToRemove.has(String(mapped))) {
      idsToRemove.add(lid);
      continue;
    }
    if (apiPostSnapshot && isLocalFeedPostShadowedByApi(local, [apiPostSnapshot], viewerUserId)) {
      idsToRemove.add(lid);
    }
  }
}
/**
 * Видаляє публікацію: сервер (якщо є), локальний чернетковий пост і мапінг id.
 * @param {object | null | undefined} user
 * @param {string} postId
 */
export async function deleteFeedPublication(user, postId) {
  const pid = String(postId || '').trim();
  if (!pid) throw new Error('invalid_post');

  await useAuthStore.getState().hydrate();
  if (user) {
    await ensureFeedSocialReady(user);
  }

  const localId = isLocalFeedPostId(pid) ? pid : null;
  let backendId = isServerFeedPostId(pid) ? pid : null;

  if (localId) {
    await waitForFeedPostSync(localId, 12000).catch(() => null);
  }

  if (!backendId && user) {
    const mapped = localId ? await getFeedPostBackendId(user, localId) : null;
    if (mapped && isServerFeedPostId(mapped)) backendId = mapped;
  }
  if (!backendId) {
    const resolved = await resolveBackendFeedPostId(pid, { user });
    if (resolved && isServerFeedPostId(resolved)) backendId = resolved;
  }

  const idsToRemove = new Set([pid]);
  if (localId) idsToRemove.add(localId);
  if (backendId) idsToRemove.add(backendId);

  if (user && backendId) {
    const mappedLocals = await getLocalFeedPostIdsForBackendId(user, backendId);
    for (const lid of mappedLocals) idsToRemove.add(lid);
  }

  if (user) {
    await expandDeletionIds(user, idsToRemove, backendId);
  }

  if (backendId && hasBackendSession()) {
    try {
      await feedDeletePost(backendId);
    } catch (e) {
      if (!(e instanceof ApiError && (e.status === 404 || e.payload?.error === 'post_not_found'))) {
        throw e;
      }
    }
  } else if (!localId && isServerFeedPostId(pid) && hasBackendSession()) {
    try {
      await feedDeletePost(pid);
    } catch (e) {
      if (!(e instanceof ApiError && (e.status === 404 || e.payload?.error === 'post_not_found'))) {
        throw e;
      }
    }
    backendId = pid;
  } else if (!localId && isServerFeedPostId(pid) && !hasBackendSession()) {
    throw new Error('need_login');
  }

  if (user) {
    for (const id of idsToRemove) {
      await removeUserFeedPost(user, id);
    }
    for (const id of idsToRemove) {
      if (isLocalFeedPostId(id)) {
        await removeFeedPostBackendIdMapEntry(user, id);
      }
    }
    await rememberDeletedFeedPostIds(user, [...idsToRemove]);
    invalidateProfilePostsWarm(user);
  }

  const userId = String(
    useAuthStore.getState().profileMe?.profile?.user_id || user?.id || '',
  );
  emitFeedMediaUpdated({
    kind: 'delete',
    postId: backendId || pid,
    localPostId: localId || (isLocalFeedPostId(pid) ? pid : null),
    removedIds: [...idsToRemove],
    userId,
  });

  return true;
}
