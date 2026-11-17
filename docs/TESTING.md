# Testing

- `pnpm test` runs `test:seed`, then unit tests with coverage, then Playwright.
- Run `pnpm check`, `pnpm build` and E2E one after another: they share generated files.
- Set `PLAYWRIGHT_CHANNEL=chrome` to use installed Google Chrome for Playwright and client Vitest tests.
- Each Playwright run migrates a temporary database, uses a temporary asset directory, builds and starts its own app, and removes the test data on shutdown. Rebuild with your normal environment before running the app afterwards.

## Browser journeys

Management:

```sh
pnpm exec playwright test tests/phase3-management.e2e.ts tests/phase3-conflicts.e2e.ts
```

Broadcast, on the production Node build ([Phase 5 evidence and screenshots](./superpowers/plans/2026-10-01-phase-5-verification.md)):

```sh
pnpm exec playwright test tests/phase5-broadcast.e2e.ts tests/phase5-controller.e2e.ts tests/phase5-graphics.e2e.ts tests/team-a-veto-order.e2e.ts --workers 1
```

Phase 5.1 workflow, duplication and visuals ([Phase 5.1 verification](./superpowers/plans/2026-10-02-phase-5.1-verification.md): current workflow and Test GFX v2 screenshots, which are generic test artwork):

```sh
pnpm exec playwright test tests/phase5.1-workflow.e2e.ts tests/phase5.1-duplication.e2e.ts tests/phase5.1-visuals.e2e.ts
```

Live providers, local fixture ([Phase 6 implementation and verification](./superpowers/plans/2026-10-03-phase-6-live-providers-external-hud.md)):

```sh
pnpm exec playwright test tests/phase6-live.e2e.ts
```

Post-game imports, deterministic ([Phase 7 verification](./superpowers/plans/2026-10-05-phase-7-verification.md): automated checks, the real HenrikDev retrieval result, and remaining custom-event/Spectra acceptance):

```sh
pnpm exec playwright test tests/phase7-post-game.e2e.ts
```
