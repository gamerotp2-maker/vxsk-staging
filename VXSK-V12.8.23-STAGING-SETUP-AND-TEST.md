# VXSK V12.8.23 — Calls, camera, avatar and 4-screen-share STAGING update

**STAGING ONLY — not deployed and not validated on the real VXSK Supabase project.**

Based on the latest available VXSK V12.8.22 ZIP. This update keeps all arena, showmatch, tournament, and social features from V12.8.22. It changes call UI and WebRTC track routing, and includes one incremental STAGING migration.

## What is changed

- **Private video:** camera acquisition now falls back to a working microphone call if the camera is unavailable or denied, rather than hanging up. Initial offers/answers send promptly and ICE candidates trickle; no 10-second ICE gathering delay before sending SDP. On-camera video and screen video are **separate transceivers**.
- **Private audio:** while in an audio-only call, either user can press **CAMERA ON** (permission requested only then), then turn it off without ending the call. Microphone mute stays independent. An independent **MUTE FRIEND** button silences the remote microphone locally.
- **Share direction:** every peer negotiates microphone audio, camera video, shared-screen video and shared-screen audio as four distinct tracks. Starting screen share no longer replaces or interrupts the camera sender. Each side can share its own screen at the same time, with separate playback mute controls.
- **Group video/audio:** up to four active members, each sharing **one** screen at a time (up to **four concurrent shares**). Responsive 1/2/4 split grid, per-share mute audio and per-member mute microphone, hover/tap controls and fullscreen per-screen / fullscreen entire grid. Camera can be switched on/off even inside an audio group call.
- **Avatars:** fallback nickname initials remain visible. Accepted friends use private Supabase signed avatar URLs. Applying the optional V12.8.23 SQL adds an authorized avatar path to group roster for visible group member pictures.
- **Safer groups:** optional SQL disallows a second active tab from replacing a room session and knocking another tab off.
- Browser audio playback might require **PLAY FRIEND SOUND / PLAY GROUP SOUND** after user gesture. Browser tab/system audio capture is platform dependent; users must select **Share tab audio** if offered.

## Before uploading

1. **Backup** both the existing STAGING website files and STAGING database schema.
2. Ensure the existing V12.8.22 database migration is installed, as well as its prerequisite V12.8.11 friends-call tables and existing V12.8.7/V12.8.8 social schema. The included new SQL is *incremental* and **does not install those prerequisites**.
3. In the STAGING Supabase SQL editor, run `VXSK-V12.8.23-STAGING-CALLS-ONLY.sql` **only after** V12.8.22. It updates room-join session protection and adds the avatar path to the room roster. Do **not** run on production.
4. Deploy the contents of this ZIP to the correct **STAGING GitHub Pages** repository root, retaining existing unrelated assets and configuration. Do not unzip it inside another directory if GitHub Pages expects `index.html` at the root.
5. Force-refresh all testing browsers / unregister an older VXSK service worker if old code persists. The service worker cache key and script query strings have been version-bumped.

## Required tests (not yet performed on live project)

Use **four different STAGING accounts**, on at least two real devices (Chrome/Edge desktop + mobile browser), with valid camera and microphone permission and uploaded profile photos. Avoid trying calls from two tabs of the same account. Only active accepted friends can call each other.

1. **A calls B — video:** B accepts, both video and microphone stay connected. Try camera OFF and ON from each device and confirm the other participant sees a picture/avatar, not a stuck tile. Repeat with A's camera permission denied: audio should remain available.
2. **A calls B — audio:** confirm both hear one another. Turn on camera during the audio call, then turn camera off; the call should not end. Test MUTE FRIEND (remote audio), MUTE MICROPHONE (local mic) and reversal.
3. **Screens both directions:** A shares a Chrome tab and selects Share tab audio if available. B sees/hears it. While A shares, B starts their own share. Both independent screen previews should be present; sound mute on A's share must not mute B's microphone. Stop one screen and make sure the other remains active.
4. **Group calls:** invite four accepted members into one group and have each join on separate devices/tabs. All four should show up, with correct avatars or initial fallback and individually controllable mute states. All four share **one screen each**; verify grid layout contains 4 tiles, fullscreen one screen and fullscreen grid, hover/tap share sound mute, local microphone mute and remote user mute. Stop/restart share/camera in mixed audio/video group calls.
5. **Connection recovery:** test with two different Wi-Fi/mobile networks, browser minimization, short Wi-Fi handoff, ringing expiration and intentional END CALL. After leaving, ensure camera/mic capture stops and a new call can start. Some handoffs or strict NAT will not reconnect in STUN-only mode.
6. **Device/permission UX:** camera denied, microphone denied, browser without `getDisplayMedia`, autoplay blocked, headset change, mobile fullscreen unsupported. Confirm permission requests happen only after user action.

## Important limits

- **This is STUN-only peer-to-peer media.** Some mobile, enterprise and carrier networks will not complete WebRTC peer connections without a TURN relay. This version does not create or promise a TURN service. For reliable real-world calls, configure a secure authenticated TURN credential flow and test two networks. Peer-to-peer calls with four simultaneous camera+screen feeds consume significant CPU and upload bandwidth: test low-powered devices and consider an SFU for production scale.
- **4 shares** means one share from each of **4 group participants**, not four simultaneous share sources from a single person.
- Browser screen capture and **system audio** are not universally supported on phones, all desktop browsers or all operating systems; Chrome/Edge tab capture with audio is the best first test.
- Calls are not recorded. AV assets and database are **not uploaded/deployed by this ZIP**; SQL requires your deliberate action.
- **Static checks and a limited local browser smoke test** were run. The browser smoke test mocked backend RPCs and reached six offer/six answer exchanges with four simulated participants. Due restricted network/ICE in this sandbox, it could **not verify remote camera/audio/share media connectivity**, and it is **not a live Supabase test**.
- Do not claim the new version has been end-to-end verified until those real four-account tests pass.
