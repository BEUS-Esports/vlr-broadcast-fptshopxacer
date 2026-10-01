# Team A / Team B Veto-Order Correction

> **Status:** Updated 2026-10-01 for editable map veto presets. Broadcast left/right isolation remains part of Phase 5.

## Problem

The current match model persists `teamAEntryId` and `teamBEntryId`, but the current Match UI presents them mostly as two participant labels. The Map Veto editor independently stores `actingEntryId` for every veto action and currently says that action order does not alternate automatically.

That means the application does not yet make the intended tournament meaning of **Team A / Team B** explicit:

- **Team A starts the standard map veto sequence.**
- Team B is the other competition-order slot. In a double-elimination grand final, the upper-bracket team may ban twice first whether it chose A or B.
- A/B is not merely cosmetic.
- A/B is not the same thing as broadcast left/right.
- A/B is not the same thing as attacker/defender.

This matters because graphics and later provider mappings must consume stable competition identity rather than infer order from whichever team happens to be drawn on the left or colored blue.

## Required semantic model

There are three independent axes:

| Axis                       | Meaning                  | Rule                                                                                                                                                                                         |
| -------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Match Team A / Team B**  | Competition/veto order   | Team A starts the standard map veto sequence. The grand-final upper-bracket team may take the first two bans as A or B. Operators can edit the veto procedure without changing A/B identity. |
| **Broadcast Left / Right** | Presentation/stage order | Default A-left/B-right. Operators may explicitly swap presentation without mutating the match.                                                                                               |
| **Attacker / Defender**    | Current gameplay side    | Attacker is always blue; Defender is always red. Teams keep their screen positions when gameplay sides change.                                                                               |

A broadcast left/right swap must never rewrite Match A/B, veto actors, scores, results, lineups, or game identity.

## Current implementation gap

As of 2026-10-01:

- `matches.teamAEntryId` and `matches.teamBEntryId` are persisted and relationship-safe.
- Participant changes are already blocked after games, veto actions, or a stored result exist.
- `match_veto_actions.actingEntryId` is stored per action.
- `VetoEditor.svelte` allows the operator to choose the acting team for every action.
- A/B assignment remains stable after dependent data exists, while individual veto actors and order remain editable.
- A seven-map ruleset preset can fill a draft without storing seeding or upper-bracket status on the match.

The database shape does **not** require a new "first veto team" or bracket-status column. Saved `actingEntryId` remains authoritative for each action.

## Required correction

### Match menu

- Explain Team A as the standard sequence opener and Team B as the second competition slot.
- Add an obvious **Swap Team A / Team B** action while participant identity is still mutable.
- Preserve the existing safety rule: once games, veto actions, or a stored match result exist, A/B cannot be silently changed.
- Changing the actor of a veto action does not swap A/B. Changing A/B after dependent data exists still requires the explicit clear/reset workflow.

### Map Veto editor/service

- A newly added manual action defaults to Team A, and **Fill Map Veto** fills BO1, BO3, and BO5 actions and game numbers from the Riot-based seven-map procedures.
- The BO5 grand-final preset offers either Team A or Team B as the upper-bracket team for its two opening bans, without changing match participants.
- Presets only fill an editable draft. Replacing a nonempty draft requires confirmation; map and side choices remain unknown until the operator enters them. BO2 remains manual because the cited ruleset gives no BO2 procedure.
- Actors, action types, order, and game assignments remain operator-editable; the service validates participants and relationships rather than enforcing a preset sequence.
- Do not silently rewrite an existing veto sequence just because presentation left/right changes.
- Map Veto graphics must display saved veto actions; they must not invent actor order from screen position.

### Tests

Add focused coverage for:

1. New match: Team A is communicated as the standard map veto opener.
2. Standard BO1/BO3/BO5 and either grand-final upper-bracket preset fill the expected editable rows.
3. An operator-edited Team B first actor can be saved without changing A/B; two opening grand-final bans by Team B are valid.
4. A/B change remains blocked once veto/game/result dependencies exist.
5. Consecutive later actions by the same team remain valid.
6. Broadcast left/right swap does not change A/B or any saved veto action.
7. Attacker/Defender side changes do not change A/B.

## Acceptance

This correction is complete when an operator can start from the applicable ruleset order, change it for the actual tournament procedure, and save the chosen actors without silently changing Match A/B identity.

Phase 5 may then safely reuse:

- Match A/B for competition identity,
- a separate broadcast left/right presentation override,
- game/live side state for Attacker/Defender color.
