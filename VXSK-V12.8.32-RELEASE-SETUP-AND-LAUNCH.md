# VXSK V12.8.32 — Official Release Candidate (GitHub Pages + Supabase)

## Exact target — read before making changes

- **KEEP:** current GitHub Pages repository, existing users/friends/calls/roles.
- **CURRENT database / launch database:** `opzqnmahfgehaewgciwg` — `https://opzqnmahfgehaewgciwg.supabase.co`.
- **DO NOT MODIFY:** former Netlify/Production Supabase project `ziaihifbmmrvngorarfb`.
- Netlify old website is disabled. Do not delete old Supabase project until you deliberately decide what to do with its data.
- **V12.9 AI Assistant:** planned separately, not part of this release.

## Changes in this ZIP

1. Public header shows **V12.8.32** (no visible STAGING badge), with updated Arena Hub version and PWA cache.
2. Friend-list avatar recovery: signed-in accounts can resolve permitted photos from `vxsk_social_avatar_lookup` when the friendship response omits a path. Adds a missing private-bucket read policy if absent. Friends, DMs, group lists and calls retain initial-letter fallback for missing/private photos. This does not turn on sharing for users who disabled it.
3. Owner/authorized editor Staff Command → **MANAGE SHOWMATCHES** → Announcement or Showmatch: choose PNG/JPEG/WebP poster, see preview, remove/replace, then save. Editing pre-existing posts preserves a previously selected cover unless it is changed or removed.
4. Owner/authorized editor Staff Command → **MANAGE TOURNAMENTS**: optional image for a new tournament calendar event or bracket fixture.
5. **Arena Hub** shows tournament/fixture covers and a section for publicly published announcements/showmatches, with gradients when no cover has been chosen. Main website Match Center shows poster images too.
6. Poster image processing uses 16:9 crop, up to 1440 pixels wide, converted to WebP. Input file max 3 MB, output max 2 MB. Real content is stored in a dedicated **public event-poster bucket**, not the private avatar bucket.
7. Covers are writable only by authenticated, 2FA-verified accounts permitted by the existing `can_edit_match_center()` server function. The site never exposes a service-role key.

## One-time Supabase setup — before deploying this ZIP

1. In your browser, open **Supabase Dashboard**, choose project with EXACT ID `opzqnmahfgehaewgciwg` (not `ziaihifbmmrvngorarfb`).
2. Go to **Storage → Create bucket**; configure:
   - **Name:** `vxsk-event-covers`
   - **Public bucket:** YES (these are intentionally public event posters; the separate `vxsk-avatars` bucket remains PRIVATE)
   - **File size limit:** 2 MB
   - **Allowed MIME type:** `image/webp` only
   - Save bucket. Existing buckets/storage contents stay unchanged.
3. In **SQL Editor → New query**, open and review **`VXSK-V12.8.32-STAGING-COVERS-AND-AVATARS.sql`** from this ZIP. Verify the project ID again, and execute it once.
4. SQL adds nullable `cover_path` to `match_center_posts`, `vxsk_hub_events` and `vxsk_hub_matches`, grants column-level permissions subject to existing RLS, and creates Storage RLS policies on the new bucket. Also adds `prize` column if missing, and ensures the existing private avatar read policy exists. **No accounts, friends, messages or staff roles are deleted.**
5. Optional verification (read only):

```sql
SELECT id, public, file_size_limit FROM storage.buckets
WHERE id IN ('vxsk-event-covers','vxsk-avatars');
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema='public' AND column_name IN ('cover_path','prize')
AND table_name IN ('match_center_posts','vxsk_hub_events','vxsk_hub_matches')
ORDER BY table_name,column_name;
```

## Deploy the code

1. Extract the full **V12.8.32 website ZIP**.
2. GitHub Desktop → Repository → **Show in Explorer**; copy extracted contents into the root of existing GitHub Pages repo; replace website files but **do not delete `.git`**.
3. Commit changes → Push origin → verify GitHub Actions / Pages deployment green.
4. Hard-refresh both desktop and mobile. Look for badge **V12.8.32** (not STAGING).

## Release smoke test (real browser + real accounts required)

- [ ] Homepage shows `V12.8.32` and normal navigation at desktop 100%, 75% zoom and mobile.
- [ ] Two authenticated users with permitted uploaded avatars: friend list, friend requests, group members, private/group calls show image; unuploaded/hidden photos use initials and do not hide buttons.
- [ ] **Staff, 2FA:** Showmatch and announcement image preview; save draft, publish, edit existing picture, remove image; check actual public Match Center and Arena Hub.
- [ ] **Tournament editor, 2FA:** Create private tournament event with poster, then publish one sample event. Check Arena Hub poster; create bracket match with poster. Keep test/sample posts as private drafts or remove them after test.
- [ ] **Player/anonymous account:** Can view public posters but **cannot upload/change/delete** Storage covers. A non-owner cannot grant/revoke staff roles. Unverified reviewer security test from V12.8.31 still needs an independent negative test.
- [ ] Camera self-preview/mutes/calls/screenshare: retest with two real accounts on separate networks, as browser-only tests cannot prove remote transmission.
- [ ] Authentication login, signup, email confirmation, password reset links, configured site URLs, redirect URLs and domain work for the official GitHub URL.
- [ ] Browser console/network tab has no 403/PGRST errors for social avatar lookup, cover metadata or Storage upload.

## Important notes

- **This is a release candidate, not a verified live deployment.** No live Supabase operations/deployment were performed by ChatGPT.
- A previous full-browser local smoke test was blocked by environment-level URL navigation restrictions. Isolated image utility tests passed; simulated authorized content-editor announcement upload and cover_path save passed; JS syntax and static asset checks passed. Tournament creation, network upload, and cross-account visibility still need real STAGING tests.
- RLS and genuine multi-account tests are still required before calling the website officially launched. The old production database is not transferred or deleted.
- Do not put uploaded images containing private contact information into the public event poster bucket. Staff should upload only images they have permission to use.
- If SQL fails, stop and report the exact error; do not rerun previous migrations blindly. If a deploy breaks, revert the GitHub commit (database columns are backward-compatible, so you do not need to delete them).
