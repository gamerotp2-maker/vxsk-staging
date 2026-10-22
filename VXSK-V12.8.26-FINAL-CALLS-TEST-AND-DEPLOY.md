# VXSK V12.8.26 — Group Call + Screen Share Stabilization

**STAGING / pre-launch candidate — not production-certified.**

## Changes relative to V12.8.25

- Added small SVG icons to the group call **Mute Microphone**, **Camera ON/OFF**, **Share/Stop Share Screen**, **Play Sound**, and **Leave Group Call** controls.
- Participant cards display a visible **🔇 MIC MUTED** indicator when they mute their own microphone. The muted state is signaled independently to peers and updates periodically. Local-only **Mute User** still works and does not change the other person's microphone.
- Camera capture is individually optional. A member with no camera can remain in a voice call while someone else turns on video. **Your own camera preview** is shown in your participant tile and mirrored for familiarity.
- Corrected a group camera toggle crash (the code previously used `.vid` on a DOM element).
- Corrected an important signaling issue for **private and group calls**: the answering peer used to create duplicate unassociated WebRTC transceivers. The receiver now binds microphone, camera, screen video and screen audio to the four channels from the offer, in order.
- Improved share display: incoming sharing state shows a screen tile immediately with a connection message; repeated presence/state updates no longer reset working screen video elements.
- Group calls continue to support **up to four participants, each with one separate screen share**, shown in a split grid. Screen share mute/fullscreen controls remain independent.
- Improved status text: a room no longer claims remote media is LIVE until peers actually connect.
- Retains V12.8.25 social notifications/avatars and prior VXSK features.

## Deployment to VXSK-STAGING

1. Ensure you have your previous staging website version saved and a Supabase DB backup if you plan to change database configuration.
2. Unzip `VXSK-V12.8.26-FINAL-CALLS-STAGING.zip` on your PC.
3. In GitHub Desktop, open the `vxsk-staging` repository > **Repository > Show in Explorer**.
4. Copy the **contents** of the unzipped folder into the **root** of `vxsk-staging` (same level as `index.html`). Choose **Replace files** when asked. Do not replace the `.git` directory.
5. GitHub Desktop > **Changes** > create commit `VXSK V12.8.26 group call + screen fix` > **Push origin**.
6. GitHub > **Actions** > wait for the new `pages build and deployment` run to succeed. Hard-refresh the STAGING website (Ctrl+Shift+R), verify the footer/header build label shows **STAGING · V12.8.26**.
7. **No new SQL migration is required for V12.8.26.** This build relies on the existing V12.8.22 group-call and V12.8.23 call-avatar migrations. If V12.8.25 social alerts were not installed, they are an independent earlier migration, included in the archive (`VXSK-V12.8.25-STAGING-SOCIAL-ALERTS.sql`).

## Required test before an official launch

Test with separate real browser profiles or devices/accounts. Do not test by signing into two users in the same browser profile.

1. **Voice**: A calls B. Check both hear audio; A mutes, B sees `🔇 MIC MUTED`; unmute clears it. B uses `Mute User` without muting A for others.
2. **One camera only**: A opens camera from an audio call. A sees self-preview; B sees A's camera. B's camera remains off and the call continues. Then let B try the same in reverse.
3. **Camera off/on**: Turn A's camera off and on three times. Check B doesn't lose audio or get disconnected. Repeat in a group with 3–4 members.
4. **Share in both directions**: A shares a changing browser tab. B must see moving frames, not just a `Connecting screen` tile. Stop A; B shares back and A sees moving frames.
5. **Four simultaneous shares**: In a group with 4 real users, each shares a tab; verify all four moving tiles, 2×2 split grid, per-share fullscreen, per-share sound mute.
6. **Sound**: Tab audio may require enabling *Share tab audio* in the browser picker. If no sound is offered by browser/OS, video sharing should still work.
7. **Network**: Repeat across different networks (not only the same Wi-Fi). If calls connect poorly or screen video never arrives, check ICE connection and configure TURN relay before official production release.
8. **Mobile**: Check viewing, camera, mic, and panel sizing on phones. Screen capture initiation on mobile depends on browser/OS support and cannot be guaranteed.

## Validation performed while building

- Syntax checks passed for all 26 JavaScript files.
- Local two-tab Chromium WebRTC signaling test with a mocked server: two participants appeared, own/remote mute indicator worked, camera self-preview worked when the other user's camera was disabled, and both peers negotiated four matching media channels rather than duplicated channels.
- **Important limitation:** the sandbox browser had ICE connection state `new`, so it could not transport remote video frames. This means actual audio/video/share delivery and four-user live behavior are **not yet confirmed**. Production launch requires the real-account acceptance tests above.

## Troubleshooting

- **Red deployment absent:** Verify you copied files to the actual repository root, then commit and push in GitHub Desktop.
- **Old UI:** Hard-refresh and confirm V12.8.26 build label and a green GitHub Pages Actions run.
- **'CONNECTING MEDIA' forever:** The peer-to-peer ICE link has not connected. Test another network and check TURN relay settings.
- **'Connecting screen…' with no moving image:** Signaling reached the receiver but media packets haven't been confirmed. Try a browser tab and inspect network/ICE. This should block official launch until resolved.
- **Only one camera:** This is fully supported by design. No participant has to own a webcam for others to send camera video.
