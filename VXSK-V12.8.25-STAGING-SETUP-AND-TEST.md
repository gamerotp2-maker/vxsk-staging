# VXSK V12.8.25 — Social Alerts + Avatar Visibility (STAGING)

## What this update adds
- Friend-request **ding** alert in the website UI.
- DM **ding** alert in the website UI.
- Red badge on the small Friends icon for pending requests + unread DMs.
- Better category / friends icon styling.
- Avatars shown more consistently across the social UI for signed-in VXSK accounts.

## Files
- Deploy website ZIP: `VXSK-V12.8.25-SOCIAL-ALERTS-AVATARS-STAGING.zip`
- Run SQL once in **VXSK-STAGING**: `VXSK-V12.8.25-STAGING-SOCIAL-ALERTS.sql`

## Install order
1. Open **Supabase → SQL Editor** in **VXSK-STAGING**.
2. Run `VXSK-V12.8.25-STAGING-SOCIAL-ALERTS.sql`.
3. Replace the GitHub staging repository files with the V12.8.25 website files.
4. Commit + Push.
5. Wait for GitHub Pages deployment to finish.

## Test checklist
1. Sign in with User A and User B.
2. From User A, send a friend request to User B.
3. On User B, confirm:
   - red badge appears on the small Friends icon,
   - a ding sound plays after interaction permission,
   - request is visible in Friends & Requests.
4. Accept the request.
5. Send a DM from User A to User B.
6. On User B, confirm:
   - red badge updates,
   - ding sound plays,
   - opening the DM clears unread count.
7. Confirm avatars appear in search results, friends lists and call/group member UI for signed-in accounts.

## Notes
- The ding sound requires at least one user interaction in the browser tab (normal browser media policy).
- The badge combines **pending requests + unread DMs**.
- This is a **STAGING** build and should be validated before production.
