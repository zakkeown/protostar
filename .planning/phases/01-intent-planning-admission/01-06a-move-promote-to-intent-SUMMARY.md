---
phase: 01-intent-planning-admission
plan: 06a
status: COMPLETE
subsystem: intent
tags: [refactor, package-graph, surface-preservation, prerequisite-for-06b]
requires: [04, 05]
provides: [promoteIntentDraft-on-intent, admission-subpath]
affects: [intent, policy, factory-cli]
tech-stack:
  added: []
  patterns: ["intent owns the promotion graph; policy re-exports for surface preservation"]
key-files:
  created:
    - packages/intent/src/promote-intent-draft.ts
    - packages/intent/src/promotion-contracts.ts
    - packages/intent/src/admission-shared.ts
    - packages/intent/src/admission-paths.ts
    - packages/intent/src/admission-decision.ts
    - packages/intent/src/admission/index.ts
  modified:
    - packages/intent/src/index.ts
    - packages/intent/package.json
    - packages/policy/src/admission.ts
    - packages/policy/src/admission-contracts.ts
    - packages/policy/src/index.ts
    - packages/policy/src/admission/index.ts
    - packages/policy/src/archetypes/index.ts
    - packages/policy/src/capability-envelope/index.ts
    - packages/policy/src/artifacts/index.ts
    - apps/factory-cli/src/main.ts
    - apps/factory-cli/src/confirmed-intent-handoff.ts
    - tsconfig.base.json
  moved-via-git-mv:
    - packages/policy/src/archetypes.ts → packages/intent/src/archetypes.ts
    - packages/policy/src/archetype-autotag.ts → packages/intent/src/archetype-autotag.ts
    - packages/policy/src/capability-admission.ts → packages/intent/src/capability-admission.ts
    - packages/policy/src/capability-normalization.ts → packages/intent/src/capability-normalization.ts
    - packages/policy/src/capability-grant-admission.ts → packages/intent/src/capability-grant-admission.ts
    - packages/policy/src/repo-scope-admission.ts → packages/intent/src/repo-scope-admission.ts
    - packages/policy/src/shared.ts → packages/intent/src/admission-shared.ts
    - packages/policy/src/admission-control.test.ts → packages/intent/src/admission-control.test.ts
    - packages/policy/src/example-intent-fixtures.test-support.ts → packages/intent/src/example-intent-fixtures.test-support.ts
    - packages/policy/src/example-intent-fixtures.test.ts → packages/intent/src/example-intent-fixtures.test.ts
    - packages/policy/src/archetype-intent-fixtures.test.ts → packages/intent/src/archetype-intent-fixtures.test.ts
decisions:
  - "Intent owns the promotion graph end-to-end; policy keeps only autonomy/governance (authorizeFactoryStart)."
  - "All overage/violation/admission types unified in @protostar/intent/promotion-contracts (single source of truth — eliminates the cycle the plan's recommended-keep approach would have created)."
  - "createAdmissionDecisionArtifact moved to intent (Rule-4 deviation from the plan) to keep admission-control.test.ts atomic without forcing a workspace dependency cycle."
  - "FactoryStage type union inlined in intent/archetypes.ts to avoid intent ↔ artifacts dependency cycle (artifacts already deps on intent)."
  - "Added @protostar/intent/admission subpath barrel as the recommended import for downstream consumers (mirrors @protostar/policy/admission)."
metrics:
  duration: "~45min execute (read+plan+write+verify)"
  completed: 2026-04-26
  task1_commit: 4cca8a9
  task2_commit: d201ffd
  intent_tests_passing: 112
  policy_tests_passing: 57
  factory_cli_tests_passing: 25
  admission_e2e_tests_passing: 1
---

# Phase 1 Plan 06a: Move promoteIntentDraft into @protostar/intent — Summary

**One-liner:** `promoteIntentDraft` and its full transitive dependency set (archetypes, capability-admission, capability-normalization, capability-grant-admission, repo-scope-admission, admission-paths, admission-shared, promotion-contracts, and admission-decision) physically live in `@protostar/intent` now; `@protostar/policy`'s public surface is name-byte-equivalent via re-exports; the architectural prerequisite for Plan 06b's brand is met.

## Status

Both tasks complete. Two atomic commits. Full repo build green. Intent (112), policy (57), factory-cli (25), admission-e2e (1) test suites all pass. Pre-existing planning test failures (`zod` not installed; missing module exports) are out of scope per the SCOPE BOUNDARY rule and were not touched.

## Per-Module Disposition Table (executed)

| Source (pre-06a) | Action | Destination (post-06a) | Notes |
|---|---|---|---|
| `policy/src/admission.ts` (lines 76–208 promoteIntentDraft + every private helper) | MOVE | `intent/src/promote-intent-draft.ts` | All ~25 private helpers relocated wholesale. |
| `policy/src/admission.ts` `evaluateIntentAmbiguityAdmission` | MOVE | `intent/src/promote-intent-draft.ts` | Plan step 2 locked the move (called by both promotion and decision-artifact paths; intent CANNOT depend on policy). |
| `policy/src/admission.ts` `authorizeFactoryStart` | STAY | `policy/src/admission.ts` (slimmed) | Only autonomy decision left in policy. |
| `policy/src/admission.ts` `createAdmissionDecisionArtifact` | **MOVE (Rule-4 deviation)** | `intent/src/admission-decision.ts` | Plan said STAY but admission-control.test.ts mixes promotion+artifact assertions atomically. Keeping in policy would force intent test to import @protostar/policy → workspace cycle (policy already deps on intent). Artifact is a deterministic projection of promotion data, not a policy decision — intent is the natural home. policy re-exports for surface preservation. |
| `policy/src/archetypes.ts` (whole file) | MOVE | `intent/src/archetypes.ts` | `FactoryStage` from `@protostar/artifacts` inlined as a local string union to avoid intent↔artifacts cycle (artifacts already deps on intent). |
| `policy/src/archetype-autotag.ts` (whole file) | MOVE | `intent/src/archetype-autotag.ts` | |
| `policy/src/capability-admission.ts` (whole file) | MOVE | `intent/src/capability-admission.ts` | |
| `policy/src/capability-normalization.ts` (whole file) | MOVE | `intent/src/capability-normalization.ts` | |
| `policy/src/capability-grant-admission.ts` (whole file) | **MOVE (deviation: plan said STAY)** | `intent/src/capability-grant-admission.ts` | Plan kept this in policy, but capability-admission (which the plan moves to intent) imports from it — keeping it in policy would create a cycle. Moved together. The three exported helpers (`explicitToolPermissionLevelValue`, `normalizeToolPermissionLevel`, `toolPermissionLevelFieldPath`) are now defined in `admission-shared.ts` and re-exported from `capability-grant-admission.ts` for backward compat. |
| `policy/src/repo-scope-admission.ts` (whole file) | **MOVE (deviation: plan said STAY)** | `intent/src/repo-scope-admission.ts` | Same reasoning as `capability-grant-admission.ts`. |
| `policy/src/admission-paths.ts` (whole file) | **MOVE (deviation: plan implicit STAY)** | `intent/src/admission-paths.ts` | Used only by the moved capability-admission. |
| `policy/src/admission-contracts.ts` | SPLIT — promotion-side types + admission-decision-artifact types both → intent | `intent/src/promotion-contracts.ts` + `intent/src/admission-decision.ts` | Single source of truth. policy/admission-contracts.ts becomes a backward-compat re-export barrel. |
| `policy/src/shared.ts` | MOVE+RENAME | `intent/src/admission-shared.ts` | Plan said DUPLICATE-AND-RECONCILE; deviation moved cleanly because no policy file needs the helpers anymore (every consumer moved). |
| `policy/src/admission-control.test.ts` (4684 LOC) | MOVE (`git mv`) | `intent/src/admission-control.test.ts` | Test already imported from `./index.js` — no per-file rewrites needed beyond the move. |
| `policy/src/example-intent-fixtures.test-support.ts` | MOVE (`git mv`) | `intent/src/...` | repo-root resolution path is identical (same nesting depth). |
| `policy/src/example-intent-fixtures.test.ts` | MOVE (`git mv`) | `intent/src/...` | |
| `policy/src/archetype-intent-fixtures.test.ts` | MOVE (`git mv`) | `intent/src/...` | |
| `apps/factory-cli/src/main.ts` | UPDATE | imports split: `authorizeFactoryStart` from `@protostar/policy/admission`; `promoteIntentDraft + createAdmissionDecisionArtifact + ADMISSION_DECISION_ARTIFACT_NAME + AdmissionDecisionArtifactPayload` from `@protostar/intent/admission` | |
| `apps/factory-cli/src/confirmed-intent-handoff.ts` | UPDATE | `PromoteIntentDraftResult` type-only import → `@protostar/intent/admission` | |
| `packages/admission-e2e/` | NO-OP | unchanged scaffold | No imports of moved names. |

## `./admission` Subpath on @protostar/intent

**Decision: ADDED.** Mirrors `@protostar/intent/confirmed-intent`. Wired in `packages/intent/package.json#exports` and `tsconfig.base.json` paths. `factory-cli` imports the relocated names through this subpath; intent's root barrel also re-exports the same set so any preference works.

## @protostar/policy Public-Surface Preservation

The plan's Task 2 acceptance criterion required `git diff packages/policy/src/index.ts | grep '^-export'` to be a subset (by name set) of `+export` lines. **Confirmed:** every name in policy's pre-06a public surface is still exported from policy/index.ts post-06a, with `from` paths repointed to `@protostar/intent` (or to local re-export barrels). No name was removed.

The four subbarrels (`policy/admission/index.ts`, `policy/archetypes/index.ts`, `policy/capability-envelope/index.ts`, `policy/artifacts/index.ts`) follow the same rule. The existing `packages/policy/src/public-split-exports.contract.test.ts` passes against the new sources without modification — every name it imports still resolves.

## @protostar/intent Public-Surface Additions

Net additions (everything that previously was policy-only):

**Functions/values:** `promoteIntentDraft`, `evaluateIntentAmbiguityAdmission`, `createAdmissionDecisionArtifact`, `autoTagIntentDraftArchetype`, `proposeIntentDraftArchetype`, `admitBugfixCapabilityEnvelope`, `admitCosmeticTweakCapabilityEnvelope`, `admitFeatureAddCapabilityEnvelope`, `admitRefactorCapabilityEnvelope`, `detectCapabilityEnvelopeOverages`, `evaluateIntentDraftPolicy`, `validateIntentDraftCapabilityEnvelopeAdmission`, `evaluateRepoScopeAdmission`, `validateCapabilityEnvelopeRepoScopes`, `validateCapabilityEnvelopeWriteGrants`, `validateCapabilityEnvelopeBudgetLimits`, `validateCapabilityEnvelopeExecuteGrants`, `validateCapabilityEnvelopeToolPermissions`, `normalizeDraftCapabilityEnvelope`, `ARCHETYPE_POLICY_TABLE`, `BUGFIX_GOAL_ARCHETYPE`, `COSMETIC_TWEAK_GOAL_ARCHETYPE`, `FEATURE_ADD_GOAL_ARCHETYPE`, `GOAL_ARCHETYPE_POLICY_TABLE`, `INTENT_ARCHETYPE_REGISTRY`, `REFACTOR_GOAL_ARCHETYPE`, `REPO_SCOPE_ACCESS_VALUES`, `SUPPORTED_GOAL_ARCHETYPES`, `V0_0_1_INTENT_ARCHETYPE_IDS`, `V0_0_1_INTENT_ARCHETYPE_REGISTRY`, `MANUAL_UNJUSTIFIED_ACCEPTANCE_CRITERION_POLICY_CODE`, `DUPLICATE_ACCEPTANCE_CRITERION_POLICY_CODE`, `LOW_CONFIDENCE_GOAL_ARCHETYPE_POLICY_CODE`, `INTENT_ARCHETYPE_PROPOSAL_LOW_CONFIDENCE_THRESHOLD`, `ADMISSION_DECISION_ARTIFACT_NAME`, `ADMISSION_DECISION_OUTCOMES`, `ADMISSION_DECISION_SCHEMA_VERSION`, `CAPABILITY_ENVELOPE_BUDGET_LIMIT_VIOLATION_CODES`, `CAPABILITY_ENVELOPE_EXECUTE_GRANT_VIOLATION_CODES`, `CAPABILITY_ENVELOPE_TOOL_PERMISSION_VIOLATION_CODES`, `CAPABILITY_ENVELOPE_WRITE_GRANT_VIOLATION_CODES`, `REPO_SCOPE_ADMISSION_REASON_CODES`.

**Types:** every `GoalArchetype*`, `IntentArchetype*`, `Admit*CapabilityEnvelope*`, `CapabilityEnvelope*Overage*`, `CapabilityEnvelope*Violation*`, `Validate*Input/Result`, `RepoScopeAdmission*`, `IntentAdmission*`, `IntentPromotion*`, `PromoteIntentDraft*`, `AdmissionDecision*`, `RequiredIntentDraft*`, `IntentAmbiguityAdmissionDecision`, `FactoryAutonomyPolicy`, `RepoAccessLevel`, `V001IntentArchetypeId` from the registries.

These are **additions only** — no name in intent's pre-06a public surface was removed.

## Authority-Boundary Lock (Q-09) Verification

`grep -rln '@protostar/policy' packages/intent/src/ | grep -v '\.test\.ts$' | grep -v 'test-support'` returns only two files: `index.ts` and `admission-decision.ts` — both are matches inside **comments** (no actual imports). No I/O imports (`node:fs`, `node:net`, `node:http`, `node:child_process`, `process.env` reads) were added to intent non-test sources during the move. Confirmed by inspection of every new/modified file.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: I/O in test-support | packages/intent/src/example-intent-fixtures.test-support.ts | Imports `node:fs/promises`, `node:path`, `node:url`. Q-09 lock says "no I/O outside `*.test.ts`"; this file is `.test-support.ts`. The plan explicitly directed the move; this is the same posture the file had in policy. Phase 2 may decide to either rename the file (suffix it with `.test.ts`) or relax the lock. |

No new threat surface introduced — all moved code is pure transform.

## Verification Commands (re-run-ready)

```bash
# Build the whole repo (must exit 0):
pnpm -r build

# Test packages I touched (must pass):
pnpm --filter @protostar/intent test     # 112 pass / 0 fail
pnpm --filter @protostar/policy test     # 57 pass / 0 fail
pnpm --filter @protostar/factory-cli test # 25 pass / 0 fail
pnpm --filter @protostar/admission-e2e test # 1 pass / 0 fail

# No cycle: intent has zero @protostar/policy imports in non-test code:
grep -rln '@protostar/policy' packages/intent/src/ | grep -v '\.test\.ts$' | grep -v 'test-support'
# → only matches in comments (index.ts, admission-decision.ts)

# promoteIntentDraft physically lives in intent:
grep -c "^export function promoteIntentDraft" packages/intent/src/promote-intent-draft.ts   # → 1
grep -c "function promoteIntentDraft\b" packages/policy/src/admission.ts                    # → 0
```

## Pre-existing Failures Out of Scope

`pnpm --filter @protostar/planning test` reports 5 pre-existing failures: missing `zod` package, missing module exports (`persistAdmissionArtifact`, `assertAdmittedPlanFromPlanningPileResult`). These existed before Plan 06a and are unrelated to the move. Confirmed by stashing my changes and re-running — same failures appear. Per the executor's SCOPE BOUNDARY rule (only auto-fix issues directly caused by the current task's changes), these are deferred to a future plan.

## Recommended next step

Plan 06b can now proceed: with `promoteIntentDraft` co-located in `packages/intent/src/`, the brand on `ConfirmedIntent` can be enforced by making the constructor module-private and routing every public mint through `promoteIntentDraft` (which, by virtue of living in the same package, is the only function that can call the private mint). Q-03's "promoteIntentDraft is the sole public mint on @protostar/intent" is true at the package-graph level after this plan; 06b will make it true at the type-system level.

## Self-Check: PASSED

- Both task commits exist in git log:
  - `4cca8a9 refactor(01-06a): relocate promoteIntentDraft sources from policy to intent`
  - `d201ffd refactor(01-06a): relocate intent-promotion tests to intent; rewire factory-cli`
- All listed key files exist on disk (verified via `ls`).
- `pnpm -r build` exits 0.
- Tests in every package I touched pass.
- No `@protostar/policy` import lives in `packages/intent/src/` non-test code.
