---
phase: 01-intent-planning-admission
plan: 06
status: BLOCKED
subsystem: intent
tags: [brand, confirmed-intent, blocker, architectural-decision]
requires: [04, 05]
provides: []
affects: [intent, policy, planning, factory-cli, admission-e2e]
key-files:
  created: []
  modified: []
decisions: []
metrics:
  duration: blocked-pre-execution
  completed: never
---

# Phase 1 Plan 06: Branded ConfirmedIntent — BLOCKED

**One-liner:** Execution halted pre-Task-1 — plan's stated public-surface location for `promoteIntentDraft` (`@protostar/intent`) conflicts with the current package boundary (lives in `@protostar/policy`). Resolution requires an architectural decision (Rule 4) that exceeds the plan's autonomous scope.

## Status

**No tasks executed. No commits made. No files modified.**

The plan was read end-to-end, the codebase was inspected to verify task feasibility, and a plan-vs-reality conflict was surfaced before any code was written. This SUMMARY exists as the blocker artifact requested by the orchestrator.

## Blocker

### What the plan asserts

The plan's must-have truths and acceptance criteria explicitly place `promoteIntentDraft` on `@protostar/intent`'s public surface:

- **Truth (must_haves):** "promoteIntentDraft is the SOLE function in `@protostar/intent`'s public surface that produces a ConfirmedIntent value."
- **Action 4:** "Verify packages/intent/src/index.ts barrel ... Public exports of the ConfirmedIntent module: ConfirmedIntent (type), SignatureEnvelope (type), promoteIntentDraft (value), assertConfirmedIntent (value), parseConfirmedIntent (value, with narrowed return type)."
- **Acceptance criterion:** `grep -c "promoteIntentDraft" packages/intent/src/index.ts >= 1`.
- **Action 1e:** "Update promoteIntentDraft to call mintConfirmedIntent on the success branch" — `mintConfirmedIntent` is module-private to `packages/intent/src/confirmed-intent.ts`, so the caller must be co-located in that module.
- **Plan 09 line 83 (downstream):** "packages/intent/src/index.ts (public API: promoteIntentDraft, IntentDraft type, ConfirmedIntentPromotionResult discriminated shape)" — confirms the planner sees `promoteIntentDraft` as an `@protostar/intent` export.
- **Contract test (Task 2):** `import * as IntentPublicApi from "@protostar/intent"` and assert `MintingKeys === "promoteIntentDraft"`.

### What the codebase actually has

`promoteIntentDraft` is a **130-LOC orchestrator in `@protostar/policy/src/admission.ts:76`**. It currently calls `defineConfirmedIntent` (imported from `@protostar/intent`) on the success branch — i.e. policy mints, not intent. The function depends on:

- `archetype-autotag.ts` (`proposeIntentDraftArchetype`)
- `capability-admission.ts` (`admitBugfixCapabilityEnvelope`, `admitCosmeticTweakCapabilityEnvelope`, `admitFeatureAddCapabilityEnvelope`, `admitRefactorCapabilityEnvelope`, `validateIntentDraftCapabilityEnvelopeAdmission`)
- `capability-normalization.ts` (`normalizeDraftCapabilityEnvelope`)
- `archetypes.ts` (`BUGFIX_GOAL_ARCHETYPE`, `COSMETIC_TWEAK_GOAL_ARCHETYPE`, `FEATURE_ADD_GOAL_ARCHETYPE`, `REFACTOR_GOAL_ARCHETYPE`, `SUPPORTED_GOAL_ARCHETYPES`)
- `admission-contracts.ts` (`PromoteIntentDraftInput`, `PromoteIntentDraftResult`, `IntentAdmissionPolicyFinding`, `IntentPromotionFailureDetails`, ~30+ types)
- `shared.ts` (`formatAmbiguityScore`, `normalizeText`, `roundScore`, `stableHash`, `uniqueBy`, `uniqueOrdered`)

Forty-plus call sites reference it across `packages/policy/src/admission-control.test.ts` (4684 lines), `archetype-intent-fixtures.test.ts`, `example-intent-fixtures.test-support.ts`, `public-split-exports.contract.test.ts`, and `packages/policy/src/index.ts`.

### Why it's a Rule 4 architectural decision

Three plausible resolutions; all materially exceed Plan 06's stated scope and have different blast radii:

| Option | What changes | Blast radius |
|--------|--------------|--------------|
| **A.** Move `promoteIntentDraft` + every policy dependency above into `@protostar/intent`. | Inverts the package dependency graph. Touches ~10 modules across `intent` and `policy`. | Largest |
| **B.** Re-export `policy.promoteIntentDraft` from `@protostar/intent`'s barrel. | Adds `@protostar/intent` → `@protostar/policy` dependency (currently `intent` has zero workspace deps). Hard cycle: `policy` already imports from `intent`. | Smallest LOC; biggest graph violation (cycle). |
| **C.** Rename `intent.defineConfirmedIntent` → `intent.promoteIntentDraft` (private mint becomes the public function); rename `policy.promoteIntentDraft` → e.g. `admitIntentDraft`. Intent's `promoteIntentDraft` keeps its current "take pre-validated input, freeze, brand, return ConfirmedIntent" signature; policy's renamed function continues to orchestrate validation + ambiguity + capability admission and calls `intent.promoteIntentDraft` on the success branch. | ~40 import-site renames in policy + every consumer (including 4684-line admission-control.test.ts). | Closest match to plan's literal wording. |

A 4th option (expose private mint via `@protostar/intent/internal` so policy keeps `promoteIntentDraft` as-is and retarget the contract test at `@protostar/policy`'s surface) was rejected: it silently relocates the public-surface boundary the planner explicitly named, which is exactly what threat model T-01-06-02 is meant to prevent.

The plan's `<threat_model>` (T-01-06-01..03) and prose all only fully cohere under Option C. But C requires re-planning: the plan declares itself two-task and autonomous, while C touches the policy package's public API and ~40 test files — outside the file-modification list in the plan's frontmatter.

## What was inspected (no edits)

- `packages/intent/src/confirmed-intent.ts` — current `defineConfirmedIntent`, `parseConfirmedIntent`, `assertConfirmedIntent` shape; no brand, no schemaVersion, no signature.
- `packages/intent/src/confirmed-intent/index.ts` — re-exports the three functions above.
- `packages/intent/src/confirmed-intent-readonly.contract.ts` — `IsReadonlyField<...>` chain over the 13 current top-level keys.
- `packages/intent/src/confirmed-intent-immutability.test.ts` — runtime-mutation tests via `defineConfirmedIntent`.
- `packages/intent/src/index.ts` — barrel currently re-exports `assertConfirmedIntent`, `defineConfirmedIntent`, `parseConfirmedIntent`. No `promoteIntentDraft`.
- `packages/intent/src/public-split-exports.contract.test.ts` — runtime test exercising `defineConfirmedIntent`/`parseConfirmedIntent` via subpath imports; needs to be updated for the brand once direction is chosen.
- `packages/intent/package.json` — `exports` map already wires `./confirmed-intent`; no `./internal`.
- `packages/policy/src/admission.ts` — `promoteIntentDraft` (lines 76–208) and its dependency import block (lines 1–22).
- `packages/policy/src/index.ts` — re-exports `promoteIntentDraft`, every admission-contracts type used by it, and the rest of policy's surface.
- `packages/admission-e2e/{package.json,tsconfig.json,src}` — Plan 05's empty scaffold; no contract tests yet.
- `.planning/phases/01-intent-planning-admission/01-05-admission-e2e-scaffold-SUMMARY.md` line 62 — pre-records that Plan 06 will pin "only `promoteIntentDraft` mints `ConfirmedIntent`" cross-package.
- `.planning/phases/01-intent-planning-admission/01-09-parameterized-admission-e2e-PLAN.md` line 83 — the downstream plan also assumes `promoteIntentDraft` is on `@protostar/intent`'s public surface.

Cross-references in `.planning/phases/01-intent-planning-admission/` confirm this is a planning-time gap, not a fixable mid-task deviation.

## Recommended next step

Re-plan: bounce Plan 06 back through `/gsd-plan-phase` (or an equivalent re-plan) with the package-boundary question answered explicitly. The decision input the user owes the planner is one of:

1. **A** — Move policy's `promoteIntentDraft` + listed dependencies into `@protostar/intent`. Accept the package-graph inversion. Re-plan as 2–3 plans (policy refactor + intent brand + contract pin).
2. **B** — Re-export from intent's barrel. Resolve the resulting cycle by moving the policy types `promoteIntentDraft` returns into `@protostar/intent` first.
3. **C** — Rename split. `intent.promoteIntentDraft` is the brand-mint primitive; `policy.admitIntentDraft` (or similar) is the orchestrator that calls it. Re-plan to add a "rename + re-import-site sweep" task before the brand is added, so the existing 40-site test churn lands in its own commit.

Once chosen, the existing Plan 06 frontmatter `files_modified` list and Task 1 step 5 ("update consumers") become accurate, and execution can proceed.

## Self-Check: PASSED

- No commits attempted; `git log --oneline -1` shows `e19f5aa docs(01-05): complete admission-e2e scaffold plan` (HEAD unchanged from before Plan 06 execution started).
- No source files modified; `git status --short packages/intent packages/policy packages/admission-e2e` shows no `M` entries.
- This SUMMARY is the only file written by Plan 06 execution.
