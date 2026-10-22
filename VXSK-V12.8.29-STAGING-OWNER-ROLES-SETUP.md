# VXSK V12.8.29 — Owner Staff Manager (STAGING)

## What it adds

In VXSK **Staff Command**, the verified Owner sees **👑 TEAM & ROLES**. Under My Account, only the Owner sees **👑 MANAGE STAFF ROLES**. The manager lets the Owner search verified VXSK nicknames, grant **Reviewer** (approve/reject applications), grant **Staff** (limited viewing/notes), or **Remove Role**, without writing new SQL for each person.

Staff / Reviewer users never see this section. Server-side Supabase `SECURITY DEFINER` RPCs independently enforce both `staff_roles.role = 'owner'` and 2FA `aal2`. Client code is not the security boundary. The Owner role itself cannot be granted or removed from the manager. Each actual manager role change is logged in `vxsk_staff_role_audit`; only the Owner can view its history via an RPC. No emails/passwords/private contacts are shown in search.

**Current staff roles remain unchanged** after migration. The previous five accounts do **not** need to be re-assigned.

## Install (run only in your separate Supabase STAGING project)

1. Save a backup/snapshot of the STAGING database.
2. Open Supabase **STAGING** → SQL Editor → New query.
3. Copy and run **`VXSK-V12.8.29-STAGING-OWNER-STAFF-MANAGER.sql`**. A success with no rows means the migration statements ran, not that role management has been tested end-to-end.
4. Extract **`VXSK-V12.8.29-OWNER-STAFF-MANAGER-STAGING.zip`**. Copy the files inside into the root of the `vxsk-staging` GitHub Desktop repository (keep `.git`). Commit → Push origin. Wait until GitHub Actions deployment succeeds.
5. In the browser, do a hard refresh (Ctrl+Shift+R on desktop). Confirm the home page says **STAGING · V12.8.29**.

## Use the manager from now on (no repeat SQL)

1. Sign in with the existing **Owner** account and finish **2FA**.
2. Open **My Account → 👑 MANAGE STAFF ROLES**, or **STAFF COMMAND → 👑 TEAM & ROLES**.
3. Enter an account's exact VXSK nickname (uppercase/lowercase does not matter), click **SEARCH**, and select the correct result. Partial search works too.
4. Choose **REVIEWER · APPROVE / REJECT** and click **SAVE ROLE**. Confirm the prompt. For limited access choose **STAFF · VIEW / NOTES**; to revoke choose **PLAYER · NO ROLE**.
5. Ask the recipient to refresh/relogin, complete their own 2FA, and open **Staff Command**.

The Staff Manager cannot grant or remove the Owner role. It cannot edit passwords, emails, or 2FA factors. For access problems, verify account email confirmation, role, and MFA. A new role may require refresh/relogin.

## Must-pass staging tests before production

- Owner can see the tab and search a verified test account, grant Reviewer, and then remove it; changes appear in **Current Team** and **Recent Changes**.
- A Reviewer and a normal player must not see the owner tab; trying to call `vxsk_owner_staff_set` directly without Owner + AAL2 must be denied by Supabase.
- Trying to edit the Owner role must always fail.
- Unverified accounts and invalid role names must be rejected.
- Existing shark, Dyfe, medo, ayoub and DraGoN roles must remain unchanged after running the migration.
- Repeat on desktop + phone.

The local browser test validated navigation, responsive layout, search/save RPC wiring, owner UI protection, and a mock Reviewer view. It **did not** run the SQL against your live Supabase project. Do not deploy to production until the above live permission tests pass.
