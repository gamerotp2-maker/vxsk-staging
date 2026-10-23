# VXSK V12.8.34 — Website Release Package

This ZIP is a **release candidate** for the existing VXSK website on GitHub Pages. The package is a snapshot of edited files, **not** a deployed or live-verified installation.

## Included changes

- **Custom incoming ringtone:** `assets/vxsk-incoming-ring-custom.mp3`. Incoming and outgoing tones are separate. The existing `RING ON / OFF` control, accept/decline/hang-up stop behavior and browser audio restrictions remain.
- **Website background music:** `assets/vxsk-background-music-v12834.mp3`, using the visitor's `MUSIC ON / OFF` control. Music defaults to OFF, loops, and needs a user gesture before playback.
- **Calls + group calls:** Frontend supports a secure optional TURN credential broker, attempts ICE recovery, and displays round-trip latency as `PING XX ms` where WebRTC stats are available (otherwise `PING — ms`). Code alone does not provide TURN servers.
- **Friends & Requests:** A single unique list of friends per view, guarded against repeated/overlapping refreshes. No backend role changes.
- **Homepage artwork:** Replaced the square-looking hero content with the new 16:9 VXSK announcement image at 1600×900, with proportion-preserving CSS and versioned URL. A 2026–2027 season tag remains visible.
- **Three videos:** Reset Doubletap, Pentakill Tris and ACE available directly on the website. Each `<video>` uses controls, posters and metadata preloading; no third-party video API keys.
- **Event posters:** V12.8.33 poster upload, preview and Arena Hub display are retained; match links can display Kick, YouTube and Discord with recognizable action labels.
- **Version badge:** V12.8.34 in homepage and Arena Hub.

## Deployment — current GitHub/Supabase project ONLY

Project ID: `opzqnmahfgehaewgciwg` — **the project linked to the current GitHub Pages website**.

**Do NOT run scripts on the old Netlify production project `ziaihifbmmrvngorarfb`.** The project uses a *publishable* browser key; never paste Supabase service-role or TURN provider secrets into website files.

1. Extract this ZIP locally. GitHub Desktop → select the `vxsk-staging` repository → **Repository → Show in Explorer**. Copy **the ZIP's contents** (`index.html`, `assets/`, `.nojekyll`, JS/CSS, etc.) into the repository root. Do **not** delete the `.git` folder or put the ZIP's parent directory inside the repository.
2. Commit as `VXSK V12.8.34 Official Release Candidate`, click **Push origin**. Verify GitHub Actions/Pages deployment succeeds.
3. Open your GitHub Pages URL. Hard refresh (`Ctrl+Shift+R` on Windows) and check the `V12.8.34` badge.
4. Check the new homepage 16:9 image on desktop/mobile, season tag not clipped, music toggle and ringtone. Open the Videos section and play all three clips individually; videos should not autoplay by default.
5. With two consenting test accounts, verify Friends list has one copy of each user after repeated Refresh, avatars where available, accept/reject, DM and audio/video. Verify event posters and URLs from Staff Command / Arena Hub still work.

### IMPORTANT: activating TURN for worldwide calling is separate

Files included:
- `VXSK-V12.8.34-WEBRTC-TURN.sql` — database authorization/rate limits.
- `supabase/functions/vxsk-turn-credentials/index.ts` — Supabase Edge Function source for Twilio Network Traversal Service.
- `VXSK-V12.8.34-WORLDWIDE-CALLS-SETUP.md` — detailed administrator-only setup and tests.

**If you do not configure TURN, the calls will fall back to STUN-only and users on restrictive international/mobile networks can still fail to connect.** There is no magic frontend fix for that. Never claim worldwide calls passed until an actual relay provider is configured and Tunisia↔Europe/US connections are tested.

TURN activation for the administrator:

1. Open the correct Supabase project's SQL Editor, run **only** `VXSK-V12.8.34-WEBRTC-TURN.sql` for this version; older migrations were installed with prior releases. This creates authorization and rate limit logic; it does not alter existing staff assignments or users.
2. Deploy `supabase/functions/vxsk-turn-credentials/index.ts` as a Supabase Edge Function named `vxsk-turn-credentials` with JWT verification left ON.
3. Set `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` in Supabase **Edge Function Secrets** using your own paid/provider account as applicable; never put these secrets in GitHub, screenshots or chat. Provider access and possible costs must be handled by the account's authorized administrator.
4. Run real international test calls with two accounts and a restrictive Wi-Fi/cellular network. Check audio, camera, screen share, media connection path, reconnect, group call and the ms indicator. Actual RTT numbers vary by location and route; `— ms` can be a browser telemetry limitation.

## Status / release gates

| Feature | Current status |
| --- | --- |
| Source JS syntax + file references | Checked locally during packaging |
| New hero artwork 16:9 and media file formats | Checked locally during packaging |
| Music/ringtone code updates | Included; live browser audio test pending |
| Friends duplicate list regression test | Previously passed simulated Chromium run; post-deploy real-account verification pending |
| Event posters and arena links | Previously user-verified in earlier release; v34 regression test pending |
| Live cross-region TURN calls | **NOT VERIFIED — activation required** |
| Reviewer/Owner role restrictions | Independent live security regression test remains pending |

## Copyright / privacy

Only publish audio, gameplay recordings, logos and people’s photos if you have the rights and necessary permissions. Public artwork/music distribution by GitHub Pages may be a separate right from personal use. Do not share admin credentials or private user information during testing.

**Version:** V12.8.34 · Release candidate · Target: GitHub Pages + Supabase `opzqnmahfgehaewgciwg`.
