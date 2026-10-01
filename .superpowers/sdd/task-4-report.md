# Phase 5 Task 4 — Stable live graphics routes and template resolution

## Delivered

All seven controller output URLs resolve through `src/routes/gfx/live/[graphic]/`:

- `/gfx/live/player-lineup`
- `/gfx/live/player-stats`
- `/gfx/live/map-veto`
- `/gfx/live/agent-select`
- `/gfx/live/in-game`
- `/gfx/live/post-game`
- `/gfx/live/mvp`

IDs and labels reuse `controls.ts`. Unknown graphic IDs return HTTP 404. The URLs never contain selected tournament, match, or game IDs.

`LiveGraphic.svelte` is the common output wrapper. It creates the Task 3 broadcast client once, subscribes/connects in `onMount`, and unsubscribes/disconnects on destroy. It consumes the decoded typed snapshot, uses the selected tournament slug to resolve a template, and respects the graphic's shared visibility control. Templates receive the snapshot directly; they contain no networking or mutation controls. The wrapper retains the shared client's latest complete snapshot through reconnects.

Graphics options now explicitly enable SSR and CSR in production. Server rendering emits an empty wrapper and permits server-side unknown-ID validation; EventSource starts only on browser mount. The existing transparent 1920×1080 gfx layout is preserved.

## Template API and Task 5 handoff

Shared props exported by `src/lib/broadcast/templates.ts`:

```ts
export type GraphicTemplateProps = {
  snapshot: BroadcastSnapshot;
  graphic: GraphicId;
};
```

The generic fallback is `src/lib/broadcast/templates/test/Graphic.svelte`. It currently renders the graphic label and saved tournament/match/game context when visible, or “No game selected.” This is the routing/data proof shell; Tasks 5–8 add the actual visual primitives and graphic-specific content.

A custom tournament template belongs at `src/lib/broadcast/templates/<exact-tournament-slug>/Graphic.svelte`. It takes the same props and switches content using `graphic`. The eager Vite glob registers existing templates at build time. No new dependency, provider, server mutation, or domain table is introduced. Unknown, empty, null, undefined, and inherited-property slugs resolve to the generic `test` template. Add custom artwork only when available; no tournament branding is invented here.

The wrapper exposes `data-graphic`, `data-template`, `data-game-id`, and `data-revision` for functional verification. The template only renders after a valid snapshot arrives and its graphic is shown.

## TDD evidence

1. Added template resolution checks and the production graphics flow before implementation.
2. Initial unit import failed because the resolver was absent. Added only the fallback stub, then observed the meaningful red assertion: custom template expected, generic returned.
3. Production browser red run failed because `[data-graphic]` did not exist at the missing stable output route.
4. Implemented registry, common wrapper, generic shell, and stable route.
5. Unit resolver and existing client tests passed: 2 files, 3 tests.
6. The first check caught rune-name shadowing and a missing explicit `#lib` extension; both were fixed.
7. A combined browser run passed broadcast/controller tests but lost the app process during first graphics navigation while kit sync was running concurrently. No claim of graphics success was made from that run. Sequential reruns did not reproduce the process loss.
8. Sequential graphics run proved the seven outputs, live updates, canvas, and read-only checks; final unknown-ID assertion caught CSR-only load validation returning a 200 shell. Enabling SSR alongside CSR fixed server validation without adding matcher configuration.
9. Final sequential check and production browser run passed, including HTTP 404 for unknown graphic IDs.

## Final verification

Environment: Node 24.19.0 directory prepended to PATH for children, direct pnpm 11.22.0 executable, PowerShell `login:false`, `PLAYWRIGHT_CHANNEL=chrome`, one Playwright worker. E2E setup uses a disposable database/assets directory, builds production output, then previews it. No event database migration was run.

Commands (pnpm means `C:/Users/RookiesLaptopROGS15/AppData/Local/mise/installs/pnpm/11.22.0/pnpm.exe`):

- `pnpm check` — 0 errors, 0 warnings after the final SSR/route change.
- `pnpm exec vitest run src/lib/broadcast/template-resolution.test.ts src/lib/broadcast/client.test.ts --project server` — 2 files, 3 tests passed.
- `pnpm exec playwright test tests/phase5-graphics.e2e.ts` — final production run 1 passed in 50.5 seconds; test body 16.8 seconds.
- Earlier combined run: `tests/phase5-broadcast.e2e.ts` and `tests/phase5-controller.e2e.ts` each passed. Full-suite integration remains Task 9.
- `pnpm exec prettier --check` on all nine changed code/test files — passed.
- `pnpm exec eslint` on those files — exit 0.
- Svelte autofixer on all three written components, including the corrected wrapper — no issues or suggestions.
- `git diff --check` — no whitespace errors.

The production graphics test verifies every graphic receives the selected game snapshot, uses the unknown-tournament fallback, has a transparent 1920×1080 canvas, has no forms/buttons/inputs/selects, emits no mutation requests, leaves `broadcast_state` unchanged on reads, follows a committed game change at the same URL, renders graceful empty selection, and rejects unknown graphic IDs.

## Files

- `src/routes/gfx/+layout.js`
- `src/routes/gfx/live/[graphic]/+page.ts`
- `src/routes/gfx/live/[graphic]/+page.svelte`
- `src/lib/broadcast/LiveGraphic.svelte`
- `src/lib/broadcast/templates.ts`
- `src/lib/broadcast/templates/test/Graphic.svelte`
- `src/lib/broadcast/template-resolution.ts`
- `src/lib/broadcast/template-resolution.test.ts`
- `tests/phase5-graphics.e2e.ts`
- `.superpowers/sdd/task-4-report.md` (overwrites the stale earlier-phase report)

## Self-review and remaining concerns

Task 4 requirements are covered; route changes do not touch publication hooks, resources, or management writes. Template selection checks own keys, so prototype properties cannot select a template. Snapshot decoding and reconnect behavior remain owned by the shared Task 3 client.

No actual tournament-specific artwork template is supplied by this task. The registry and tested resolution path are ready for it. Generic graphic-specific visual content remains Tasks 5–8. Actual OBS rehearsal is unavailable and remains pending. Authentication is explicitly deferred by the user: LAN trust/protection gap remains. Browser proof is production Chrome, not an OBS rehearsal.
