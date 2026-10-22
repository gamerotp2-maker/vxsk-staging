# VXSK V12.8.27 — Mobile Friend Request Repair (STAGING)

Built from VXSK V12.8.26. No Supabase SQL changes required for this update.

## Why requests disappeared on phones
`community.js` rendered the "REQUESTS (1)" heading, then called an **undefined `addAvatar` function** while trying to create a request card with an avatar. Rendering stopped before the user card and ACCEPT/REJECT buttons could appear. This also affected desktop for requests involving an avatar.

## Fixes
- Restored a safe signed-URL avatar loader for the private `vxsk-avatars` bucket.
- Kept initial-letter fallback when photo is missing, forbidden, slow, or cannot load.
- Ensured avatar loading cannot prevent request cards / ACCEPT / REJECT from rendering.
- Made the mobile Friends & Requests list scroll independently and enlarged its touch targets.
- Updated version label, CSS/JS cache query strings, and service-worker cache version to V12.8.27.
- Added success/updated-request feedback for Accept and Reject.

## Install in VXSK-STAGING
1. Back up / keep your current V12.8.26 ZIP and repository history.
2. Extract `VXSK-V12.8.27-MOBILE-FRIEND-REQUESTS-STAGING.zip`.
3. In GitHub Desktop: **Repository → Show in Explorer**.
4. Copy the **contents** of the extracted ZIP into the repository root (alongside `index.html`) and replace existing files. Do not replace the `.git` folder.
5. GitHub Desktop → **Changes → Commit to main → Push origin**.
6. GitHub → **Actions**: wait for green `pages build and deployment`.
7. Open your STAGING website on iPhone and Android. Force refresh/reopen the tab. Confirm you see `STAGING · V12.8.27`.

## Real-account verification (required before official launch)
1. User A (on PC) sends a friend request to User B (on mobile) whose profile has an uploaded avatar.
2. On User B's phone, tap the Friends icon: verify the nickname/avatar and both **ACCEPT** and **REJECT** are visible and tappable.
3. Accept the request. Verify User A appears under friends on both devices.
4. Send a second request from another test account, then REJECT and verify it disappears.
5. Repeat with a user without avatar. Verify initials appear and the request is still actionable.
6. Verify the red notification badge decreases appropriately.
7. Smoke-test the prior V12.8.26 audio/video/screen-share fixes separately; this patch does not validate them.

## Validation already performed
- JavaScript syntax checks passed for all top-level JS files.
- Offline Chromium mobile UI tests passed at 320px, 390px, and 768px; verified action display and RPC-driven Accept and Reject flows, with avatar, without avatar, and with avatar-signing failure.
- These were mocked backend/browser tests, **not** a real mobile + live Supabase test.

**Status:** STAGING candidate. Don't declare production launch ready without real two-user test and the A-to-Z release checklist.
