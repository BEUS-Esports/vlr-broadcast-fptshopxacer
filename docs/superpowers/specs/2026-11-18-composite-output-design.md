# Composite Output (Take to Live) — Design

Source request: [docs/feature-description/proper-output-route.md](../../feature-description/proper-output-route.md)

## Intent

The composite output (`/gfx/live/composite`) stacks every shown graphic at once today. Most graphics are full-screen,
so showing two of them overlays one on the other. Operators need character-generator behaviour (SPX, Barracks.gg):

- the composite has its **own on-air state**, taken with a dedicated **Take Live** button;
- graphics on the same **layer** replace each other: the old one animates **out, then** the new one animates **in**;
- graphics on different layers (HUD, Agent Select, future tickers and lower thirds) stack.

The standalone per-graphic outputs (`/gfx/live/[graphic]`) and their **Show/Hide** control stay **independent** of the
composite. A separate standalone GFX control drives them, so the two cannot share state.

## Current state (what this changes)

- One `visibility` flag per graphic in `broadcast_state` ([broadcast.ts](../../../src/lib/server/services/broadcast.ts)).
  Show captures `publications[graphic]` (a prepared snapshot) and Hide clears it. Both output routes read this.
- [LiveOutput.svelte](../../../src/lib/broadcast/LiveOutput.svelte) renders every shown graphic in a fixed z-order. No
  exclusivity.
- [GraphicRenderer.svelte](../../../src/lib/broadcast/GraphicRenderer.svelte) wraps output in a 150ms `transition:fade`.
  Out and in run at the same time.
- Templates animate in on mount, using CSS `@keyframes` today; the `design/pacific-gfx` prototypes use GSAP. Each
  graphic picks its own animation tool. No template has an outro yet: Hide unmounts it behind the shared fade.
- Newer saved data reaches a shown graphic only through **Hide → Show**.
- [GraphicControls.svelte](../../../src/lib/components/admin/graphics/GraphicControls.svelte) shows a confirm dialog when
  you show a full-screen graphic while another is on air.

## Goals

1. **Separate composite state.** Composite on-air graphics and their captured data are stored apart from standalone
   visibility and publications. Neither state changes the other.
2. **Layers set in code.** Each graphic has a fixed layer number, declared next to `graphicLabels` in
   [controls.ts](../../../src/lib/broadcast/controls.ts):

   | Layer | Graphics                                                            |
   | ----- | ------------------------------------------------------------------- |
   | 0     | In-Game (HUD)                                                       |
   | 1     | Player Lineup, Player Stats, Map Veto, Post-Game, MVP (full-screen) |
   | 2     | Agent Select                                                        |

   The composite holds at most **one graphic per layer**. A higher layer renders above a lower one.

3. **Take Live.** Puts a graphic on the composite and captures its data at that moment. If its layer is occupied, the
   server replaces the occupant in the same write. On the output page the old graphic plays its out animation to
   completion, then the new one plays its in animation.
4. **Take Off.** Removes a graphic from the composite with its out animation. **Clear all** takes everything off.
5. **Update Live / Update (standalone).** Recaptures the latest saved data for a graphic that is already on air, without
   animating it out and back in. This is available on the composite and on the standalone outputs. It replaces the
   "Hide → Show to publish" workflow and its warning text.
6. **Template animation contract** (modelled on SPX/OGraf `play`/`stop`/`update`, not on Svelte transitions). A
   tournament template's `Graphic.svelte` may export these instance methods:

   ```ts
   play(): Promise<void>                        // intro; resolves when fully in
   stop(): Promise<void>                        // outro; resolves when fully out
   update(snapshot: BroadcastSnapshot): Promise<void> // apply new data in place
   ```

   - The renderer **awaits** each one. Unlike the SPX examples, `stop()` resolves only when the animation has finished,
     because out-then-in depends on it.
   - The template animates however it likes: CSS, WAAPI, GSAP or video.
   - A template that exports none of them keeps working, with a fallback 150ms fade in and out.

7. **Standalone outputs use the same contract.** Show runs `play()` and Hide runs `stop()`, so standalone outputs also
   get exit animations.
8. **Admin controls.**
   - Each graphic page gets **Take Live**, **Update Live** and **Take Off** next to the existing Show/Hide, which gains
     **Update**. See the mockup at
     [imgs/mockup-take-to-live-button.png](../../feature-description/imgs/mockup-take-to-live-button.png).
   - A **Live Now — Composite** panel in
     [GraphicsGlobalSetup.svelte](../../../src/lib/components/admin/graphics/GraphicsGlobalSetup.svelte) lists each
     layer and its occupant, with per-row Update and Take Off buttons and a Clear all button. This follows Barracks.gg's
     "Broadcasting now" panel.

## Non-goals

- Stingers ([stinger.md](../../feature-description/stinger.md)). This design only leaves the hook for them: a stinger
  later slots between `stop()` resolving and `play()` starting.
- Any operator-configurable layer or overlay setting. Layers are code, as are per-template layer overrides.
- Loading real OGraf web components, or SPX `.mjs`/`.ograf.json` templates.
- New ticker or lower-third graphics. Layer 3 and above are just free for them.
- Multiple composite outputs or channels.

## Anti-goals (failure even if it "works")

- Two graphics on the same layer visible together on the composite, even for one frame of overlap.
- A Take that cuts the old graphic without its out animation, when that graphic defines one.
- A standalone Show/Hide/Update that changes the composite, or the reverse.
- Live telemetry, such as HUD scores or round timers, waiting on `update()`. Telemetry keeps flowing reactively as today.
  `update()` is only for operator-captured data.
- Existing templates breaking because they don't export the new methods.

## Constraints

- **Concurrency.** Composite writes go through `updateBroadcastState`'s optimistic `controlRevision` lock like every other
  control. Layer exclusivity is enforced **on the server**, inside that transaction, not only in the UI.
- **Game changes.** The existing rule "hide all shown graphics before changing the live selection" extends to the
  composite. A game change is blocked while either state has anything on air.
- **Persistence.** Composite state is new `broadcast_state` columns plus a Drizzle migration (next number after `0018`).
  It must survive a server restart and an output page reload, like publications do today.
- **Validation.** Stored composite data passes through the same `validatedPublications` path as existing publications, so
  bad or old JSON fails closed.
- **Output timing lives in the browser.** The server switches state at once. Each output page sequences `stop()` and then
  `play()` on its own, so the server does no animation timing.
- **Rapid takes.** If a layer changes again while an out animation is running, the output plays only the latest target.
  Intermediate graphics never play.

## Approaches considered

| Approach                                                                  | Trade-off                                                                                                                                                                     | Verdict          |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **A. Imperative `play`/`stop`/`update` exports, awaited by the renderer** | Works with any animation tech. Same mental model as SPX/OGraf. The natural seam for stingers. Each template author writes its own methods.                                    | **Picked**       |
| B. Svelte `in:`/`out:` transitions, sequenced on `outroend`               | Least code, but animations are limited to Svelte's transition format, nested elements need `\|global`, and loops or "next" steps don't fit. Too inflexible outside SvelteKit. | Rejected by user |
| C. Real OGraf web components (`.mjs` + manifest)                          | Runs SPX templates as they are, but adds a second rendering system next to the Svelte templates and the snapshot model.                                                       | Rejected by user |

Layering:

- An exclusivity flag with three labels (full-screen / overlay / HUD) was considered. It was replaced by SPX-style layer
  numbers, which cover all three cases and future tickers with one rule.
- Operator-toggled overlay settings were rejected: they only make sense if the graphics package is built inside the app.

## Decided by the user

- Composite and standalone state are separate (standalone GFX control exists).
- Layers are set in code, per graphic, using the map above.
- Template contract is `play()`/`stop()`/`update()`, not Svelte transitions or OGraf web components.
- Standalone outputs get Update too.

## Calls made in design (check these)

- No per-template layer override (kept out to avoid speculative surface). The layer map lives in `controls.ts`, so the
  server can enforce it without importing Svelte templates.
- Composite storage mirrors the existing pair: a composite visibility record plus composite publications.
- The standalone "already on air, show on top?" confirm dialog is removed. Each standalone output is its own browser
  source, so stacking can't happen there, and the composite now enforces layers.
- The In-Game HUD (`InGameHud`, `CenterMatchBanner`) is shared code, not a template. It uses the fallback fade.
- The Live Now panel sits in `GraphicsGlobalSetup`, so it shows on every graphics page.

## Left to the builder

- **How `update(snapshot)` and the `snapshot` prop interact.** Requirement: templates without `update` still show new data,
  and templates with it can animate the change. Pick one source of truth and document it in `templates.ts` next to the
  `sponsor` export note.
- **How the renderer reaches the template's methods** (Svelte 5 `bind:this` on the dynamic component), and how
  `Graphic.svelte` forwards calls to its per-graphic sub-components.
- **Per-call timeouts** for `play`/`stop`/`update`. A template that never resolves must not freeze a layer. Log the failure
  and cut.
- **Test updates.** [tests/gfx-composite.e2e.ts](../../../tests/gfx-composite.e2e.ts) currently asserts that the composite
  follows standalone Show/Hide, which is now wrong. Rewrite it to cover: take, replace on the same layer (out before in),
  stacking across layers, update without remount, and that standalone and composite stay independent. Unit-test layer
  exclusivity and the game-change block in the broadcast service tests.
- **Porting.** Port at least one real template (`predator-roadshow-val`) to `play`/`stop` so the contract is proven on
  production art. Other templates may stay on the fallback.
