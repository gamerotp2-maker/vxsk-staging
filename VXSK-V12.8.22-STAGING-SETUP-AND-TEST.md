# VXSK V12.8.22 — STAGING setup + test checklist

**Base archive:** `VXSK-V12.8.21-UNIFIED-STAFF-STAGING-READY.zip` (latest Library ZIP on 22 October 2026). This archive is a new *staging build*, not a change to the live VXSK website.

**Never apply to official/production database.** Use only VXSK-STAGING Supabase project `opzqnmahfgehaewgciwg` and the existing staging GitHub Pages site. Back up staging before changes. No secrets/service-role key should be committed. The project is $0/free STUN-only signaling, not a TURN-managed service.

## Safe upgrade order

1. Back up the staging Supabase database and the staging GitHub Pages repository. **Do not use production.** Check you are in the correct Supabase project.
2. Confirm old staging migrations exist: V12.8.7 Social, V12.8.8 Avatars/Presence, V12.8.11 Friend Calls, V12.8.14 Group Chat, V12.8.18 Arena Hub, and the 12.8.21 staff setup. **Do not blindly rerun historical migrations** that might create duplicate policies.
3. Review and run **`VXSK-V12.8.22-STAGING-APPLY-ONLY.sql`** in the **staging** Supabase SQL Editor. It uses a transaction, adds showmatch challenges, makes confirmed user profiles searchable with avatars, adds an owner-only player picker, tournament prize text, and protected group call signaling. It does not modify `staff_roles` and does not relax owner-only write controls. It adds a trigger on `auth.users` to sync verified account nicknames; review auth triggers carefully before running.
4. Confirm the SQL has succeeded before shipping the new static files: new frontend calls several new RPCs and the tournament event query selects `prize`.
5. Upload/commit the archive contents into the existing **staging** GitHub Pages repository root, preserving `.nojekyll` and `assets/`. Do not upload to the official live repository. GitHub Pages must serve the site over HTTPS for microphone, camera and screen-capture APIs.
6. Refresh with a clean browser profile or hard-reload so that the service worker activates `vxsk-public-v12.8.22`. Do not clear Supabase data; browser cache alone is sufficient.
7. Test with at least **two separate verified player accounts** and the existing MFA-protected staff identities. **No accounts/roles are created by this upgrade.** Shark, Dyfe, Dragon, Medo staff-role assignment stays a separate owner-side step if pending. Ayoub remains public referee only and is NOT granted reviewer privileges.

## What changed

### Players / Social
- Every email-confirmed VXSK account gets an automatically discoverable nickname. Existing social profiles are backfilled; account nicknames update automatically on subsequent account metadata changes. No Enable Discovery option, no second community nickname form.
- Every unblocked signed-in player can search other confirmed players by nickname, see their available avatar, click **ADD FRIEND**, and send one request. Recipient sees it in **Friends & Requests** and can ACCEPT/REJECT.
- The only visibility toggle left is **Appear Online to accepted friends**. Offline players remain searchable. Blocking users still hides them from each other and prevents requests.
- Accepted friends can exchange messages/calls and send consensual **CHALLENGE** invitations in Rocket League, VALORANT or League of Legends. The opponent must ACCEPT; only then does the staff challenge queue show it.

### Staff Command
- **Manage Showmatches**: applications remain in Applications, accepted player-selected challenges appear in a private queue, editors can prefill a *new private draft*, choose player/team names, schedule, add stream and YouTube replay. Read-only queue for MFA reviewers; posting remains governed by `can_edit_match_center()` and RLS. Staff marks scheduled/completed only after confirming details.
- **Manage Tournaments**: create date + **Prize**, participants (owner-controlled nickname dropdown; no UUID paste), brackets, ready-check counts, referee results and owner-only champion awards. Prize is informative text, not a payment integration.
- Owner-only actions remain owner-only. No fake staff privileges are assigned.

### Private calls and group calls
- In a **1-to-1** call, FULLSCREEN enlarges the actual video/screen share container rather than the whole call panel. **EXIT FULLSCREEN** is visible on the shared image. A viewport-height theater fallback is provided for browsers that do not offer element fullscreen.
- A separate reserved WebRTC audio track carries *optional* consented shared tab/system audio without replacing microphone audio. Recipients can click **PLAY FRIEND SOUND** if playback is browser-blocked.
- The group chat now offers explicitly joined 2–4-person **GROUP AUDIO** / **GROUP VIDEO** calls with speaker/audio elements, optional screen share, independent full-size shared-screen focus, mute, minimize and leave. Groups remain invitation-only; group call joining and signaling are backend-verified. Calls are not recorded. Group calls are **BETA**, and require real multi-device tests before public launch.
- Screen sharing *from* many phone browsers is unavailable because they do not implement `getDisplayMedia`; those phones may still watch fullscreen received shares. System/tab sound can be captured only where the browser/OS offers and the sharer selects a sound-enabled capture source (usually Chrome/Edge “Share tab audio”). No website code can force unsupported audio capture.
- STUN alone cannot guarantee call connection behind strict NAT/firewalls, and 4-way group mesh may perform poorly on slow devices/connections. There is no TURN server in this package; no paid services were introduced.

## Smoke tests (perform after staging SQL + deployment)

1. **Account search:** Create or sign into two distinct confirmed accounts with different nicknames. Neither chooses a discovery setting. Search 2+ nickname characters from Account A, verify Account B and avatar appear. Click **ADD FRIEND** once. Verify request appears on B and acceptance changes both friend lists. B appears when set Offline. Verify A/B blocking suppresses search.
2. **Showmatch choice:** Accept friendship. A clicks CHALLENGE, chooses a valid game/mode. B sees pending invitation, accepts. Reviewer with MFA can see challenge in **Manage Showmatches**; editor can prefill a new draft **without overwriting** an existing edit. Owner/editor schedules and publishes, adds supported HTTPS stream, and later adds a YouTube replay. Verify public Match Center links work.
3. **Tournament operations:** MFA owner opens **Manage Tournaments**, creates event + prize, sees prize in public Arena Hub if published, creates bracket, chooses player *by nickname*, assigns team A/B, asks participant to Ready Check in My Arena, checks readiness count, referee proposes result, owner approves and awards champion badge. Reviewer cannot award badges or approve results.
4. **Private call fullscreen:** From A call B and accept, enable sharing from desktop. On B PC and phone, press FULLSCREEN, verify **the shared screen** (not surrounding call controls) occupies viewport and EXIT works. Test silent mic + shared-tab sound playback separately; browser must grant share-audio permission.
5. **Group call:** Have 2–4 accepted group members join AUDIO/VIDEO through one group. Test group camera/mic, group screen share, fullscreen received share, extra audio playback gesture and leave. Fifth participant should receive full-room refusal. Verify uninvited or blocked accounts cannot join. Switch networks and test that STUN-only calls may not connect across certain NATs.
6. **Cache/permission regression:** Test on desktop Chrome/Edge and at least one mobile browser. Confirm no private data leaks from social search, existing registration, profile, avatars, chats, and owner-only permissions still work.

## Technical constraints / known limitations

- The package passed **static JavaScript syntax**, **file-reference**, and **HTML duplicate-ID** checks. No staging Supabase RPCs, real browser audio/capture, actual multi-user connection, or live GitHub deployment could be exercised here. **Do not treat it as production validated until smoke tests pass.**
- An AI assistant was deliberately not added: discoverable profiles, one-click friend requests and clearly separated workflows were chosen to keep the UI simple and avoid a misleading chatbot. A future contextual guide could be added without changing permissions.
- There is **no automated bracket generator**, prize payout, match recording, or guaranteed smartphone screen capture. The workflow organizes existing manual bracket/ready-check/result tools and adds clearer controls.
- Existing staff roles are not changed. The application review logic does not automatically assign teams from pending applications. The new showmatch path is **player selects accepted friend → opponent agrees → staff builds/schedules event**.
