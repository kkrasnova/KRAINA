const store = new Map();

export function threadCacheKey(threadId, useMessageApi = false) {
  return `${useMessageApi ? 'api' : 'local'}:${String(threadId)}`;
}

export function readThreadCache(key) {
  const row = store.get(key);
  if (!row) return null;
  return {
    messages: Array.isArray(row.messages) ? row.messages : [],
    peerName: row.peerName || '',
    peerDisplayName: row.peerDisplayName || row.peerName || '',
    peerUsername: row.peerUsername || '',
    peerAvatarUrl: row.peerAvatarUrl || '',
    pendingForMe: !!row.pendingForMe,
  };
}

export function writeThreadCache(key, { messages, peerName, peerDisplayName, peerUsername, peerAvatarUrl, pendingForMe }) {
  store.set(key, {
    messages: Array.isArray(messages) ? messages : [],
    peerName: peerName || '',
    peerDisplayName: peerDisplayName || peerName || '',
    peerUsername: peerUsername || '',
    peerAvatarUrl: peerAvatarUrl || '',
    pendingForMe: !!pendingForMe,
    at: Date.now(),
  });
}
