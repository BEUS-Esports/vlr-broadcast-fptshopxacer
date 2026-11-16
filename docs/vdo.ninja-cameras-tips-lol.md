> Originally written for the LoL GFX App, used in the FPT Shop x Predator League Roadshow 2026 Event. The tips below still applies for the VALORANT app.

---

# LoL GFX In-Game App: VDO.Ninja Camera Optimization Notes

**Goal:** a preview page with 10 low-quality feeds and operator controls, plus a HUD output page showing 2 higher-quality cameras next to the scoreboard from a warm pool of all 10 players. An optional pregame intro displays all 10 player cameras with champion graphics over them. **Keep-warm is required** because other app sections also need the cameras; switching must not routinely destroy and recreate their connections.

**Status:** documentation and source review completed on **2026-11-05**. The earlier freeze remains **unconfirmed**: no incident diagnostics or live performance measurements were captured. Documented capabilities below are distinct from proposed settings and hypotheses. The local [VDO.Ninja index](docs.vdo.ninja.llms.txt) is a navigation aid; the linked parameter pages provide behavior details.

---

## 1. Reported incident and current code

**Reported for the earlier attempt**

- Previews and HUD cameras used the **same VDO.Ninja parameters**, with about 20 full-quality instances overall.
- Senders ran on separate PCs at **1080p60**; the production machine had a strong GPU.
- The HUD ran in a **vMix browser input (CEF)** and also lagged in plain Chrome on that machine.
- The rest of the HUD did not load while cameras were present. Removing the camera feature restored it.
- Only the **Vite dev server** was tested during that attempt.

**Verified in the current checkout**

- The app uses **Vue 3 and Vite**. Its [package scripts](../examples/leaguebroadcast-js-client-demo-main/package.json) include `build:production` and `start:production`.
- The shared [camera URL helper](../examples/leaguebroadcast-js-client-demo-main/src/utils/vdoNinja.ts) requests `bitrate=20000` and `codec=h264`: a **20 Mbps target per feed**, not measured traffic.
- The [HUD camera pair](../examples/leaguebroadcast-js-client-demo-main/src/components/PlayerCameras/InGamePlayerCameraPair.vue) mounts only the active player's camera for each team. [App.vue](../examples/leaguebroadcast-js-client-demo-main/src/App.vue) can also unmount the whole pair. Current behavior therefore does **not** meet the keep-warm requirement.

The reported startup failure makes renderer/process contention worth investigating, but does not exclude decode, GPU, network, or application errors. GPU capability alone does not establish which encoder or decoder was actually used.

### 1.1 Requested capacity and Solo View behavior

The user's capacity budget assumes one instance of each surface below, with independent camera receivers and all ten players connected. This describes the intended design, not the current implementation's measured connection count.

| Surface                | Camera subscriptions                               | Visible cameras                                        |
| ---------------------- | -------------------------------------------------- | ------------------------------------------------------ |
| Scoreboard HUD         | 10 retained                                        | 2 selected players; 8 retained off screen              |
| Operator previews      | 10 at low quality                                  | 10                                                     |
| Optional pregame intro | 10 additional while its separate pool is connected | 10 when shown, with champion graphics over the cameras |

**Baseline: 20 internal subscriptions. With the separate pregame pool: 30 internal subscriptions.** There are still only ten camera sources. In the P2P model, each player serves two receiving peers normally, or three with the pregame pool connected. A hidden but connected pregame pool still counts; champion graphics themselves add no video subscription.

If the intro reuses the same retained media receivers within a shared page instead of creating another pool, it need not add ten subscriptions. Do not assume that reuse across independent tabs or browser inputs. For planning and testing, retain the user's **30-subscription internal budget** until reuse is demonstrated.

**Solo View requirement:** open the selected player's stream directly in a new tab on `https://vdo.ninja/`, using VDO.Ninja's normal viewer interface and the required stream/room access parameters. Do not route it through an app-owned viewer or apply the HUD's control-hiding presentation options. This is a requested behavior, not an implemented change from this documentation review.

Each connected Solo View tab adds **one external subscription for that player**. At the internal peak, one such tab makes 31 overall and four receiving peers for that player under P2P. Additional tabs, duplicate overlay inputs, or guest-to-guest video can increase the total further; 30 is not a global connection cap.

---

## 2. Hypotheses to investigate

These are an investigation order, not a ranking proven by measurements.

1. **App startup and rendering contention.** Each VDO.Ninja iframe starts an embedded application. Measure script work, memory, and actual process allocation instead of assuming all frames share the HUD's main thread.
2. **Simultaneous connection setup and media startup.** Negotiation and initial keyframes may create a burst of work. Staggering startup is an experiment, not an established fix.
3. **Development-server overhead.** Compare with the built production runtime under equivalent conditions.
4. **Camera lifecycle changes.** Inspect Vue `v-if`, keys, URL changes, and ancestor mounts. Current camera selection intentionally remounts feeds; an accidental reactive loop has not been demonstrated.
5. **Sender, network, and receiver load.** Count subscriptions per camera and measure both ends, including decode and composition on the receiver.

**Correct connection accounting:** the budget in §1.1 is **20–30 internal subscriptions across ten sources**, or **two to three receiving peers per sender under P2P**, before external viewers. It does not imply 20–30 encodes per player. Encoding work depends on the publishing implementation; measure it. A director coordinates a P2P room but does not automatically mix its media on a server. [Connection architecture](https://docs.vdo.ninja/readme/how-does-it-work)

---

## 3. Candidate optimizations and documented behavior

### 3.1 Consolidate app instances where the layout permits

- **Previews:** benchmark one embedded director or Mixer App displaying all ten feeds against individual viewer iframes. Consolidation may reduce startup overhead; ten incoming camera streams still need processing.
- **HUD:** evaluate one controllable scene that displays the active pair while retaining the required inactive connections. Custom positioning must fit the scoreboard and be tested in vMix.
- **Live control exists:** the IFRAME API documents layout changes, per-stream display operations, and director commands such as `addScene`. Director commands require director permissions; `&remote` alone does not grant them. [Director API](https://docs.vdo.ninja/guides/iframe-api-documentation/iframe-api-for-directors)
- **Choose scene semantics deliberately:** `scene=0` auto-adds room videos; `scene=1` supports director-managed membership and preloading. Adding explicit `view=` IDs selects fixed feeds and prevents director control of that scene. Do not use the fixed-view examples below as a director-controlled scene design. [Scene behavior](https://docs.vdo.ninja/advanced-settings/mixer-scene-parameters/scene)

The [Mixer App](https://docs.vdo.ninja/steves-helper-apps/mixer-app) supports dynamic positioning. Its existence does not establish this app's switching latency or CPU savings.

### 3.2 Keep connections warm and measure hidden-feed cost

Keep-warm remains a requirement. Preserve the owning camera component and iframe across ordinary selection/visibility changes, or use VDO.Ninja-managed preloading inside a persistent scene. Keeping a feed connected can avoid reconnection, but does not guarantee immediate full-quality video: bitrate recovery and keyframes may take time.

CSS `display:none` is not a documented signal for reducing these streams' bitrates. Distinguish these controls:

| Control              | Documented scope                                                     | Implication here                                                                                                       |
| -------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `hiddenscenebitrate` | Videos not yet added to a VDO.Ninja scene                            | Does not establish a response to hiding an outer iframe with CSS.                                                      |
| `preloadbitrate`     | VDO.Ninja scene preloading                                           | Can tune retained media; zero disables preloading and the docs warn of stalls.                                         |
| `optimize`           | OBS source visibility; also special manual-scene connection behavior | Do not assume equivalent vMix/CSS integration. Zero can defer initial connections, conflicting with a fully warm pool. |
| `zoomedbitrate`      | Quality when a room video is expanded/fullscreen                     | Not a hidden-feed optimization.                                                                                        |

Sources: [hidden-scene bitrate](https://docs.vdo.ninja/advanced-settings/mixer-scene-parameters/and-hiddenscenebitrate), [preload bitrate](https://docs.vdo.ninja/advanced-settings/mixer-scene-parameters/and-preloadbitrate), [optimize](https://docs.vdo.ninja/advanced-settings/video-bitrate-parameters/optimize), [zoomed bitrate](https://docs.vdo.ninja/advanced-settings/video-bitrate-parameters/and-zoomedbitrate).

Mount-on-demand is useful as a diagnostic comparison, but does not satisfy the stated requirement. Separate tabs, pages, or browser inputs must not be assumed to share a retained media connection just because their URLs match.

### 3.3 Set capture limits and codec preferences on the correct side

Test **720p30** for the small HUD boxes, then compare with **1080p30** if other camera surfaces need more detail. These are starting points for measurement, not a proven quality ceiling for the whole app.

| Purpose                    | Sender / push link                                                                 | Viewer / scene link                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Capture resolution and FPS | `width`, `height`, `fps` / `maxframerate`                                          | `scale` requests per-view resolution scaling; it does not set capture FPS.                      |
| Video bitrate              | `outboundvideobitrate` sets a default; `maxvideobitrate` caps each outgoing stream | `videobitrate` / `vb` requests a target per stream; `totalscenebitrate` sets a combined budget. |
| Codec preference           | `prefervideocodec`                                                                 | `codec` is a per-view negotiation preference, not a guarantee.                                  |

Sources: [bitrate roles](https://docs.vdo.ninja/guides/video-bitrate-for-push-view-links), [maxframerate](https://docs.vdo.ninja/advanced-settings/video-parameters/and-maxframerate), [scale](https://docs.vdo.ninja/advanced-settings/video-parameters/scale), [codec](https://docs.vdo.ninja/advanced-settings/video-parameters/codec).

H264 is a reasonable comparison candidate on these PCs, but requesting it does not guarantee hardware encoding or decoding, lower CPU, or better stability. Check the negotiated codec and actual encoder/decoder. [Hardware encoding caveats](https://docs.vdo.ninja/guides/hardware-accelerated-video-encoding)

Hardware H264 can also have trouble resuming after live quality changes. [Codec behavior](https://docs.vdo.ninja/advanced-settings/video-parameters/codec)

### 3.4 Request inexpensive P2P previews

- Start by testing viewer-side **`vb=200&scale=25`** against a 1280x720 source. The scaling request corresponds to roughly 320x180, subject to publisher support and other adaptation. Compare 150–300 kbps for visual usability.
- **Do not put `maxvideobitrate` or `maxframerate` on a viewer link to limit its preview.** They are sender options. These viewer examples do not establish a 10 FPS limit; measure actual resolution, FPS, and bitrate.
- One P2P stream ID can serve a low-bitrate preview and a higher-bitrate HUD viewer. Each viewer requests its own target, subject to sender caps. Separate high/low publishers are not inherently required. [Push/view bitrate behavior](https://docs.vdo.ninja/guides/video-bitrate-for-push-view-links)
- A low target can reduce encoder work through resolution adaptation; the amount must be measured. [Video bitrate behavior](https://docs.vdo.ninja/advanced-settings/video-bitrate-parameters/bitrate)
- Snapshot previews are an alternative only if live monitoring is unnecessary: sender-side `postimage` uploads JPEGs to an HTTPS POST endpoint, and `postinterval` sets seconds between uploads. This requires a receiving/storage/display path; it is not a viewer-only switch or a replacement for operator controls. [Snapshot uploads](https://docs.vdo.ninja/advanced-settings/settings-parameters/and-postimage)

For a non-director viewer, use matching `remote=<passcode>` values on the sender and viewer when protected remote access is needed. This enables specific controls and stats, not director privileges; camera control support varies. The examples in §3.8 omit remote access and room credentials, which must be added for the actual deployment. [Remote controls](https://docs.vdo.ninja/advanced-settings/settings-parameters/remote)

### 3.4b Meshcast changes the quality model

Meshcast can move media distribution to a server so the player uploads one shared stream. It can reduce sender work and upload use, while adding a server path. [Meshcast](https://docs.vdo.ninja/advanced-settings/meshcast-parameters/and-meshcast)

**It does not preserve the P2P preview/HUD quality split above.** Its bitrate documentation states that every viewer receives the same video quality, and viewer-side `vb` and `scale` do not change that stream. Configure the shared publisher using Meshcast-specific options such as `meshcastbitrate`. [Meshcast bitrate behavior](https://docs.vdo.ninja/advanced-settings/meshcast-parameters/and-meshcastbitrate)

Keep P2P as the baseline for testing independently requested qualities. If sender load requires a server, separately validate how it will deliver low-quality previews and higher-quality outputs. A WHIP/WHEP server does not, by itself, establish transcoding or multiple quality layers; those capabilities need an explicit design and test.

### 3.5 Stagger startup

- Render the HUD graphics first, then initialize the retained camera pool after the initial render.
- Test mounting camera iframes individually or in small batches to spread startup work. Verify the camera-disabled HUD remains responsive and compare startup timings with the simultaneous case.

### 3.6 Vue lifecycle and production runtime

- Keep iframe URL values stable while stream identity and connection settings are unchanged. A Vue computed value or URL helper is acceptable; recomputing an identical string is not itself evidence of navigation.
- Use stable camera identities for `v-for` keys. Prevent selection changes and ancestor `v-if` conditions from destroying the required warm pool. CSS visibility may preserve mounts, but does not promise media savings.
- Keep camera connection configuration independent of frequently updated scores and stats. Verify iframe load counts and connection events during those updates.
- Measure the **built production runtime**, including its API services. Plain `vite preview` is not the full runtime used by this repo.

After normal repository setup, run from the repository root on the test machine. Start the runtime only after the build succeeds:

```powershell
npm.cmd run build:production --prefix examples/leaguebroadcast-js-client-demo-main
npm.cmd run start:production --prefix examples/leaguebroadcast-js-client-demo-main
```

These commands come from the app's package scripts. This documentation review did not run them or certify live camera performance.

### 3.7 vMix architecture alternative

If measurements show the embedded-browser path is the limiting factor, evaluate separate camera inputs in vMix with a transparent graphics-only HUD.

NDI or window capture may move work outside the HUD browser, but **does not guarantee one decoder or one application**. VDO.Ninja's documented adapters can still run a browser and add capture/conversion work. Compare total machine load and latency for the complete ingest path. [Capture alternatives](https://docs.vdo.ninja/guides/capturing-without-browser-sources)

### 3.8 Reference: ValoSpectra's playercam pattern (from its source)

Reviewed at commit `41134ff11c90e37e94b65852bb016c0e553012bf`: [playercam template](https://github.com/ValoSpectra/Spectra-Frontend/blob/41134ff11c90e37e94b65852bb016c0e553012bf/src/app/components/combat/playercams/playercams.component.html) and [stream URL service](https://github.com/ValoSpectra/Spectra-Frontend/blob/41134ff11c90e37e94b65852bb016c0e553012bf/src/app/services/playercamStream.service.ts). These establish HUD implementation details, not measured performance or the preview architecture.

**What it does**

- Creates an iframe for each enabled player while the outer camera condition holds. Hidden classes conceal unobserved players and non-combat phases without removing them through those visibility bindings.
- The outer condition disables this block when cameras are off or the 1v1 view is active. It can therefore unmount and later recreate the iframes.
- Uses CSS utility sizing and an aspect ratio; the previously stated 305x170 px is not established by these source files alone.
- Caches stream URL objects by player name in a `Map`. This stabilizes the URL binding, but does not preserve an iframe across unmounting or prevent independent connection failures.
- HUD URL pattern:

```
https://vdo.ninja/?room=<identifier>&view=<Name>_H_<tagline>&scene=0&cleanoutput&vb=5000&transparent&waitmessage=Loading&disablehotkeys&codec=h265,av1,h264,vp8
```

**What it implies**

- `room` + `view=<id>` + `scene=0` selects one feed from the room. It does not make outer CSS hiding a VDO.Ninja scene-membership change. [View selection](https://docs.vdo.ninja/advanced-settings/mixer-scene-parameters/view)
- `_H_` is part of the naming scheme. These files do not establish a paired `_L_` publisher.
- Ten feeds at the requested `vb=5000` would total about 50 Mbps of video **if each achieved that target**, before transport/audio overhead. This is arithmetic, not observed traffic or a hard aggregate cap.
- The source is evidence of an implementation pattern, not proof that ten full-quality feeds perform well on this production machine.

**What to copy**

- Stable URL values and deliberate camera identity handling.
- Only initialize configured cameras; do not create empty iframe instances.
- Presentation options such as `cleanoutput`, `transparent`, `waitmessage`, and `disablehotkeys` where appropriate.
- Persistent camera ownership for this app's keep-warm requirement, including its ancestors.

**What not to copy blindly**

- Compare 1000–2500 kbps with higher targets at the actual displayed size; do not declare a universal sufficient bitrate from CSS dimensions alone.
- `codec=h265,av1,h264,vp8` is an ordered preference. Check the negotiated codec and decode performance in the installed Chrome/vMix versions. H264 can be a starting comparison, not a hardware-acceleration guarantee.

**Candidate fixed-view P2P URLs (untested)**

Both links intentionally use the same stream ID. The preview scale assumes a 720p source. Substitute URL-encoded room/stream values and add the deployment's room credentials and remote-control settings as needed.

```
HUD:     https://vdo.ninja/?room=<room>&view=<id>&scene=0&cleanoutput&transparent&disablehotkeys&waitmessage=Loading&codec=h264&vb=2000
Preview: https://vdo.ninja/?room=<room>&view=<id>&scene=0&cleanoutput&disablehotkeys&codec=h264&vb=200&scale=25
```

These illustrate per-view quality requests, not the consolidated director/scene implementation. Do not apply their quality assumptions to Meshcast, infer a 10 FPS limit, or put `maxvideobitrate=200` on the sender: that sender cap would also restrict the HUD viewer. Verify both connections' actual stats simultaneously.

---

## 4. Architecture to validate

| Piece                  | Where it runs      | Candidate behavior                                                                                                                                        |
| ---------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preview / director     | Operator PC        | Ten low-quality P2P subscriptions with operator controls; evaluate consolidation into one director or mixer.                                              |
| Scoreboard HUD         | Production machine | Retain all ten camera connections and display the selected pair beside the scoreboard. Compare per-camera iframes with a preloaded controllable scene.    |
| Optional pregame intro | Production machine | Display all ten player cameras with champion graphics over them. Budget ten extra subscriptions when using a separate retained pool.                      |
| Senders                | Player PCs         | Test 720p30 capture against all display surfaces; permit independent quality requests. Budget two or three internal receiving peers per player under P2P. |

Keep-warm describes the connection lifecycle. It does not require every hidden feed to run continuously at the active feed's quality. Full-quality recovery time, resource use, and connection reuse across app sections remain acceptance measurements. Server distribution is a separate option after resolving the quality-model limitation in §3.4b.

---

## 5. Diagnostics checklist (for the next test)

Capture these, because the root cause is still unconfirmed:

1. **Establish the runtime and baseline.** Record browser/vMix versions, launch command, capture settings, and every open camera consumer. Use the built runtime from §3.6. Confirm graphics load with cameras disabled before adding media.
2. **Record startup evidence.** Capture console/network failures, a DevTools Performance trace, and Chrome task-manager CPU/memory by process. Compare no cameras, static iframe content, and real VDO.Ninja content; a static frame omits both app and media work and does not isolate which was responsible.
3. **Increase load deliberately.** Test 0, 1, 2, 5, then 10 camera sources. With all ten publishing, validate the 20-subscription HUD-plus-preview case and the 30-subscription case with a separate pregame pool. Compare simultaneous/staggered startup and 1080p60/720p30 with other variables held fixed. An improvement narrows the investigation but does not uniquely prove a keyframe storm.
4. **Measure both media endpoints.** Record per-connection bitrate, resolution, FPS, loss, keyframe requests, codec, and encoder/decoder information where exposed. Use VDO.Ninja stats and `chrome://webrtc-internals`; `chrome://gpu` shows capability/status, not proof of each stream's active decoder. [Stats troubleshooting](https://docs.vdo.ninja/guides/stats-menu/troubleshooting)
5. **Exercise keep-warm and host differences.** Repeatedly change the selected pair, hide/show the HUD and intro, and update scores while recording iframe loads, reconnects, black frames, and time to first/full-quality video. Check that Solo View opens VDO.Ninja directly and adds only the expected external subscription without restarting the internal receivers. Compare Chrome and vMix under matched loads. A difference identifies an environment dependency, not CEF as the proven root cause.

Use local looping video or stills for layout work. Those fixtures do not substitute for the live, multi-PC test on the production machine.

---

## 6. First experiments (in order)

1. Establish the built-runtime baseline and collect startup diagnostics.
2. Test separate P2P preview/HUD bitrate targets against the current 20 Mbps request, then compare capture resolutions and codecs.
3. Preserve the required camera connections across selection and visibility changes; measure hidden cost and recovery time.
4. Stagger initial camera startup and compare with simultaneous initialization.
5. Benchmark a consolidated director/scene layout. Consider server distribution or separate vMix ingest only with the quality and processing costs described above.