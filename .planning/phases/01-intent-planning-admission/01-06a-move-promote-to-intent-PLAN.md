---
phase: 01-intent-planning-admission
plan: 06a
type: execute
wave: 2
depends_on: [04, 05]
files_modified:
  - packages/intent/src/promote-intent-draft.ts
  - packages/intent/src/admission-policy-findings.ts
  - packages/intent/src/archetypes.ts
  - packages/intent/src/archetype-autotag.ts
  - packages/intent/src/capability-admission.ts
  - packages/intent/src/capability-normalization.ts
  - packages/intent/src/promotion-contracts.ts
  - packages/intent/src/admission-shared.ts
  - packages/intent/src/index.ts
  - packages/intent/src/admission/index.ts
  - packages/intent/package.json
  - packages/intent/tsconfig.json
  - packages/policy/src/admission.ts
  - packages/policy/src/admission-contracts.ts
  - packages/policy/src/archetypes.ts
  - packages/policy/src/archetype-autotag.ts
  - packages/policy/src/capability-admission.ts
  - packages/policy/src/capability-normalization.ts
  - packages/policy/src/shared.ts
  - packages/policy/src/index.ts
  - packages/policy/src/admission/index.ts
  - packages/policy/src/capability-grant-admission.ts
  - packages/policy/src/repo-scope-admission.ts
  - packages/policy/src/admission-paths.ts
  - packages/policy/src/public-split-exports.contract.test.ts
  - packages/policy/src/admission-control.test.ts
  - packages/policy/src/example-intent-fixtures.test-support.ts
  - packages/policy/src/example-intent-fixtures.test.ts
  - packages/policy/src/archetype-intent-fixtures.test.ts
  - packages/intent/src/admission-control.test.ts
  - packages/intent/src/example-intent-fixtures.test-support.ts
  - packages/intent/src/example-intent-fixtures.test.ts
  - packages/intent/src/archetype-intent-fixtures.test.ts
  - packages/intent/src/public-split-exports.contract.test.ts
  - apps/factory-cli/src/main.ts
  - apps/factory-cli/src/confirmed-intent-handoff.ts
autonomous: true
requirements:
  - INTENT-02
must_haves:
  truths:
    - "promoteIntentDraft and its private intent-promotion helpers live in @protostar/intent (sources, not just re-exports)"
    - "@protostar/intent's public surface exports promoteIntentDraft as a value, with PromoteIntentDraftInput/PromoteIntentDraftResult as types"
    - "@protostar/policy's public-surface stays bytewise-equivalent for surviving exports: authorizeFactoryStart, createAdmissionDecisionArtifact, evaluateIntentAmbiguityAdmission, the four admit*CapabilityEnvelope functions, evaluateIntentDraftPolicy, validateIntentDraftCapabilityEnvelopeAdmission, detectCapabilityEnvelopeOverages, ARCHETYPE_POLICY_TABLE, GoalArchetype, IntentAdmissionPolicyFinding, AdmissionDecisionArtifactPayload, etc. (re-exported from intent where source moved)"
    - "Package dependency graph: @protostar/policy depends on @protostar/intent (already true); @protostar/intent has zero workspace deps that include policy (no cycle)"
    - "No I/O imports added to packages/intent/src/ outside *.test.ts (authority-boundary lock from Q-09)"
    - "pnpm -r build && pnpm -r test pass on a clean install"
  artifacts:
    - path: packages/intent/src/promote-intent-draft.ts
      provides: "promoteIntentDraft orchestrator + every private helper relocated from policy/admission.ts (createPromotionFailureDetails, applyAdmissionVerdict, applyAdmissionAmbiguityBumps, buildIntentAdmissionOutputSections, buildIntentAdmissionHardZeroReasons, manualAcceptanceCriterionPolicyFindings, duplicateAcceptanceCriterionPolicyFindings, lowConfidenceArchetypeProposalPolicyFindings, dedupeMissingFieldDetections, dedupeRequiredClarifications, dedupeHardZeroReasons, requiredFieldCheckPassed, capabilityEnvelopeRequiredFieldsPassed, findingRaisesAdmissionAmbiguity, hardZeroReasonMessage, isDuplicateAcceptanceCriterionDiagnostic, createPromotedIntentId, selectConfirmedIntentGoalArchetype, grantCapabilityEnvelopeForPromotion, optionalSourceDraftIdProperty, optionalDraftTextProperty, normalizeStringList, policyFindingAdmissionIssueFields, policyFindingClarificationRationale, isAuthorityOverageClarification)"
      contains: "promoteIntentDraft"
    - path: packages/intent/src/promotion-contracts.ts
      provides: "Promotion-only types peeled off from policy/admission-contracts.ts: PromoteIntentDraftInput, PromoteIntentDraftResult, IntentPromotionFailureDetails, IntentPromotionFailureState, RequiredIntentDraftFieldCheck (re-export), RequiredIntentDraftDimensionCheck (re-export), IntentAdmissionPolicyFinding, IntentAdmissionPolicyFindingCode, IntentAdmissionAcceptanceCriterionReference, IntentAdmissionIssueCode, IntentAdmissionIssueReference, IntentAdmissionMissingFieldDetection, IntentAdmissionMissingFieldDetectionSource, IntentAdmissionRequiredClarification, IntentAdmissionRequiredClarificationSource, IntentAdmissionHardZeroReason, IntentAdmissionHardZeroReasonSource, IntentAdmissionHardZeroDimensionId, IntentAdmissionOutputContractSections, IntentAmbiguityAdmissionDecision, MANUAL_UNJUSTIFIED_ACCEPTANCE_CRITERION_POLICY_CODE, DUPLICATE_ACCEPTANCE_CRITERION_POLICY_CODE, LOW_CONFIDENCE_GOAL_ARCHETYPE_POLICY_CODE, INTENT_ARCHETYPE_PROPOSAL_LOW_CONFIDENCE_THRESHOLD"
    - path: packages/intent/src/archetypes.ts
      provides: "Goal-archetype constants, GoalArchetype type, ARCHETYPE_POLICY_TABLE, INTENT_ARCHETYPE_REGISTRY, all GoalArchetype* policy types — relocated wholesale from policy"
    - path: packages/intent/src/archetype-autotag.ts
      provides: "autoTagIntentDraftArchetype + proposeIntentDraftArchetype — relocated wholesale"
    - path: packages/intent/src/capability-admission.ts
      provides: "admitBugfixCapabilityEnvelope, admitCosmeticTweakCapabilityEnvelope, admitFeatureAddCapabilityEnvelope, admitRefactorCapabilityEnvelope, validateIntentDraftCapabilityEnvelopeAdmission, evaluateIntentDraftPolicy, detectCapabilityEnvelopeOverages — relocated wholesale"
    - path: packages/intent/src/capability-normalization.ts
      provides: "normalizeDraftCapabilityEnvelope — relocated wholesale"
    - path: packages/intent/src/admission-shared.ts
      provides: "Subset of policy/shared.ts the moved code uses: normalizeText, normalizeAuthorityJustification, authorityJustificationField, hasText, isKnownGoalArchetype, isRepoAccess, isRiskLevel, isToolPermissionLevel, formatAllowedPolicyValues, riskRank, uniqueOrdered, uniqueBy, roundScore, formatAmbiguityScore, stableHash. Distinct file from intent's existing shared.ts to keep diff atomic — Plan 06b/Phase 2 may merge later."
    - path: packages/policy/src/admission.ts
      provides: "Slimmed: authorizeFactoryStart, evaluateIntentAmbiguityAdmission, createAdmissionDecisionArtifact (and admissionDecisionOutcomeForPromotion helper) ONLY. promoteIntentDraft and its private helpers are GONE from this file."
    - path: packages/policy/src/admission-contracts.ts
      provides: "Slimmed to admission-decision-artifact concerns only: ADMISSION_DECISION_ARTIFACT_NAME, ADMISSION_DECISION_SCHEMA_VERSION, ADMISSION_DECISION_OUTCOMES, AdmissionDecisionOutcome, AdmissionDecisionGateSummary, AdmissionDecisionAmbiguityDetail, AdmissionDecisionArtifactDetails, AdmissionDecisionArtifactPayload, CreateAdmissionDecisionArtifactInput. All PROMOTION-side types re-exported from @protostar/intent for backward-compat barrel use only."
    - path: packages/policy/src/index.ts
      provides: "Public-surface preservation: every name currently exported MUST remain exported. Names whose source moved are re-exported from @protostar/intent."
  key_links:
    - from: packages/intent/src/promote-intent-draft.ts
      to: packages/intent/src/confirmed-intent.ts
      via: defineConfirmedIntent
      pattern: "defineConfirmedIntent"
    - from: packages/intent/src/index.ts
      to: packages/intent/src/promote-intent-draft.ts
      via: barrel re-export
      pattern: "promoteIntentDraft"
    - from: packages/policy/src/index.ts
      to: "@protostar/intent"
      via: re-export-from for admit*CapabilityEnvelope, archetypes, promotion contracts
      pattern: "from \"@protostar/intent\""
    - from: apps/factory-cli/src/main.ts
      to: "@protostar/intent"
      via: import promoteIntentDraft + PromoteIntentDraftResult from intent (subpath or root)
      pattern: "promoteIntentDraft"
---

<objective>
Relocate `promoteIntentDraft` and its transitive intent-promotion module set from `@protostar/policy` into `@protostar/intent` so that Plan 06b can land the brand on `ConfirmedIntent` with `promoteIntentDraft` co-located in the `intent` package (the only place the module-private mint can be called from). This is the architectural prerequisite that the original Plan 06 BLOCKED on (see `01-06-branded-confirmed-intent-SUMMARY.md`).

Per Q-03 — the locked decision is "promoteIntentDraft is the SOLE function on `@protostar/intent`'s public surface that produces a ConfirmedIntent." This plan implements the package-graph half of that decision (location); 06b implements the type-system half (brand + private mint + admission-e2e contract).

Purpose: Without this move, 06b cannot satisfy its own must-have truth that "promoteIntentDraft is the sole public mint on @protostar/intent." The blocker SUMMARY's Option A is chosen.

Output: `promoteIntentDraft` + transitive deps live under `packages/intent/src/`. `@protostar/policy`'s public surface remains BYTEWISE-EQUIVALENT for every surviving export (re-exports from intent where source moved). All ~40 callsites + the 4684-line `admission-control.test.ts` follow the SUT into intent. `pnpm -r build` and `pnpm -r test` are green.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/01-intent-planning-admission/01-CONTEXT.md
@.planning/phases/01-intent-planning-admission/01-06-branded-confirmed-intent-SUMMARY.md
@.planning/codebase/CONVENTIONS.md
@packages/intent/src/index.ts
@packages/intent/src/confirmed-intent.ts
@packages/intent/package.json
@packages/policy/src/admission.ts
@packages/policy/src/admission-contracts.ts
@packages/policy/src/archetypes.ts
@packages/policy/src/archetype-autotag.ts
@packages/policy/src/capability-admission.ts
@packages/policy/src/capability-normalization.ts
@packages/policy/src/shared.ts
@packages/policy/src/index.ts
@packages/policy/src/admission/index.ts
@packages/policy/package.json
@apps/factory-cli/src/main.ts
@apps/factory-cli/src/confirmed-intent-handoff.ts
</context>

<interfaces>
Per-module disposition decisions (locked for this plan):

| Source (current) | Action | Destination | Rationale |
|---|---|---|---|
| `policy/src/admission.ts` lines 76–208 (`promoteIntentDraft`) + every helper that's only called by promoteIntentDraft (see artifacts list above) | MOVE | `packages/intent/src/promote-intent-draft.ts` | This is the SUT for the brand. |
| `policy/src/admission.ts` `authorizeFactoryStart`, `createAdmissionDecisionArtifact`, `admissionDecisionOutcomeForPromotion`, `evaluateIntentAmbiguityAdmission` | STAY | `policy/src/admission.ts` (slimmed) | Phase 2 governance / autonomy decisions are policy concerns. `evaluateIntentAmbiguityAdmission` stays here (called by createAdmissionDecisionArtifact); intent imports it back. |
| `policy/src/archetypes.ts` (whole file) | MOVE | `packages/intent/src/archetypes.ts` | Required by promoteIntentDraft, capability-admission, archetype-autotag. Other policy files (capability-grant-admission, repo-scope-admission, admission-paths, shared) re-import from intent. |
| `policy/src/archetype-autotag.ts` (whole file) | MOVE | `packages/intent/src/archetype-autotag.ts` | Single in-policy consumer is admission.ts (via promoteIntentDraft, which moves). |
| `policy/src/capability-admission.ts` (whole file) | MOVE | `packages/intent/src/capability-admission.ts` | Required by promoteIntentDraft. policy/index.ts re-exports the public functions from intent. |
| `policy/src/capability-normalization.ts` (whole file) | MOVE | `packages/intent/src/capability-normalization.ts` | Required by promoteIntentDraft. |
| `policy/src/admission-contracts.ts` | SPLIT | promotion-side types → `packages/intent/src/promotion-contracts.ts`; admission-decision-artifact-side types stay in `policy/src/admission-contracts.ts` | createAdmissionDecisionArtifact (stays) needs the artifact types; promoteIntentDraft (moves) needs the promotion types. capability-grant-admission + repo-scope-admission keep using the overage/violation types from policy-side admission-contracts. |
| `policy/src/shared.ts` | DUPLICATE-THEN-RECONCILE | Copy needed helpers into `packages/intent/src/admission-shared.ts`; keep `policy/src/shared.ts` so `capability-grant-admission`, `repo-scope-admission`, `admission-paths` keep their imports. | Avoids forcing every staying-policy file to re-import. The two files become small and similar; reconciling them is a low-risk follow-up. |
| `policy/src/admission-control.test.ts` (4684 lines) | MOVE | `packages/intent/src/admission-control.test.ts` | Test follows SUT. Imports rewritten from `./admission.js` to `./promote-intent-draft.js` and similar. |
| `policy/src/example-intent-fixtures.test-support.ts` + `example-intent-fixtures.test.ts` + `archetype-intent-fixtures.test.ts` | MOVE | `packages/intent/src/...` | All three test promoteIntentDraft / archetype-autotag and follow the SUTs. |
| `policy/src/public-split-exports.contract.test.ts` | UPDATE-IN-PLACE | stays in policy | Pin the surviving policy public surface (re-exported names included). The intent-side public-split contract test gets parallel updates. |
| `apps/factory-cli/src/main.ts` | UPDATE | switches `import { authorizeFactoryStart, promoteIntentDraft } from "@protostar/policy/admission"` → `promoteIntentDraft` from `@protostar/intent`; `authorizeFactoryStart` continues from `@protostar/policy/admission`. | The split mirrors the move. |
| `apps/factory-cli/src/confirmed-intent-handoff.ts` | UPDATE | `import type { PromoteIntentDraftResult } from "@protostar/policy/admission"` → from `@protostar/intent`. | Type follows SUT. |

Public surface preservation strategy for `@protostar/policy`:

`packages/policy/src/index.ts` MUST keep every current export name resolvable. Concretely:
- For names whose source moved (e.g. `promoteIntentDraft`, `admit*CapabilityEnvelope`, `evaluateIntentDraftPolicy`, `validateIntentDraftCapabilityEnvelopeAdmission`, `detectCapabilityEnvelopeOverages`, `autoTagIntentDraftArchetype`, `proposeIntentDraftArchetype`, `ARCHETYPE_POLICY_TABLE`, `BUGFIX_GOAL_ARCHETYPE`, `COSMETIC_TWEAK_GOAL_ARCHETYPE`, `FEATURE_ADD_GOAL_ARCHETYPE`, `REFACTOR_GOAL_ARCHETYPE`, `GOAL_ARCHETYPE_POLICY_TABLE`, `INTENT_ARCHETYPE_REGISTRY`, `REPO_SCOPE_ACCESS_VALUES`, `SUPPORTED_GOAL_ARCHETYPES`, `V0_0_1_INTENT_ARCHETYPE_IDS`, `V0_0_1_INTENT_ARCHETYPE_REGISTRY`, every `GoalArchetype*` type, `IntentArchetype*` types, all promotion-side types from admission-contracts) → policy/index.ts re-exports them from `@protostar/intent` (or a stable subpath like `@protostar/intent/admission`).
- For names that didn't move (`authorizeFactoryStart`, `createAdmissionDecisionArtifact`, `evaluateIntentAmbiguityAdmission`, `PolicyVerdict`, all `AdmissionDecision*` types, all `RepoScopeAdmission*`, `validateCapabilityEnvelope*`, etc.) → unchanged.
- Same applies to `policy/src/admission/index.ts` (subpath barrel) for the names it currently re-exports.

Public surface ADDITIONS on `@protostar/intent`:
- root barrel adds `promoteIntentDraft` (value), `PromoteIntentDraftInput`, `PromoteIntentDraftResult`, `IntentPromotionFailureDetails`, `IntentPromotionFailureState`, plus any other promotion-side names downstream consumers used to import from policy. Optionally expose a `@protostar/intent/admission` subpath if the root barrel grows uncomfortably wide; if so, mirror it on `package.json#exports`.
</interfaces>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Relocate sources — intent gains the modules; policy keeps every public name resolvable</name>
  <read_first>
    - /Users/zakkeown/Code/protostar/packages/policy/src/admission.ts (split point — promoteIntentDraft + helpers move; authorizeFactoryStart + createAdmissionDecisionArtifact + evaluateIntentAmbiguityAdmission stay)
    - /Users/zakkeown/Code/protostar/packages/policy/src/admission-contracts.ts (split point — promotion-side types vs admission-decision-artifact-side types)
    - /Users/zakkeown/Code/protostar/packages/policy/src/archetypes.ts (move whole file)
    - /Users/zakkeown/Code/protostar/packages/policy/src/archetype-autotag.ts (move whole file)
    - /Users/zakkeown/Code/protostar/packages/policy/src/capability-admission.ts (move whole file)
    - /Users/zakkeown/Code/protostar/packages/policy/src/capability-normalization.ts (move whole file)
    - /Users/zakkeown/Code/protostar/packages/policy/src/shared.ts (duplicate the helpers promoteIntentDraft uses into intent/admission-shared.ts; keep this file as-is for capability-grant-admission, repo-scope-admission, admission-paths)
    - /Users/zakkeown/Code/protostar/packages/intent/src/index.ts (root barrel — add new exports)
    - /Users/zakkeown/Code/protostar/packages/intent/package.json (decide whether to add `./admission` subpath; if yes, add to `exports`)
    - /Users/zakkeown/Code/protostar/packages/intent/tsconfig.json (no change expected; verify after move)
  </read_first>
  <action>
    1. **Create the new intent files (copy + rewrite imports — sources, not re-exports):**
       a. `packages/intent/src/archetypes.ts` ← copy of `packages/policy/src/archetypes.ts`. Imports stay relative (`./capability-envelope.js`-style references map to intent's existing `./capability-envelope.js` if applicable; otherwise use `@protostar/intent` self-import — prefer relative `./` siblings inside the same package). The current policy file imports `CapabilityEnvelope` from `@protostar/intent`; that import becomes a relative `./capability-envelope.js` once it lives inside intent.
       b. `packages/intent/src/archetype-autotag.ts` ← copy of `policy` version, with imports from `./archetypes.js`, `./admission-shared.js` (intent-local).
       c. `packages/intent/src/capability-normalization.ts` ← copy, imports from `./admission-shared.js`.
       d. `packages/intent/src/capability-admission.ts` ← copy, imports from `./archetypes.js`, `./admission-shared.js`, `./capability-normalization.js`, `./promotion-contracts.js`.
       e. `packages/intent/src/admission-shared.ts` ← NEW file. Copy from `packages/policy/src/shared.ts` exactly the helpers used by the moved modules: `normalizeText`, `normalizeAuthorityJustification`, `authorityJustificationField`, `hasText`, `isKnownGoalArchetype`, `isRepoAccess`, `isRiskLevel`, `isToolPermissionLevel`, `formatAllowedPolicyValues`, `riskRank`, `uniqueOrdered`, `uniqueBy`, `roundScore`, `formatAmbiguityScore`, `stableHash`. Imports from `./archetypes.js`. Do NOT delete the policy `shared.ts` — capability-grant-admission, repo-scope-admission, and admission-paths still import from it (they stay in policy).
       f. `packages/intent/src/promotion-contracts.ts` ← NEW file. Take from `packages/policy/src/admission-contracts.ts` ONLY the promotion-side declarations: `RequiredIntentDraftFieldCheck`, `RequiredIntentDraftDimensionCheck`, all `IntentAdmissionPolicyFinding*` types, all `IntentAdmissionAcceptanceCriterionReference`, `IntentAdmissionIssueCode`, `IntentAdmissionIssueReference`, `IntentAdmissionMissingFieldDetection*`, `IntentAdmissionRequiredClarification*`, `IntentAdmissionHardZeroReason*`, `IntentAdmissionHardZeroDimensionId`, `IntentAdmissionOutputContractSections`, `IntentAmbiguityAdmissionDecision`, `PromoteIntentDraftInput`, `PromoteIntentDraftResult`, `IntentPromotionFailureDetails`, `IntentPromotionFailureState`, plus the four constants `MANUAL_UNJUSTIFIED_ACCEPTANCE_CRITERION_POLICY_CODE`, `DUPLICATE_ACCEPTANCE_CRITERION_POLICY_CODE`, `LOW_CONFIDENCE_GOAL_ARCHETYPE_POLICY_CODE`, `INTENT_ARCHETYPE_PROPOSAL_LOW_CONFIDENCE_THRESHOLD`. Also include the capability-overage types that promote/capability-admission references (`CapabilityEnvelopeOverage*`, `CapabilityEnvelope*Violation*`, `ValidateCapabilityEnvelope*Input/Result`, `Admit*CapabilityEnvelope*Input/Result`, `*UnsupportedDecision`, `Cosmetic*Grant`, `DetectCapabilityEnvelopeOveragesInput`, `CapabilityEnvelopeOverageDetection`, `ValidateIntentDraftCapabilityEnvelopeAdmissionInput/Result`). Imports `CapabilityEnvelope`, `IntentDraft`, `AcceptanceCriterion*`, `ConfirmedIntent`, `IntentAmbiguityAssessment`, etc. from intent's existing modules (relative `./`).
       g. `packages/intent/src/promote-intent-draft.ts` ← NEW file. Copy `promoteIntentDraft` (lines 76–208) PLUS every private helper from `policy/src/admission.ts` listed in this plan's `must_haves.artifacts.promote-intent-draft.ts.provides` field. Rewrite imports: `defineConfirmedIntent`, ambiguity helpers etc. become relative imports inside intent; `evaluateIntentAmbiguityAdmission` is imported from `@protostar/policy` (intent depends on... wait — check below).

    2. **`evaluateIntentAmbiguityAdmission` placement decision (locked here):** It is called by both `promoteIntentDraft` (moves) and `createAdmissionDecisionArtifact` (stays). Intent CANNOT depend on policy (would create a cycle: policy already deps on intent). Therefore: **MOVE `evaluateIntentAmbiguityAdmission` to intent** (place it inside `promote-intent-draft.ts` as an exported function, OR a new `packages/intent/src/admission-decision.ts`). Policy's `createAdmissionDecisionArtifact` re-imports it from `@protostar/intent`. Update the policy `index.ts` re-export to source from intent.

    3. **Update intent's `packages/intent/src/index.ts`:** Add the following named exports (preserve existing entries unchanged):
       ```ts
       export { promoteIntentDraft, evaluateIntentAmbiguityAdmission } from "./promote-intent-draft.js";
       export { autoTagIntentDraftArchetype, proposeIntentDraftArchetype } from "./archetype-autotag.js";
       export { admitBugfixCapabilityEnvelope, admitCosmeticTweakCapabilityEnvelope, admitFeatureAddCapabilityEnvelope, admitRefactorCapabilityEnvelope, detectCapabilityEnvelopeOverages, evaluateIntentDraftPolicy, validateIntentDraftCapabilityEnvelopeAdmission } from "./capability-admission.js";
       export { ARCHETYPE_POLICY_TABLE, BUGFIX_GOAL_ARCHETYPE, COSMETIC_TWEAK_GOAL_ARCHETYPE, FEATURE_ADD_GOAL_ARCHETYPE, GOAL_ARCHETYPE_POLICY_TABLE, INTENT_ARCHETYPE_REGISTRY, REFACTOR_GOAL_ARCHETYPE, REPO_SCOPE_ACCESS_VALUES, SUPPORTED_GOAL_ARCHETYPES, V0_0_1_INTENT_ARCHETYPE_IDS, V0_0_1_INTENT_ARCHETYPE_REGISTRY } from "./archetypes.js";
       export type { /* every GoalArchetype* and IntentArchetype* type currently exported from policy/index.ts */ } from "./archetypes.js";
       export { /* the four POLICY_CODE constants + INTENT_ARCHETYPE_PROPOSAL_LOW_CONFIDENCE_THRESHOLD */ } from "./promotion-contracts.js";
       export type { /* every promotion-side type listed in the artifacts above */ } from "./promotion-contracts.js";
       ```
       Mirror the exact name set policy/index.ts exposes, MINUS authorizeFactoryStart / createAdmissionDecisionArtifact / AdmissionDecisionArtifact* (which stay policy-only).

    4. **Optionally add a `./admission` subpath to intent.** Decision: ADD it. Pattern: mirror `confirmed-intent` subpath. Create `packages/intent/src/admission/index.ts` re-exporting the same names listed in step 3 (a flat barrel scoped to "intent admission surface"). Update `packages/intent/package.json#exports` adding:
       ```json
       "./admission": {
         "types": "./dist/admission/index.d.ts",
         "import": "./dist/admission/index.js"
       }
       ```
       Rationale: the root barrel already carries 20+ existing exports; adding 50 promotion exports without a subpath makes auto-import noisy. The subpath gives downstream callers (factory-cli, admission-e2e) a stable path that mirrors the old `@protostar/policy/admission`.

    5. **Slim policy sources:**
       a. `packages/policy/src/admission.ts` → delete every helper that moved with promoteIntentDraft. Keep ONLY: import block (rewrite — see below), `PolicyVerdict` type, `evaluateIntentAmbiguityAdmission` if you decided to keep it here (per step 2: NO — moved to intent), `authorizeFactoryStart`, `createAdmissionDecisionArtifact`, `admissionDecisionOutcomeForPromotion`. Imports: `evaluateIntentAmbiguityAdmission`, `PromoteIntentDraftResult`, `IntentAdmissionPolicyFinding*`, etc. now come from `@protostar/intent`. `admission-decision-artifact` types stay in `./admission-contracts.js`.
       b. `packages/policy/src/admission-contracts.ts` → delete every type that moved to intent. Keep ONLY admission-decision-artifact concerns: `ADMISSION_DECISION_ARTIFACT_NAME`, `ADMISSION_DECISION_SCHEMA_VERSION`, `ADMISSION_DECISION_OUTCOMES`, `AdmissionDecisionOutcome`, `AdmissionDecisionGateSummary`, `AdmissionDecisionAmbiguityDetail`, `AdmissionDecisionArtifactDetails`, `AdmissionDecisionArtifactPayload`, `CreateAdmissionDecisionArtifactInput`. The `repo-scope-admission`-specific overage / violation / reason-code types — keep those here too if they're not promotion-side (they're consumed by capability-grant-admission and repo-scope-admission, which stay in policy). To minimize churn: KEEP them here AND duplicate the type alias names in intent/promotion-contracts.ts — ESM type-only re-exports avoid drift if you decide to export from intent and re-export from policy. Recommended path: keep `CapabilityEnvelope*Overage*`, `CapabilityEnvelope*Violation*`, `Validate*Input/Result`, `RepoScopeAdmission*`, `EvaluateRepoScopeAdmissionInput`, `RepoScopeAdmissionReasonCode` etc. in policy/admission-contracts.ts (their staying consumers are policy/capability-grant-admission and policy/repo-scope-admission). For the types BOTH sides need (`IntentAdmissionPolicyFinding`, `IntentAdmissionPolicyFindingCode`, `IntentAdmissionIssueReference`, `IntentAdmissionIssueCode`), source-of-truth is intent; policy `admission-contracts.ts` re-exports from `@protostar/intent`.
       c. Delete `packages/policy/src/archetypes.ts`, `archetype-autotag.ts`, `capability-admission.ts`, `capability-normalization.ts`. (Or convert each into a thin re-export module if downstream policy files still import from them via relative path — UPDATE those importers in step 5d instead and delete the files cleanly.)
       d. Update `packages/policy/src/capability-grant-admission.ts`, `repo-scope-admission.ts`, `admission-paths.ts`, `shared.ts`: rewrite imports of `./archetypes.js`, `./capability-admission.js`, `./capability-normalization.js`, `./archetype-autotag.js` → `@protostar/intent` (or `@protostar/intent/admission`). `shared.ts` imports `SUPPORTED_GOAL_ARCHETYPES` and `GoalArchetype` — both come from intent now.

    6. **Update `packages/policy/src/index.ts`:** Every name currently exported MUST remain exported (this is the surface-preservation contract). For names whose source moved, use re-export-from:
       ```ts
       export { promoteIntentDraft, evaluateIntentAmbiguityAdmission, autoTagIntentDraftArchetype, proposeIntentDraftArchetype, admitBugfixCapabilityEnvelope, admitCosmeticTweakCapabilityEnvelope, admitFeatureAddCapabilityEnvelope, admitRefactorCapabilityEnvelope, detectCapabilityEnvelopeOverages, evaluateIntentDraftPolicy, validateIntentDraftCapabilityEnvelopeAdmission, ARCHETYPE_POLICY_TABLE, BUGFIX_GOAL_ARCHETYPE, COSMETIC_TWEAK_GOAL_ARCHETYPE, FEATURE_ADD_GOAL_ARCHETYPE, GOAL_ARCHETYPE_POLICY_TABLE, INTENT_ARCHETYPE_REGISTRY, REFACTOR_GOAL_ARCHETYPE, REPO_SCOPE_ACCESS_VALUES, SUPPORTED_GOAL_ARCHETYPES, V0_0_1_INTENT_ARCHETYPE_IDS, V0_0_1_INTENT_ARCHETYPE_REGISTRY, MANUAL_UNJUSTIFIED_ACCEPTANCE_CRITERION_POLICY_CODE, DUPLICATE_ACCEPTANCE_CRITERION_POLICY_CODE, LOW_CONFIDENCE_GOAL_ARCHETYPE_POLICY_CODE, INTENT_ARCHETYPE_PROPOSAL_LOW_CONFIDENCE_THRESHOLD } from "@protostar/intent";
       export type { /* every promotion-side and archetype type currently exported from policy/index.ts */ } from "@protostar/intent";
       export { authorizeFactoryStart, createAdmissionDecisionArtifact } from "./admission.js";
       export type { PolicyVerdict } from "./admission.js";
       export { ADMISSION_DECISION_ARTIFACT_NAME, ADMISSION_DECISION_OUTCOMES, ADMISSION_DECISION_SCHEMA_VERSION, /* etc. + REPO_SCOPE_ADMISSION_REASON_CODES + capability-envelope violation code arrays */ } from "./admission-contracts.js";
       export type { AdmissionDecision*Type, RepoScopeAdmission*Type, /* etc. */ } from "./admission-contracts.js";
       /* repo-scope-admission and capability-grant-admission re-exports unchanged */
       ```
       Mirror the same change in `packages/policy/src/admission/index.ts` subpath barrel.

    7. **Verify:** `pnpm --filter @protostar/intent build && pnpm --filter @protostar/policy build`. Both must compile clean. Do NOT yet move tests — that's Task 2. The 4684-line admission-control.test.ts will fail to compile against the slimmed policy/admission.ts because half its imports now resolve to nothing — that's expected; Task 2 fixes it.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/intent build && pnpm --filter @protostar/policy build</automated>
  </verify>
  <acceptance_criteria>
    - `ls packages/intent/src/promote-intent-draft.ts packages/intent/src/promotion-contracts.ts packages/intent/src/admission-shared.ts packages/intent/src/archetypes.ts packages/intent/src/archetype-autotag.ts packages/intent/src/capability-admission.ts packages/intent/src/capability-normalization.ts packages/intent/src/admission/index.ts` all exist.
    - `grep -c "^export function promoteIntentDraft\|^export const promoteIntentDraft\|^export { promoteIntentDraft" packages/intent/src/promote-intent-draft.ts` >= 1.
    - `grep -v '^#' packages/policy/src/admission.ts | grep -c "function promoteIntentDraft\b"` == 0 (the function has left policy).
    - `grep -c "promoteIntentDraft" packages/intent/src/index.ts` >= 1.
    - `grep -c "promoteIntentDraft" packages/policy/src/index.ts` >= 1 (re-exported from intent for surface preservation).
    - `grep -c "from \"@protostar/policy" packages/intent/src/*.ts` == 0 (no cycle: intent must not import from policy).
    - `pnpm --filter @protostar/intent build` exits 0.
    - `pnpm --filter @protostar/policy build` exits 0 (slimmed sources compile; re-exports resolve).
    - Surface-preservation diff: every name listed in policy/index.ts BEFORE the move is still listed in policy/index.ts AFTER (verify via `git diff packages/policy/src/index.ts | grep "^-export" | sort` should be EMPTY — i.e. nothing was removed; only `from` paths changed). RECORD this diff in SUMMARY.
  </acceptance_criteria>
  <done>Source modules relocated, intent + policy both compile, public surface of @protostar/policy is name-equivalent to pre-move.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Move the intent-promotion test files; rewire all consumers; full build + test green</name>
  <read_first>
    - /Users/zakkeown/Code/protostar/packages/policy/src/admission-control.test.ts (4684 lines — relocate import paths only; no logic changes)
    - /Users/zakkeown/Code/protostar/packages/policy/src/example-intent-fixtures.test-support.ts
    - /Users/zakkeown/Code/protostar/packages/policy/src/example-intent-fixtures.test.ts
    - /Users/zakkeown/Code/protostar/packages/policy/src/archetype-intent-fixtures.test.ts
    - /Users/zakkeown/Code/protostar/packages/policy/src/public-split-exports.contract.test.ts
    - /Users/zakkeown/Code/protostar/packages/intent/src/public-split-exports.contract.test.ts
    - /Users/zakkeown/Code/protostar/apps/factory-cli/src/main.ts (lines ~28–32 + ~168 + ~583 + ~1068 — promoteIntentDraft callsites)
    - /Users/zakkeown/Code/protostar/apps/factory-cli/src/confirmed-intent-handoff.ts (line 8 — type-only import of PromoteIntentDraftResult)
    - /Users/zakkeown/Code/protostar/packages/admission-e2e/src/index.ts + package.json (Plan 05 scaffold — verify it does or doesn't already reference `@protostar/policy/admission`; rewire if so)
  </read_first>
  <action>
    1. **Move the test files (use `git mv` so blame survives):**
       a. `git mv packages/policy/src/admission-control.test.ts packages/intent/src/admission-control.test.ts`.
       b. `git mv packages/policy/src/example-intent-fixtures.test-support.ts packages/intent/src/example-intent-fixtures.test-support.ts`.
       c. `git mv packages/policy/src/example-intent-fixtures.test.ts packages/intent/src/example-intent-fixtures.test.ts`.
       d. `git mv packages/policy/src/archetype-intent-fixtures.test.ts packages/intent/src/archetype-intent-fixtures.test.ts`.

    2. **Rewrite imports in the moved tests:**
       - All `from "./admission.js"` → `from "./promote-intent-draft.js"` (or whichever local name landed in intent for `promoteIntentDraft`, `evaluateIntentAmbiguityAdmission`).
       - All `from "./admission-contracts.js"` → `from "./promotion-contracts.js"` (for the names that moved). Names that stayed in policy/admission-contracts.ts (admission-decision-artifact-side) become `from "@protostar/policy"` imports — but check first whether any of these tests touch decision-artifact types; if not, just point to `./promotion-contracts.js`.
       - All `from "./archetypes.js"`, `./archetype-autotag.js`, `./capability-admission.js`, `./capability-normalization.js`, `./shared.js` → relative siblings inside intent (`./archetypes.js`, etc., or `./admission-shared.js` for the shared helpers).
       - Any explicit `from "@protostar/intent"` imports of `IntentDraft`, `AcceptanceCriterion`, `defineConfirmedIntent`, etc. → switch to relative `./` imports now that the test lives inside intent.
       - Verify NO test gains a `from "@protostar/policy"` import unless it specifically tests an admission-decision-artifact concern (`createAdmissionDecisionArtifact` end-to-end).

    3. **Update `packages/intent/src/public-split-exports.contract.test.ts`:** Add the new public-surface names from intent's barrel (`promoteIntentDraft`, `evaluateIntentAmbiguityAdmission`, `admit*CapabilityEnvelope`, `validateIntentDraftCapabilityEnvelopeAdmission`, `evaluateIntentDraftPolicy`, `detectCapabilityEnvelopeOverages`, `autoTagIntentDraftArchetype`, `proposeIntentDraftArchetype`, archetype constants, the four POLICY_CODE constants, and the new subpath `@protostar/intent/admission` if added). Use the existing test's pattern (typeof / KeysEqual asserts).

    4. **Update `packages/policy/src/public-split-exports.contract.test.ts`:** Verify every name still listed in policy/index.ts is reachable. Do NOT remove names — the surface MUST be preserved per Task 1's contract. If the test currently checks that a name is sourced from a specific module, update the source-module assertion to match the re-export-from origin (i.e. `@protostar/intent`).

    5. **Update `apps/factory-cli/src/main.ts`:**
       - Replace `import { authorizeFactoryStart, promoteIntentDraft } from "@protostar/policy/admission";` with two imports: `import { authorizeFactoryStart } from "@protostar/policy/admission";` AND `import { promoteIntentDraft } from "@protostar/intent";` (or `@protostar/intent/admission` if the subpath was added in Task 1 step 4).
       - At line ~583 (`ReturnType<typeof promoteIntentDraft>`): no source change needed; the type follows the import.
       - At line ~1068 (`function formatPromotionFailure(result: ReturnType<typeof promoteIntentDraft>)`): same, no change.

    6. **Update `apps/factory-cli/src/confirmed-intent-handoff.ts`:** `import type { PromoteIntentDraftResult } from "@protostar/policy/admission";` → `import type { PromoteIntentDraftResult } from "@protostar/intent";`.

    7. **Verify admission-e2e (Plan 05 scaffold):** `grep -rn "@protostar/policy/admission\|@protostar/policy\"" packages/admission-e2e/`. If any imports of moved names exist, repoint to `@protostar/intent`. (Plan 05 was a scaffold; this should be a no-op or a single import line.)

    8. **Build + test the whole repo:**
       ```bash
       pnpm install   # in case package.json#exports changed
       pnpm -r build
       pnpm -r test
       ```
       Both must exit 0. If any test in `intent/admission-control.test.ts` fails because an import didn't resolve, fix the import — do NOT delete or skip tests. The test logic is identical to before; only paths change.

    9. **Update `packages/intent/package.json`:** if Task 1 step 4 added `./admission` subpath, ensure `tsconfig.json` and `tsbuildinfo` resolve cleanly (the tsc build reference may need a `composite` adjustment — verify `pnpm --filter @protostar/intent build` actually emits `dist/admission/index.js` + `.d.ts`).

    10. **SUMMARY artifacts to record:**
        - The exact list of files moved (`git mv` log).
        - Public-surface name diff for `@protostar/policy` (must be empty — flag any deviation).
        - Public-surface name diff for `@protostar/intent` (additions only — list every new name).
        - Whether the `./admission` subpath was added (yes per Task 1 step 4 plan; record actual decision).
        - Confirmation that no `@protostar/policy` import lives inside `packages/intent/src/`.
        - Final `pnpm -r build && pnpm -r test` exit 0.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm install && pnpm -r build && pnpm -r test</automated>
  </verify>
  <acceptance_criteria>
    - `ls packages/intent/src/admission-control.test.ts packages/intent/src/example-intent-fixtures.test.ts packages/intent/src/example-intent-fixtures.test-support.ts packages/intent/src/archetype-intent-fixtures.test.ts` all exist.
    - `ls packages/policy/src/admission-control.test.ts packages/policy/src/example-intent-fixtures.test.ts packages/policy/src/example-intent-fixtures.test-support.ts packages/policy/src/archetype-intent-fixtures.test.ts` returns nothing (all moved).
    - `grep -rln "@protostar/policy\"" packages/intent/src/ | grep -v '\.test\.ts$'` returns no non-test files (authority-boundary lock from Q-09 preserved — the lock applies to non-test code in intent; tests may import from policy if they exercise both ends, but Task 2 step 2 keeps even tests free of `@protostar/policy` imports).
    - `grep -c "from \"@protostar/policy/admission\"" apps/factory-cli/src/main.ts` == 1 (only `authorizeFactoryStart` remains on that path).
    - `grep -c "from \"@protostar/intent" apps/factory-cli/src/main.ts` >= 2 (existing + new `promoteIntentDraft` import).
    - `grep -c "from \"@protostar/intent" apps/factory-cli/src/confirmed-intent-handoff.ts` >= 2 (existing `confirmed-intent` subpath + new root for PromoteIntentDraftResult).
    - `pnpm install` exits 0.
    - `pnpm -r build` exits 0.
    - `pnpm -r test` exits 0.
    - Public-surface name diff captured in SUMMARY: `git diff <pre-06a>..HEAD -- packages/policy/src/index.ts | grep '^-export' | grep -v '^---' | sort` SHOULD show only path-changed re-exports (the LHS names equal the RHS names; if any name is removed without replacement, the move broke surface preservation — STOP and reconcile).
  </acceptance_criteria>
  <done>Tests live with their SUT in intent; every external consumer (factory-cli, admission-e2e, policy public-split contract test) resolves promoteIntentDraft from intent; full repo build + test green; @protostar/policy public surface unchanged in name set.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| `@protostar/policy` public surface ↔ external consumers | Plan 06b's brand contract assumes promoteIntentDraft is on intent. If the move silently changes policy's exposed name set, downstream consumers (factory-cli, admission-e2e, future Phase-2 code) break unexpectedly. |
| Intent package boundary ↔ policy I/O concerns | Q-09 locks: no I/O imports may be added to packages/intent/src/ outside test code. Moving promoteIntentDraft (pure transform) preserves this lock; this plan must NOT introduce a fs/network/process import inside intent. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-06a-01 | Tampering | @protostar/policy public surface | mitigate | Surface-preservation contract: `git diff packages/policy/src/index.ts` may NOT show any `-export` line that lacks a corresponding `+export` for the same name. Acceptance criterion in Task 2. |
| T-01-06a-02 | Elevation of Privilege | packages/intent/src/ gaining I/O imports during the move | mitigate | Acceptance criterion checks `grep -rln "@protostar/policy" packages/intent/src/` returns nothing for non-test files; we additionally inspect for `node:fs`, `node:fs/promises`, `node:child_process`, `node:net`, `node:http`, `process.env` reads at runtime in the moved sources. None of the policy modules being moved have such imports today (verified during planning); Task 2 step 8's full build + test would fail if any leaked in. |
| T-01-06a-03 | Spoofing | Test moves losing git blame | mitigate | All four test files moved via `git mv` (not delete + recreate). Verified by `git log --follow` afterward. |
| T-01-06a-04 | Denial of Service | The 4684-line admission-control.test.ts inflating intent's test runtime | accept | Test runtime is not on the critical path for Phase 1; node --test runs in parallel. If runtime regression > 30% appears, file as a Phase-2 follow-up. |
</threat_model>

<verification>
- `promoteIntentDraft` and listed transitive helpers physically live under `packages/intent/src/` (sources, not re-exports).
- `@protostar/policy` public surface name set is BYTE-EQUIVALENT before/after the move (only `from` paths changed).
- `apps/factory-cli` imports `promoteIntentDraft` from `@protostar/intent` (either root or `./admission` subpath); `authorizeFactoryStart` still from `@protostar/policy/admission`.
- All four moved test files compile + pass under `packages/intent/src/`.
- No new `@protostar/policy` imports inside `packages/intent/src/` non-test code.
- `pnpm -r build && pnpm -r test` green on a clean install.
</verification>

<success_criteria>
The architectural prerequisite for Plan 06b is met: when 06b lands, `promoteIntentDraft` is co-located with the module-private mint function inside `packages/intent/src/confirmed-intent.ts`, and the brand can be enforced without cross-package symbol leakage. Q-03's "promoteIntentDraft is the sole public mint on @protostar/intent" is true at the package-graph level (06b makes it true at the type-system level).
</success_criteria>

<output>
After completion, create `.planning/phases/01-intent-planning-admission/01-06a-SUMMARY.md` recording: (1) the per-module disposition table actually executed (any deviation from this plan's locked table — flag in SUMMARY); (2) whether the optional `./admission` subpath was added to intent; (3) the policy public-surface name-set diff (must be empty for removals); (4) the intent public-surface additions list; (5) confirmation no I/O leaked into intent during the move; (6) total file moves recorded by `git mv`; (7) any callsite updates outside the four anticipated files (factory-cli main, factory-cli confirmed-intent-handoff, admission-e2e, public-split-exports contracts).
</output>
