

## 2) Add exports

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
