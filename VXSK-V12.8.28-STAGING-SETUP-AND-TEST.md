# VXSK V12.8.28 — Friends, Avatars and Independent Camera (STAGING)

## Changes
- Fixes **private camera self-preview hidden by remote CAMERA OFF overlay**: your own camera is now a separate high-layer picture-in-picture tile, visible whenever you enable it even when the other user has no camera.
- Group calls keep a local camera tile, independent of other members; video is mirrored locally only.
- Organizes **Friends & Requests** on desktop and mobile into Incoming requests, Friends and Sent requests. Avatar errors no longer block buttons (V12.8.27 fix retained).
- Adds avatar chips to group member lists and group invite picker, with signed-in group call avatars already supported.
- Adds authenticated-only avatar lookup and signed-URL storage permission for all verified VXSK accounts (players, staff and owner); blocked users cannot access each other's avatars.

## Required staging migration
1. Confirm you are in **VXSK-STAGING** (not production). Make a database backup/snapshot first.
2. Supabase → SQL Editor → New query → paste `VXSK-V12.8.28-STAGING-AVATARS.sql` → Run, confirm Success.
3. This changes avatar visibility for signed-in accounts. Avatars are **not public to logged-out visitors**. If an account has not uploaded a photo, an initial is shown.

## GitHub Pages staging deploy
1. Extract ZIP, open GitHub Desktop → Repository → Show in Explorer.
2. Copy **contents** of ZIP into repo root, replacing files; keep `.git` untouched.
3. Commit → Push origin → Actions → confirm green.
4. Refresh or private browsing to avoid service-worker cache; check label `STAGING · V12.8.28`.

## Must-pass real browser checks
- Two accounts on desktop: request received → Accept / Reject both render and work; avatar appears and messages remain available.
- Search player avatar, Friends list, group picker, group members, private call and group call avatars. Test a player, a reviewer and the owner. Confirm blocks still prevent avatar viewing.
- **Private video:** A camera ON, B camera OFF/unavailable → A still sees A's own small framed video immediately. B camera can remain off. Reverse A/B.
- **Private audio → camera ON:** toggle camera and see your own small framed preview; microphone keeps working.
- **Group:** A camera ON, B/C/D camera OFF → A sees their own tile; no one gets forced to enable a camera. Toggle mic and check indicators.
- **Screen sharing:** share A→B and B→A plus group, check actual moving frames and tab audio on supported browsers.

## Release gate
This is a **STAGING candidate, not verified production-ready**. Need end-to-end accounts and network/cross-device tests (including TURN where necessary) before official launch. No production deployment done here.

## Private-call control indicator
- In the private call, **YOUR MICROPHONE IS MUTED** appears when the local microphone is muted. Unmuting removes it.
- Enabling camera displays the **YOU · CAMERA ON** picture-in-picture independent of remote camera availability; disabling camera hides the picture-in-picture.
