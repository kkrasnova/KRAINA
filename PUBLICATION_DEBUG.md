# Publication Debug Guide

## Issue

Publications are not being published ("не публикуется публикации вообще")

## Changes Made

### 1. FeedPostComposerPage.js (app/)

- **Fixed:** `publish` function was not wrapped in `useCallback`, causing recreation on every render
- **Added:** Enhanced logging at every stage of publication flow
- **Added:** useEffect to log page state on mount/uris change
- **Dependencies:** Properly configured dependency array with all used variables

### 2. feedApi.js

- **Enhanced:** `feedCreatePost()` with detailed logging
- **Enhanced:** `feedUploadMediaFromUri()` with detailed logging
- **Logs** show: media URLs count, visibility, upload progress, response status

## How to Debug

### Stage 1: Check Page Load

1. Open FeedPostMediaPicker to select photos
2. Select 1-2 photos
3. Open FeedPostComposerPage
4. Check console for log:

```
[FeedPostComposer] page loaded: {
  urisLength: <number>,
  userId: <id>,
  hasAccessToken: true/false,
  hasFeedToken: true/false,
  userEmail: <email>
}
```

**Expected:**

- `urisLength` > 0
- `userId` exists
- `hasAccessToken` = true
- `userEmail` exists

**If failed:** Publication will be blocked with early return

### Stage 2: Click Publish Button

1. Add optional caption
2. Tap "Опублікувати" / "Publish"
3. Check console for sequence:

```
[FeedPostComposer] publish started: { urisLen: <n> }
[FeedPostComposer] processing media uris: <n>
[FeedPostComposer] ready uris: <n>
[FeedPostComposer] local post created: <uuid>
[feedApi] feedUploadMediaFromUri: { uri: <substring>, backend: true/false }
[feedApi] media uploaded: { url: <substring> }
[feedApi] feedCreatePost called with: { mediaUrlsCount: <n>, visibility: "public" }
[feedApi] filtered media_urls: <n>
[feedApi] sending payload: { media_urls: "[1 urls]", ... }
[feedApi] backend response: { status: 'ok', hasPost: true, id: <id> }
[FeedPostComposer] post synced: <id>
```

### Stage 3: Common Failure Points

#### No URIs after media selection

**Log:** `[FeedPostComposer] publish blocked: { urisLen: 0, busy: false }`
**Fix:** Ensure photos are selected before navigating to composer

#### Missing authorization

**Log:** `[FeedPostComposer] page loaded: { hasAccessToken: false }`
**Fix:** User must be logged in. Check login flow in authStore.

#### No feed API token

**Log:** `[feedApi] using filesystem fallback (no backend session)`
**Fix:** Backend URL not accessible or JWT invalid. Check:

- Is `http://localhost:3000` (or EXPO_PUBLIC_KRAINA_API_URL) running?
- Is accessToken a valid JWT (3 parts separated by dots)?
- Does user.id exist?

#### Media upload fails

**Log:** `[feedApi] upload error: <message>`
**Causes:**

- File doesn't exist or can't be read
- Backend `/api/feed/upload` endpoint broken
- Network timeout

#### Post creation fails

**Log:** `[feedApi] backend response missing url`
**Causes:**

- Backend didn't return `{ post: {...} }` or `{ id, ... }`
- `/api/feed/posts` endpoint not responding
- Payload validation failed

### Stage 4: Enable Full Logging

In `__DEV__` check in each function, logging is automatically enabled when:

```javascript
if (__DEV__) console.log(...);
```

To force logging in production (if needed), modify:

```javascript
const DEV_MODE = __DEV__ || true; // Change false to true to force
```

## Key Functions Flow

```
publish() (useCallback)
  ↓
persistCapturedImage() - convert to local file
  ↓
prependUserFeedPost() - create optimistic UI
  ↓
feedUploadMediaFromUri() - upload to backend
  ↓
feedCreatePost() - POST /api/feed/posts
  ↓
emitFeedMediaUpdated() - broadcast update
  ↓
resetToHomeFeedTab() - navigate to feed
```

## Test Checklist

- [ ] App starts in dev mode
- [ ] User can log in (hasAccessToken = true)
- [ ] User can select photos from gallery
- [ ] FeedPostComposerPage loads with photos
- [ ] Console shows "page loaded" with correct uris count
- [ ] Clicking publish shows "processing media uris"
- [ ] Backend logs show POST /api/feed/posts request
- [ ] Post appears in feed after sync completes

## Backend Requirements

- `/api/feed/upload` - POST multipart form-data `file`
- `/api/feed/posts` - POST JSON with media_urls, content_text, visibility

Both endpoints require Bearer JWT auth header.

## Next Steps

1. Run the app in dev mode
2. Try to publish a photo
3. Share the full console output starting from "page loaded" through "post synced"
4. Identify which stage fails
5. Address specific failure point
