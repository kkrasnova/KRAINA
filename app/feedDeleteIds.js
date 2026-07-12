/** Усі id поста, які треба прибрати з UI після видалення (серверний, локальний, дублікати). */
export function feedDeleteIdSet(payload) {
  const ids = new Set();
  if (Array.isArray(payload?.removedIds)) {
    for (const x of payload.removedIds) {
      const s = String(x || '').trim();
      if (s) ids.add(s);
    }
  }
  for (const x of [payload?.postId, payload?.localPostId]) {
    const s = String(x || '').trim();
    if (s) ids.add(s);
  }
  return ids;
}
