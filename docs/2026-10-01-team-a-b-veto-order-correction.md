# Team A / Team B Veto-Order Correction

> **Status:** Required follow-up discovered 2026-10-01. This is a management-domain correction that must be completed before the Phase 5 Map Veto output is accepted.

## Problem

The current match model persists `teamAEntryId` and `teamBEntryId`, but the current Match UI presents them mostly as two participant labels. The Map Veto editor independently stores `actingEntryId` for every veto action and currently says that action order does not alternate automatically.

That means the application does not yet make the intended tournament meaning of **Team A / Team B** explicit:

- **Team A is the first veto actor.**
- Team B is the other competition-order slot.
- A/B is not merely cosmetic.
- A/B is not the same thing as broadcast left/right.
- A/B is not the same thing as attacker/defender.

This matters because graphics and later provider mappings must consume stable competition identity rather than infer order from whichever team happens to be drawn on the left or colored blue.

## Required semantic model

There are three independent axes:

| Axis | Meaning | Rule |
| --- | --- | --- |
| **Match Team A / Team B** | Competition/veto order | Team A takes the first acting veto action. If another team must act first, assign/swap that team into Team A before dependent records lock the participants. |
| **Broadcast Left / Right** | Presentation/stage order | Default A-left/B-right. Operators may explicitly swap presentation without mutating the match. |
| **Attacker / Defender** | Current gameplay side | Attacker is always blue; Defender is always red. Teams keep their screen positions when gameplay sides change. |

A broadcast left/right swap must never rewrite Match A/B, veto actors, scores, results, lineups, or game identity.

## Current implementation gap

As of 2026-10-01:

- `matches.teamAEntryId` and `matches.teamBEntryId` are persisted and relationship-safe.
- Participant changes are already blocked after games, veto actions, or a stored result exist.
- `match_veto_actions.actingEntryId` is stored per action.
- `VetoEditor.svelte` allows the operator to choose the acting team for every action.
- Adding a veto row does not establish the semantic rule that the first acting action belongs to Team A.
- The Match participants UI does not explain that Team A determines first veto action.

The database shape does **not** require a new "first veto team" column. Team A already owns that meaning once the requirement is enforced.

## Required correction

### Match menu

- Label/explain Team A as **first veto actor** and Team B as the second match slot.
- Add an obvious **Swap Team A / Team B** action while participant identity is still mutable.
- Preserve the existing safety rule: once games, veto actions, or a stored match result exist, A/B cannot be silently changed.
- If an operator needs the opposite team to act first after dependent data exists, require the existing explicit clear/reset workflow rather than rewriting saved ownership.

### Map Veto editor/service

- The first non-neutral acting veto action must belong to Match Team A.
- A newly started veto should make Team A the obvious/default first actor.
- Later action actors and action order remain operator-editable so tournament-specific procedures, consecutive same-team picks, and winner-bracket advantages still work.
- Do not silently rewrite an existing veto sequence just because presentation left/right changes.
- Map Veto graphics must display saved veto actions; they must not invent actor order from screen position.

### Tests

Add focused coverage for:

1. New match: Team A is communicated as first veto actor.
2. First acting veto action assigned to Team B is rejected with a clear error.
3. Swap A/B before dependent data exists, then the newly assigned Team A can act first.
4. A/B change remains blocked once veto/game/result dependencies exist.
5. Consecutive later actions by the same team remain valid.
6. Broadcast left/right swap does not change A/B or any saved veto action.
7. Attacker/Defender side changes do not change A/B.

## Acceptance

This correction is complete when an operator cannot reasonably prepare a match believing A/B is cosmetic, and the stored first veto action is guaranteed to agree with the Match Team A identity.

Phase 5 may then safely reuse:

- Match A/B for competition identity,
- a separate broadcast left/right presentation override,
- game/live side state for Attacker/Defender color.
