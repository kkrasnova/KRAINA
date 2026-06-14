import { API_BASE_URL, normalizeBackendAssetUrl } from './auth/config';
import { useAuthStore } from './auth/authStore';
import { enqueueOutbox } from './offline/outboxStore';
import { getIsOnline } from './offline/networkStatus';
import { registerOutboxHandler } from './offline/syncEngine';

function authJsonHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function guessMime(uri) {
  const u = String(uri || '').toLowerCase();
  if (u.endsWith('.png')) return 'image/png';
  if (u.endsWith('.webp')) return 'image/webp';
  if (u.endsWith('.mp4') || u.endsWith('.m4v')) return 'video/mp4';
  if (u.endsWith('.mov')) return 'video/quicktime';
  return 'image/jpeg';
}

function guessName(uri) {
  const u = String(uri || '');
  const base = u.split('/').pop() || 'upload';
  if (base.includes('.')) return base;
  const lower = u.toLowerCase();
  if (lower.includes('.mp4') || lower.includes('.m4v')) return `upload_${Date.now()}.mp4`;
  if (lower.includes('.mov')) return `upload_${Date.now()}.mov`;
  return `${base}.jpg`;
}

function isVideoUri(uri) {
  const u = String(uri || '').toLowerCase();
  return u.endsWith('.mp4') || u.endsWith('.m4v') || u.endsWith('.mov');
}

async function prepareMediaForUpload(localUri) {
  const src = String(localUri || '').trim();
  if (!src || isVideoUri(src)) return src;
  try {
    const mod = await import('expo-image-manipulator');
    const manip = mod?.manipulateAsync;
    if (typeof manip !== 'function') return src;
    const out = await manip(
      src,
      [],
      { compress: 0.92, format: mod.SaveFormat?.JPEG ?? 'jpeg' },
    );
    return out?.uri || src;
  } catch {
    return src;
  }
}

function normalizePostRow(post) {
  if (!post || typeof post !== 'object') return post;
  const media = Array.isArray(post.media_urls)
    ? post.media_urls.map((u) => normalizeBackendAssetUrl(String(u || '')))
    : [];
  return {
    ...post,
    media_urls: media,
    avatar_url: normalizeBackendAssetUrl(String(post.avatar_url || '')),

    likes_count: Number(post.likes_count) || 0,
    comments_count: Number(post.comments_count) || 0,
    reposts_count: Number(post.reposts_count) || 0,

    liked_by_viewer: Boolean(post.liked_by_viewer),
    reposted_by_viewer: Boolean(post.reposted_by_viewer),
  };
}

function normalizeStoryRow(story) {
  if (!story || typeof story !== 'object') return story;
  return {
    ...story,
    media_url: normalizeBackendAssetUrl(String(story.media_url || '')),
    avatar_url: normalizeBackendAssetUrl(String(story.avatar_url || '')),
  };
}

export function hasFeedApiToken() {
  return !!useAuthStore.getState().accessToken;
}

function outboxUserId() {
  const u = useAuthStore.getState().user;
  return String(u?.id || '');
}

function canTryNow() {
  return getIsOnline() && !!useAuthStore.getState().accessToken;
}

async function queueFeedAction(type, payload, dedupeKey = '', allowMerge = true) {
  return enqueueOutbox({
    type,
    payload,
    dedupeKey,
    allowMerge,
    authUserId: outboxUserId(),
  });
}

async function _remoteFeedCreatePost(body, tokenOverride = '', idempotencyKey = '') {
  const token = tokenOverride || useAuthStore.getState().accessToken;
  if (!token) throw new Error('no_token');
  const res = await fetch(`${API_BASE_URL}/api/feed/posts`, {
    method: 'POST',
    headers: {
      ...authJsonHeaders(token),
      ...(idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* */
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.post;
}

async function _remoteFeedPatchPostArchive(postId, archived, tokenOverride = '', idempotencyKey = '') {
  const token = tokenOverride || useAuthStore.getState().accessToken;
  if (!token) throw new Error('no_token');
  const res = await fetch(`${API_BASE_URL}/api/feed/posts/${encodeURIComponent(postId)}`, {
    method: 'PATCH',
    headers: {
      ...authJsonHeaders(token),
      ...(idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {}),
    },
    body: JSON.stringify({ archived: !!archived }),
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* */
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function _remoteFeedToggleStoryLike(storyId, tokenOverride = '', idempotencyKey = '') {
  const token = tokenOverride || useAuthStore.getState().accessToken;
  if (!token || !storyId) throw new Error('no_token');
  const res = await fetch(`${API_BASE_URL}/api/feed/stories/${encodeURIComponent(storyId)}/like`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {}),
    },
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* */
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return Boolean(data.liked);
}

async function _remoteFeedDeleteStory(storyId, tokenOverride = '', idempotencyKey = '') {
  const token = tokenOverride || useAuthStore.getState().accessToken;
  if (!token || !storyId) throw new Error('no_token');
  const res = await fetch(`${API_BASE_URL}/api/feed/stories/${encodeURIComponent(storyId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {}),
    },
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* */
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return true;
}

async function _remoteFeedCreateStoryFromUri(localUri, caption = '', tokenOverride = '', idempotencyKey = '') {
  const token = tokenOverride || useAuthStore.getState().accessToken;
  if (!token || !localUri) throw new Error('no_token');
  const preparedUri = await prepareMediaForUpload(localUri);
  const form = new FormData();
  form.append('file', {
    uri: preparedUri,
    name: guessName(preparedUri),
    type: guessMime(preparedUri),
  });
  form.append('caption', caption || '');
  const res = await fetch(`${API_BASE_URL}/api/feed/stories`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {}),
    },
    body: form,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* */
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.story;
}

export async function feedUploadMediaFromUri(localUri) {
  const token = useAuthStore.getState().accessToken;
  if (!token || !localUri) return null;
  const preparedUri = await prepareMediaForUpload(localUri);
  const form = new FormData();
  form.append('file', {
    uri: preparedUri,
    name: guessName(preparedUri),
    type: guessMime(preparedUri),
  });
  const res = await fetch(`${API_BASE_URL}/api/feed/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* */
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export async function feedCreatePost(body) {
  if (canTryNow()) {
    try {
      return await _remoteFeedCreatePost(body);
    } catch {
      /* queue below */
    }
  }
  await queueFeedAction('feed.createPost', { body }, `feed.createPost:${JSON.stringify(body || {}).slice(0, 120)}`, false);
  return {
    id: `offline_post_${Date.now().toString(36)}`,
    ...body,
    _offlineQueued: true,
  };
}

export async function feedListMyPosts(limit = 60) {
  const token = useAuthStore.getState().accessToken;
  if (!token) return null;
  const res = await fetch(`${API_BASE_URL}/api/feed/posts/me?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* */
  }
  if (!res.ok) return null;
  return Array.isArray(data.posts) ? data.posts.map(normalizePostRow) : [];
}

export async function feedListUserPosts(username, limit = 40) {
  const token = useAuthStore.getState().accessToken;
  if (!token) return null;
  const u = String(username || '')
    .trim()
    .replace(/^@/, '')
    .replace(/[^a-zA-Z0-9_]/g, '');
  if (!u) return [];
  const res = await fetch(
    `${API_BASE_URL}/api/feed/posts/user/${encodeURIComponent(u)}?limit=${limit}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* */
  }
  if (!res.ok) return null;
  return Array.isArray(data.posts) ? data.posts.map(normalizePostRow) : [];
}

export async function feedListFriendsPosts(limit = 40) {
  const token = useAuthStore.getState().accessToken;
  if (!token) return null;
  const res = await fetch(`${API_BASE_URL}/api/feed/posts/friends?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* */
  }
  if (!res.ok) return null;
  return Array.isArray(data.posts) ? data.posts.map(normalizePostRow) : [];
}

export async function feedListWorldPosts(limit = 40) {
  const token = useAuthStore.getState().accessToken;
  if (!token) return null;
  const res = await fetch(`${API_BASE_URL}/api/feed/posts/world?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* */
  }
  if (!res.ok) return null;
  return Array.isArray(data.posts) ? data.posts.map(normalizePostRow) : [];
}

export async function feedCreateStoryFromUri(localUri, caption) {
  if (!localUri) throw new Error('invalid_story');
  if (canTryNow()) {
    try {
      return await _remoteFeedCreateStoryFromUri(localUri, caption);
    } catch {
      /* queue below */
    }
  }
  await queueFeedAction(
    'feed.createStory',
    { localUri, caption: caption || '' },
    `feed.createStory:${String(localUri).slice(-120)}`,
    false,
  );
  return {
    id: `offline_story_${Date.now().toString(36)}`,
    uri: localUri,
    caption: caption || '',
    _offlineQueued: true,
  };
}

export async function feedListStoriesTray() {
  const token = useAuthStore.getState().accessToken;
  if (!token) return null;
  const res = await fetch(`${API_BASE_URL}/api/feed/stories`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* */
  }
  if (!res.ok) return null;
  return Array.isArray(data.stories) ? data.stories.map(normalizeStoryRow) : [];
}

export async function feedListStoriesForUser(userId) {
  const token = useAuthStore.getState().accessToken;
  if (!token || !userId) return null;
  const res = await fetch(`${API_BASE_URL}/api/feed/stories/user/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* */
  }
  if (!res.ok) return null;
  return Array.isArray(data.stories) ? data.stories.map(normalizeStoryRow) : [];
}

export async function feedRecordStoryView(storyId) {
  const token = useAuthStore.getState().accessToken;
  if (!token || !storyId) return;
  await fetch(`${API_BASE_URL}/api/feed/stories/${encodeURIComponent(storyId)}/view`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function feedGetStoryStats(storyId) {
  const token = useAuthStore.getState().accessToken;
  if (!token || !storyId) return { viewers: [], likers: [] };
  const res = await fetch(`${API_BASE_URL}/api/feed/stories/${encodeURIComponent(storyId)}/stats`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* */
  }
  if (!res.ok) return { viewers: [], likers: [] };
  return {
    viewers: Array.isArray(data.viewers) ? data.viewers : [],
    likers: Array.isArray(data.likers) ? data.likers : [],
  };
}

export async function feedDeleteStory(storyId) {
  if (!storyId) throw new Error('invalid_story');
  if (canTryNow()) {
    try {
      return await _remoteFeedDeleteStory(storyId);
    } catch {
      /* queue below */
    }
  }
  await queueFeedAction('feed.deleteStory', { storyId }, `feed.deleteStory:${storyId}`);
  return true;
}

export async function feedToggleStoryLike(storyId) {
  if (!storyId) throw new Error('invalid_story');
  if (canTryNow()) {
    try {
      return await _remoteFeedToggleStoryLike(storyId);
    } catch {
      /* queue below */
    }
  }
  await queueFeedAction('feed.toggleStoryLike', { storyId }, `feed.toggleStoryLike:${storyId}`);
  return true;
}

export async function feedListMyArchivedPosts(limit = 40) {
  const token = useAuthStore.getState().accessToken;
  if (!token) return [];
  const res = await fetch(`${API_BASE_URL}/api/feed/posts/me/archived?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* */
  }
  if (!res.ok) return [];
  return data.posts || [];
}

export async function feedPatchPostArchive(postId, archived) {
  if (!postId) throw new Error('invalid_post');
  if (canTryNow()) {
    try {
      return await _remoteFeedPatchPostArchive(postId, archived);
    } catch {
      /* queue below */
    }
  }
  await queueFeedAction('feed.patchPostArchive', { postId, archived: !!archived }, `feed.patchPostArchive:${postId}`);
  return { ok: true, _offlineQueued: true };
}

export async function feedUpdatePost(postId, body) {
  const token = useAuthStore.getState().accessToken;
  if (!token || !postId) throw new Error('no_token');
  const res = await fetch(`${API_BASE_URL}/api/feed/posts/${encodeURIComponent(postId)}`, {
    method: 'PUT',
    headers: authJsonHeaders(token),
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* */
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export async function feedDeletePost(postId) {
  const token = useAuthStore.getState().accessToken;
  const id = String(postId || '').trim();
  if (!token || !id) throw new Error('no_token');
  const res = await fetch(`${API_BASE_URL}/api/feed/posts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* */
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return true;
}

export async function feedTogglePostLike(postId) {
  const token = useAuthStore.getState().accessToken;
  if (!token || !postId) throw new Error('no_token');
  const res = await fetch(`${API_BASE_URL}/api/feed/posts/${encodeURIComponent(postId)}/like`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* */
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return {
    liked: Boolean(data.liked),
    likes_count: Number(data.likes_count) || 0,
  };
}

export async function feedTogglePostRepost(postId, caption = '') {
  const token = useAuthStore.getState().accessToken;
  if (!token || !postId) throw new Error('no_token');

  const res = await fetch(`${API_BASE_URL}/api/feed/posts/${encodeURIComponent(postId)}/repost`, {
    method: 'POST',
    headers: authJsonHeaders(token),
    body: JSON.stringify({ caption: String(caption || '').trim() }),
  });

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* */
  }

  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

  return {
    reposted: Boolean(data.reposted),
    reposts_count: Number(data.reposts_count) || 0,
  };
}

export async function feedListPostComments(postId, limit = 80) {
  const token = useAuthStore.getState().accessToken;
  if (!token || !postId) throw new Error('no_token');
  const res = await fetch(`${API_BASE_URL}/api/feed/posts/${encodeURIComponent(postId)}/comments?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* */
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return Array.isArray(data.comments)
    ? data.comments.map((row) => ({
        ...row,
        avatar_url: normalizeBackendAssetUrl(String(row.avatar_url || '')),
      }))
    : [];
}
export async function feedToggleCommentLike(commentId) {
  const token = useAuthStore.getState().accessToken;
  if (!token || !commentId) throw new Error('no_token');

  const res = await fetch(`${API_BASE_URL}/api/feed/comments/${encodeURIComponent(commentId)}/like`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* */
  }

  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

  return {
    liked: Boolean(data.liked),
    likes_count: Number(data.likes_count) || 0,
  };
}

export async function feedDeletePostComment(commentId) {
  const token = useAuthStore.getState().accessToken;
  if (!token || !commentId) throw new Error('no_token');

  const res = await fetch(`${API_BASE_URL}/api/feed/comments/${encodeURIComponent(commentId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* */
  }

  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

  return true;
}

export async function feedAddPostComment(postId, content) {
  const token = useAuthStore.getState().accessToken;
  if (!token || !postId) throw new Error('no_token');
  const res = await fetch(`${API_BASE_URL}/api/feed/posts/${encodeURIComponent(postId)}/comments`, {
    method: 'POST',
    headers: authJsonHeaders(token),
    body: JSON.stringify({ content: String(content || '').trim() }),
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* */
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  const row = data.comment || {};
  return {
    ...row,
    avatar_url: normalizeBackendAssetUrl(String(row.avatar_url || '')),
  };
}

registerOutboxHandler('feed.createPost', async (item, token, ctx) => {
  await _remoteFeedCreatePost(item.payload?.body || {}, token, ctx?.idempotencyKey || '');
});

registerOutboxHandler('feed.patchPostArchive', async (item, token, ctx) => {
  await _remoteFeedPatchPostArchive(item.payload?.postId, !!item.payload?.archived, token, ctx?.idempotencyKey || '');
});

registerOutboxHandler('feed.toggleStoryLike', async (item, token, ctx) => {
  await _remoteFeedToggleStoryLike(item.payload?.storyId, token, ctx?.idempotencyKey || '');
});

registerOutboxHandler('feed.deleteStory', async (item, token, ctx) => {
  await _remoteFeedDeleteStory(item.payload?.storyId, token, ctx?.idempotencyKey || '');
});

registerOutboxHandler('feed.createStory', async (item, token, ctx) => {
  await _remoteFeedCreateStoryFromUri(item.payload?.localUri, item.payload?.caption || '', token, ctx?.idempotencyKey || '');
});
