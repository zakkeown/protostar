---
phase: 06-live-dogpile-piles
plan: 02
subsystem: config-schema, phase5-annotation
tags: [factory-config, schema, phase5-retro, q-04, q-14]
requires: []
provides:
  - "factory-config.schema.json piles.{planning,review,executionCoordination}.mode contract for Wave 3 (Plan 07) loader"
  - "Phase 5 Q-10 retroactive lock visible to Phase 5 plan executors"
affects:
  - "packages/lmstudio-adapter/src/factory-config.schema.json"
  - ".planning/phases/05-review-repair-loop/05-CONTEXT.md"
tech-stack:
  added: []
  patterns:
    - "JSON Schema 2020-12 additive top-level property with additionalProperties: false on every nested object"
    - "Cross-phase retroactive doc-lock via grep-able sentinel string (Re-locked in Phase 6 Q-N)"
key-files:
  created: []
  modified:
    - "packages/lmstudio-adapter/src/factory-config.schema.json"
    - ".planning/phases/05-review-repair-loop/05-CONTEXT.md"
decisions:
  - "Schema description fields explicitly call out CLI override precedence (CLI > config > built-in default) and the no-auto-fallback rule (Q-06) so future operators reading the schema directly can't miss it."
  - "workSlicing nested under executionCoordination (not a sibling) — matches the Q-15 model that work-slicing is one of two trigger modes inside the single executionCoordination preset, not its own pile."
  - "JSON key uses camelCase `executionCoordination` to match TypeScript field names; the FactoryPileKind discriminator string `execution-coordination` is documented in the description field."
metrics:
  duration: "~5m wall"
  completed: "2026-04-28"
  tasks_completed: 2
  files_modified: 2
---

# Phase 6 Plan 02: Wave 0 — Config schema + Phase 5 retroactive annotation Summary

Wave 0 part B — extended `factory-config.schema.json` with the `piles.{planning,review,executionCoordination}.mode` block (Q-04) and landed the highest-risk doc artifact in the phase: the `Re-locked in Phase 6 Q-14` annotation on Phase 5 CONTEXT Q-10.

## What Shipped

### Task 1 — `piles` block in `factory-config.schema.json` (commit 48e330e)

Added a top-level `piles` object property with three sub-blocks (`planning`, `review`, `executionCoordination`). Each sub-block has:

- `mode: enum ["fixture", "live"]` with `default: "fixture"` (Q-05).
- Optional `fixturePath: string`.
- `additionalProperties: false`.

`executionCoordination` additionally carries `workSlicing.{maxTargetFiles=3, maxEstimatedTurns=5}` per Q-15 / RESEARCH defaults. `piles` itself is `additionalProperties: false` and not in the top-level `required` array (additive, optional — pre-existing configs remain valid).

Description strings on each `mode` enum reference the CLI override flags (`--planning-mode`, `--review-mode`, `--exec-coord-mode`) and the precedence order (CLI > config > built-in default). Top-level `piles.description` calls out Q-06's no-auto-fallback rule explicitly so operators reading the schema directly understand that live failure → no-admission refusal, never silent fixture substitution.

### Task 2 — Phase 5 Q-10 retroactive annotation (commit da454e0)

Inserted a blockquote annotation immediately after Phase 5 Q-10's `**Status:** Decided.` line containing the literal sentinel `Re-locked in Phase 6 Q-14 (2026-04-27):` and the directive: ship `ModelReviewer` interface + fixture passthrough only; the real impl is `createReviewPileModelReviewer()` in Phase 6. Cross-references both `.planning/phases/06-live-dogpile-piles/06-CONTEXT.md` Q-14 and `06-05-review-pile-reviewer-PLAN.md`. No other Phase 5 content modified (`git diff --stat` shows 2 insertions, 0 deletions).

## Verification Performed

- `node -e "..."` schema assertion script (from plan acceptance criteria) — exits 0, prints `schema ok`.
- `grep -q '"adapters"'` confirms existing adapters block intact.
- `grep -q "Re-locked in Phase 6 Q-14"` and `grep -q "createReviewPileModelReviewer"` both succeed against Phase 5 CONTEXT.
- `pnpm --filter @protostar/lmstudio-adapter build` — passes.
- `pnpm --filter @protostar/lmstudio-adapter test` — 66/66 tests pass.
- `pnpm run verify` (root) — exit 0 across all workspaces (initial flake on first run resolved on rerun; final run clean).

## Deviations from Plan

None — plan executed exactly as written. Both tasks landed with the literal sentinel strings and structural shape demanded by the plan's acceptance criteria. No Rule 1/2/3 fixes triggered; no Rule 4 architectural decisions surfaced.

## Threat Surface Notes

The schema mitigations for T-6-10 (config tampering / mode bypass) are now in place: `additionalProperties: false` on `piles` and every sub-block, fixed `enum` on `mode`, no `required` on `piles` (so absence is valid → built-in defaults apply). The Wave 3 Plan 07 loader is the next hop and will validate operator config against this schema.

The annotation mitigates T-6-11 (Phase 5 ships Qwen-judge adapter without retroactive lock visibility): the grep-able sentinel `Re-locked in Phase 6 Q-14` is now present in Phase 5 CONTEXT, and Phase 5 plan executors / reviewers will see it before reaching Q-10's Note for planner section.

No new threat flags introduced — the schema additions are pure declarative contract; no new code paths, no new trust boundaries.

## Self-Check: PASSED

- FOUND: packages/lmstudio-adapter/src/factory-config.schema.json (with `"piles"` block)
- FOUND: .planning/phases/05-review-repair-loop/05-CONTEXT.md (with `Re-locked in Phase 6 Q-14` and `createReviewPileModelReviewer`)
- FOUND: commit 48e330e (Task 1 — schema)
- FOUND: commit da454e0 (Task 2 — annotation)
