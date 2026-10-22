# VXSK V12.8.31 — Staff Manager error diagnosis (STAGING only)

## What this release changes
* Preserves V12.8.30 desktop header, V12.8.29 owner-only manager, and previous player/call fixes.
* Removes misleading generic “Install SQL” messages when a call fails.
* Shows real error code/function/message from the actual authenticated Supabase RPC.
* Loads Current Team and Recent Changes independently: one failed call cannot blank the other.
* Shows the current public Supabase project reference when the team loads.
* Fixes the visible staging label; it previously still said V12.8.29 in the V12.8.30 build.
* Bumps page script and service worker cache versions.

## Installation
1. Do NOT rerun any SQL. All four functions already exist with EXECUTE permissions according to your Supabase diagnostic.
2. Extract full ZIP and replace contents of GitHub STAGING repository; preserve `.git` folder.
3. Commit, Push origin, check GitHub Actions, hard-refresh VXSK STAGING.
4. Sign in Owner and verify 2FA, then Staff Command → TEAM & ROLES → REFRESH TEAM.
5. If team loads, verify existing reviewers. If red error remains, send **only the RPC function name, code and message** shown on screen (never auth tokens, email addresses, or service keys).

## How to understand errors
* **PGRST202 / 42883**: API cannot see that RPC in its current schema. Check the browser project's reference with the Supabase SQL Editor project; `NOTIFY pgrst, 'reload schema';` in that **same** project can refresh schema. Avoid rerunning DDL blindly.
* **42501**: Authenticated Owner role/MFA access check failed. Refresh user session and finish 2FA; frontend role detection does not override backend checks.
* **Other**: The exact error message is needed to determine the SQL fix; “four functions exist” alone cannot show whether they run successfully.

## Safety
No new SQL in V12.8.31. Roles and owner-only permissions unchanged. No production deployment until grant/revoke tests with Owner + 2FA succeed.
