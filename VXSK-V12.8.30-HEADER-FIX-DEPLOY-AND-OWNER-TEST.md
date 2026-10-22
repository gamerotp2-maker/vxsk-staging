# VXSK V12.8.30 — Header Fix + Staff Manager Test (STAGING)

## Fixed
The top desktop navigation overlapped at browser zoom levels / wide CSS viewports. The former two-row header rule ended at `1999px`, so wider effective viewports displayed all links, buttons, player search and Owner/Staff controls in one row. V12.8.30 extends the two-row rule to all desktop widths from `1360px` upward, while preserving the existing mobile and laptop hamburger navigation. It updates the CSS cache-busting query, the visible staging version and the service-worker public asset cache version.

This package is based on **V12.8.29** and includes the existing **Owner Staff Manager**. No changes to permissions, roles, database structure, camera, friends or calls. The bundled V12.8.29 setup SQL is the *corrected* copy, but **do not rerun it if you already received `Success. No rows returned`.**

## Install (GitHub staging only)
1. Download and extract `VXSK-V12.8.30-DESKTOP-HEADER-OWNER-STAGING.zip`.
2. In GitHub Desktop, choose your **staging** repository > **Repository > Show in Explorer**.
3. Copy the *contents* of the extracted ZIP into the repository root. Replace same-named files. **Keep `.git`**.
4. Commit and **Push origin**. In GitHub Actions, verify the Pages deployment succeeded.
5. Open the staging URL on desktop, do a hard refresh (Ctrl+Shift+R) and verify `STAGING · V12.8.30` appears.
6. Check the logo/header at browser zoom **100%, 80%, and 75%**, both logged out and logged in as Owner. The section links should have a separate row instead of overlapping the search or logo.

## Owner Staff Manager — live test
1. Sign in with the genuine **Owner** VXSK account and finish required **2FA**.
2. Open **My Account > Manage Staff Roles**, or **Staff Command > TEAM & ROLES**.
3. Confirm existing reviewers `shark`, `Dyfe`, `medo`, `ayoub`, and `DraGoN` appear in current team.
4. Pick a trusted test player with a *verified* VXSK account who is not already a reviewer. Search the **exact nickname**, confirm the correct result, and assign `reviewer`.
5. Have that player log out/in and verify they can access Staff Command / review applications but **cannot** manage roles or use Owner-only actions.
6. Remove `reviewer` from the same test account using the Owner interface; verify the user loses Staff access after a new session. Do **not** remove roles from your real event staff during this test.
7. For an additional security check, while signed in as a Reviewer, attempt to visit `staff.html#team`. The TEAM & ROLES tab should be unavailable. Backend Supabase authorization — not the UI — must reject any non-Owner role-change RPC.

## Release gate
V12.8.30 is a **STAGING** candidate. Owner role-management grants/revokes must be tested live. Do not promote to production based on visual tests alone.

No new SQL needed for V12.8.30 (assuming the corrected V12.8.29 SQL was already installed).
