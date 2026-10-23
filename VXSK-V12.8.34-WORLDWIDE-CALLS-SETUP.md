# VXSK V12.8.34 — Worldwide Call Reliability and Ping

Status: CODE PREPARED IN THE WORKING PROJECT. **Do not mark worldwide calls as working before TURN credentials are configured and live cross-region calls pass.** This source is included in the V12.8.34 release candidate ZIP; TURN installation is still pending.

## Why Tunisia ↔ other countries can reconnect

GitHub Pages serves website code, but it does not relay WebRTC audio/video. Direct peer-to-peer calls use STUN to find a route; some routers/mobile networks/carrier-grade NAT/firewalls block that route. A **TURN relay** is necessary for those paths. TURN improves availability; it cannot guarantee every country/network, and mobile OS/webview/browser media restrictions still apply.

## Changes already in this working build

- Removed the hardcoded `freeStunOnly` path in friend calls.
- New shared `vxsk-call-network.js` fetches short-lived authorized ICE/TURN credentials with a 6-second timeout, falls back to STUN if service not configured.
- Both friend and group calls use the same TURN helper; group peer connections are initialized with obtained ICE servers.
- Friend and group calls have bounded ICE restart/recovery when a connection is lost.
- Friend call and group call headers show **PING ... ms** for real WebRTC ICE candidate-pair round-trip time. Group display averages connected peer RTTs; `— ms` is shown while not measurable.
- Network checks don't display IP addresses in UI.
- `supabase/functions/vxsk-turn-credentials/index.ts` creates ephemeral Twilio Network Traversal Service tokens after authenticating user and checking authorized active call.
- `VXSK-V12.8.34-WEBRTC-TURN.sql` creates private rate-limit tracking and a scoped `vxsk_turn_authorize` function. Owners/staff roles and friendships are unchanged.

## Turn on a real relay (administrator-managed)

1. Select a TURN relay provider; this build includes a **Twilio NTS** Edge Function integration. A service account and possible usage charges are required. A trusted account owner/adult should handle payments/contract obligations when applicable.
2. In Supabase project **`opzqnmahfgehaewgciwg` ONLY**, run `VXSK-V12.8.34-WEBRTC-TURN.sql`. DO NOT execute in old Netlify project or other database.
3. Create an Edge Function named `vxsk-turn-credentials` with code from `supabase/functions/vxsk-turn-credentials/index.ts`. Deploy using the Supabase CLI (or Dashboard if appropriate). Keep normal JWT verification enabled.
4. Add two secrets in Supabase **Edge Function Secrets**, not in website JavaScript: `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`. The Edge Function receives `SUPABASE_URL` and `SUPABASE_ANON_KEY` as environment variables in normal Supabase deployments. Never share service credentials in chat or GitHub.
5. Deploy the **V12.8.34** website code to GitHub Pages after reviewing the release checklist.
6. Test two distinct accounts across Tunisia ↔ Europe or US, with Wi-Fi/cellular scenarios (consensual audio, video, camera-off, screen share) and inspect **CHECK CONNECTION**: `TURN configured: yes`, connection state `connected`, path `relay` on a restrictive route, and a numerical PING. Repeat with a 3-person group and confirm per-peer media. `TURN configured: yes` only shows credentials are loaded; a relay candidate needs to be actually selected on blocked paths.

## Expected browser behavior

- PING shows `— ms` until WebRTC selects a working candidate pair with available RTT telemetry. On Safari/older mobile browsers, candidate-pair RTT stats may not be exposed; an em dash is not itself a media failure.
- Camera/mic permissions are device-specific; group call should continue audio when another participant has no camera.
- TURN credentials are short-lived. The relay provider may charge based on relay use and can impose quotas.
- If Edge Function isn't configured, calls **still try STUN**, but global reliability remains unverified and restrictive cross-country calls may fail.

## Verified locally

- `node --check` passed for edited JavaScript modules.
- Isolated browser-like JS test verifies authenticated ICE object validation/fallback, relay detection, and sample RTT conversion (0.183s → 183ms).
- HTML checks verify one friend-call ping badge, one group-call ping badge, and dependency script order.

## Not yet verified

- Live Supabase database migration, Edge Function deployment, Twilio token issuance and TURN provider connectivity.
- Tunisia ↔ Europe ↔ America real multi-network WebRTC calls; actual delays depend on routes and services.
