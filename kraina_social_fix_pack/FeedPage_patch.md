# FeedPage.js minimal UI patch

## 1) Add import from feedApi

feedTogglePostRepost,

## 2) Add state near like/comment maps

const [postRepostMap, setPostRepostMap] = useState({});
const [postRepostCountMap, setPostRepostCountMap] = useState({});

## 3) In posts synchronization useEffect add:

const nextRepost = {};
const nextRepostCount = {};

posts.forEach((p) => {
  const id = String(p.id);
  nextRepost[id] = postRepostMap[id] != null ? postRepostMap[id] : !!p.repostedByViewer || !!p.reposted_by_viewer;
  nextRepostCount[id] = Number.isFinite(Number(postRepostCountMap[id]))
    ? Number(postRepostCountMap[id])
    : Number(p.repostsCount ?? p.reposts_count) || 0;
});

setPostRepostMap(nextRepost);
setPostRepostCountMap(nextRepostCount);

## 4) Add action

const toggleRepost = useCallback(async (post) => {
  const id = String(post?.id || '');
  if (!id) return;

  const prevReposted = !!postRepostMap[id];
  const prevCount = Number(postRepostCountMap[id]) || 0;
  const optimistic = prevReposted ? Math.max(0, prevCount - 1) : prevCount + 1;

  setPostRepostMap((m) => ({ ...m, [id]: !prevReposted }));
  setPostRepostCountMap((m) => ({ ...m, [id]: optimistic }));

  try {
    const out = await feedTogglePostRepost(id);
    setPostRepostMap((m) => ({ ...m, [id]: !!out.reposted }));
    setPostRepostCountMap((m) => ({ ...m, [id]: Number(out.reposts_count) || 0 }));
    emitFeedMediaUpdated({ postId: id });
  } catch {
    setPostRepostMap((m) => ({ ...m, [id]: prevReposted }));
    setPostRepostCountMap((m) => ({ ...m, [id]: prevCount }));
  }
}, [postRepostMap, postRepostCountMap]);

## 5) Add button near like/comment/share actions

<Pressable onPress={() => toggleRepost(post)} style={styles.actionPress}>
  <Ionicons
    name="repeat-outline"
    size={23}
    color={postRepostMap[String(post.id)] ? accent : textMain}
  />
  <Text style={[styles.actionCount, { color: textMuted }]}>
    {Number(postRepostCountMap[String(post.id)]) || 0}
  </Text>
</Pressable>
