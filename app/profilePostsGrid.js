import { resolveFeedMediaUrl, pickFirstFeedMediaUrl } from './feedMediaUrl';
import { isLocalFeedPostShadowedByApi } from './feedPostSyncBridge';

export function mapLocalPostsToGrid(arr) {
  return (Array.isArray(arr) ? arr : [])
    .map((p) => {
      const raw = p.uri || (Array.isArray(p.uris) && p.uris[0]) || '';
      const u = resolveFeedMediaUrl(raw);
      const nUris = Array.isArray(p.uris) ? p.uris.length : u ? 1 : 0;
      return {
        id: p.id,
        uri: u,
        isVideo: /\.(mp4|mov)(\?|$)/i.test(String(u)),
        mediaCount: Math.max(nUris, u ? 1 : 0),
      };
    })
    .filter((row) => row.uri);
}

export function apiPostToGridRow(p, localPosts, viewerUserId) {
  if (!p?.id) return null;
  const urls = Array.isArray(p.media_urls)
    ? p.media_urls.filter(Boolean)
    : Array.isArray(p.mediaUrls)
      ? p.mediaUrls.filter(Boolean)
      : [];
  let uri = pickFirstFeedMediaUrl(p);
  if (!uri && Array.isArray(localPosts) && viewerUserId) {
    const match = localPosts.find(
      (local) =>
        isLocalFeedPostShadowedByApi(local, [p], viewerUserId) &&
        (local.uri || (Array.isArray(local.uris) && local.uris[0])),
    );
    if (match) {
      uri = resolveFeedMediaUrl(match.uri || match.uris?.[0] || '');
    }
  }
  if (!uri) return null;
  return {
    id: p.id,
    uri,
    isVideo: /\.(mp4|mov)(\?|$)/i.test(String(uri)),
    mediaCount: urls.length || 1,
  };
}

export function localPostToGridRow(p) {
  if (!p) return null;
  const u = resolveFeedMediaUrl(p.uri || (Array.isArray(p.uris) && p.uris[0]) || '');
  if (!u) return null;
  const nUris = Array.isArray(p.uris) ? p.uris.length : u ? 1 : 0;
  return {
    id: p.id,
    uri: u,
    isVideo: /\.(mp4|mov)(\?|$)/i.test(String(u)),
    mediaCount: Math.max(nUris, u ? 1 : 0),
  };
}

export function mergeProfileGridFromApi(posts, localPosts, viewerUserId) {
  let next = [];
  if (Array.isArray(posts) && posts.length) {
    next = posts.map((p) => apiPostToGridRow(p, localPosts, viewerUserId)).filter(Boolean);
  }
  const localRows = mapLocalPostsToGrid(localPosts);
  const apiIds = new Set(next.map((x) => String(x.id)));
  const extras = localRows.filter((row) => {
    if (apiIds.has(String(row.id))) return false;
    const src = localPosts.find((p) => String(p.id) === String(row.id));
    return !isLocalFeedPostShadowedByApi(src, posts, viewerUserId);
  });
  return [...next, ...extras];
}

export function mergeGridPostRows(prev, incoming) {
  const rows = Array.isArray(incoming) ? incoming : [];
  if (!rows.length) return Array.isArray(prev) ? prev : [];
  const map = new Map((Array.isArray(prev) ? prev : []).map((row) => [String(row.id), row]));
  for (const row of rows) {
    if (!row?.id) continue;
    map.set(String(row.id), row);
  }
  return Array.from(map.values());
}
