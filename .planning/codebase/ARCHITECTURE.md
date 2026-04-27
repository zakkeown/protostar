<!-- refreshed: 2026-04-26 -->
# Architecture

**Analysis Date:** 2026-04-26

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│                        Operator Surface (CLI)                         │
│                       `apps/factory-cli/src/main.ts`                  │
└───────────────────────────────┬──────────────────────────────────────┘
                                │  parses args, composes the spine
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                          Factory Spine (Stages)                       │
├──────────────┬──────────────┬──────────────┬──────────────┬──────────┤
│   intent     │  planning    │  execution   │   review     │ release  │
│ `packages/   │ `packages/   │ `packages/   │ `packages/   │`packages/│
│   intent`    │   planning`  │   execution` │   review`    │ delivery`│
└──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┴────┬─────┘
       │              │              │              │            │
       ▼              ▼              ▼              ▼            ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Cross-cutting Authority — Policy / Repo / Artifacts / Evaluation    │
│  `packages/policy`  `packages/repo`  `packages/artifacts`            │
│  `packages/evaluation`                                               │
└──────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Bounded Coordination Cell (no authority)                            │
│  `packages/dogpile-adapter` → `@dogpile/sdk` (linked sibling repo)   │
└──────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Durable Run Bundle Output                                           │
│  `.protostar/runs/<runId>/` (intent.json, plan.json, manifest.json,  │
│    execution-*.json, review-*.json, delivery/pr-body.md, ...)        │
└──────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| factory-cli | Parse args, orchestrate the spine, write the run bundle | `apps/factory-cli/src/main.ts` |
| ConfirmedIntentHandoff | Hand a frozen ConfirmedIntent (and its ambiguity assessment) to downstream stages | `apps/factory-cli/src/confirmed-intent-handoff.ts` |
| intent | IntentDraft, ambiguity scoring, acceptance criteria normalization, clarification report, ConfirmedIntent | `packages/intent/src/index.ts` |
| policy | Admission gate, archetypes, capability-envelope admission, repo-scope admission, autonomy verdicts, admission-decision artifact | `packages/policy/src/index.ts` |
| planning | PlanGraph schema, candidate-plan parsing, planning admission, AdmittedPlan artifact | `packages/planning/src/index.ts` |
| execution | ExecutionRunPlan, dry-run lifecycle events, dependency ordering, evidence refs | `packages/execution/src/index.ts` |
| review | Mechanical review gate, review-execute-review repair loop, ReviewGate verdict | `packages/review/src/index.ts` |
| evaluation | Three-stage evaluation report (mechanical/semantic/consensus) and ontology-similarity evolution decision | `packages/evaluation/src/index.ts` |
| delivery | Post-approval GitHub PR delivery plan and PR body | `packages/delivery/src/index.ts` |
| artifacts | FactoryRunManifest, StageRecord, StageArtifactRef, run status transitions | `packages/artifacts/src/index.ts` |
| repo | WorkspaceRef and RepoChangeSet contracts (workspace authority boundary) | `packages/repo/src/index.ts` |
| dogpile-adapter | Pile presets (planning / review / execution-coordination) over `@dogpile/sdk`. No filesystem authority. | `packages/dogpile-adapter/src/index.ts` |

## Pattern Overview

**Overall:** Domain-first TypeScript monorepo organized as a deterministic control-plane spine. Each domain is a separate workspace package whose public surface is a typed contract; CLI composition is the only place stages are wired together.

**Key Characteristics:**
- Stage outputs are pure data records (`ConfirmedIntent`, `AdmittedPlan`, `ExecutionDryRunResult`, `ReviewGate`, `EvaluationReport`, `GitHubPrDeliveryPlan`); each stage forwards a durable, validated artifact rather than reaching back into earlier private state.
- Every promotion across a stage boundary goes through an admission gate (`promoteIntentDraft`, `admitCandidatePlan(s)`, `assertAdmittedPlanHandoff`, mechanical `runMechanicalReviewExecutionLoop`) that returns an explicit allow/block/repair result and a persisted admission artifact.
- Authority is concentrated in Protostar packages; `dogpile-adapter` only describes pile shapes. The CLI never lets the adapter touch the filesystem.
- ConfirmedIntent is `DeepReadonly` and immutable post-promotion; downstream stages cannot mutate it (see `packages/intent/src/confirmed-intent.ts` and `confirmed-intent-readonly.contract.ts`).
- Stage composition is dependency-injectable: `runFactory` accepts `FactoryCompositionDependencies` overrides for `prepareExecutionRun` and `runMechanicalReviewExecutionLoop` (`apps/factory-cli/src/main.ts:80-83`).

## Layers

**Operator Surface:**
- Purpose: Parse CLI args, load fixture inputs, compose the factory spine, write the run bundle.
- Location: `apps/factory-cli/`
- Contains: `main.ts` (composition), `confirmed-intent-handoff.ts` (intent boundary helper), contract types, smoke-path tests.
- Depends on: every `@protostar/*` package.
- Used by: human operators, `pnpm run factory`.

**Domain / Stage Packages:**
- Purpose: Own one stage of the spine and its contracts.
- Location: `packages/intent`, `packages/planning`, `packages/execution`, `packages/review`, `packages/delivery`, `packages/evaluation`.
- Contains: types, normalization, validation/admission functions, deterministic execution helpers, contract-level tests.
- Depends on: only the upstream stage packages they consume types from (see `packages/*/package.json` `dependencies`).
- Used by: `apps/factory-cli` and adjacent stages.

**Cross-cutting Authority Packages:**
- Purpose: Encode policy decisions, durable-artifact shape, and workspace boundaries used by every stage.
- Location: `packages/policy`, `packages/artifacts`, `packages/repo`.
- Contains: archetype tables, admission contracts/artifacts, manifest/stage-record helpers, workspace contracts.
- Depends on: `@protostar/intent` (for shared types).
- Used by: planning, execution, review, delivery, CLI.

**Coordination Cell (no authority):**
- Purpose: Express Dogpile pile presets and parse pile outputs into typed candidate artifacts.
- Location: `packages/dogpile-adapter`.
- Contains: `planningPilePreset`, `reviewPilePreset`, `executionCoordinationPilePreset`, `buildPlanningMission`, `buildReviewMission`, re-exports of planning candidate parsers.
- Depends on: `@dogpile/sdk` (linked at `../dogpile`), `@protostar/intent`, `@protostar/planning`.
- Used by: `apps/factory-cli` (mission strings only in current scaffold).

## Data Flow

### Primary Request Path (`pnpm run factory` / `protostar-factory run`)

1. Parse CLI flags into `RunCommandOptions` (`apps/factory-cli/src/main.ts:962`).
2. Read intent input from disk; if a draft, capture `IntentDraft`, generate `ClarificationReport`, run `promoteIntentDraft` admission gate, persist `admission-decision.json` (`apps/factory-cli/src/main.ts:156-188`).
3. Build `ConfirmedIntent` + `IntentAmbiguityAssessment` via `createConfirmedIntentHandoff` (`apps/factory-cli/src/confirmed-intent-handoff.ts:24`).
4. Apply autonomy policy via `authorizeFactoryStart`; throw if not `allow` (`apps/factory-cli/src/main.ts:202-210`).
5. Build planning mission (`buildPlanningMission`), load planning fixture, parse into `CandidatePlanGraph`(s), run `admitCandidatePlan(s)`, persist `planning-admission.json` and (on accept) `plan.json` (`apps/factory-cli/src/main.ts:216-298`).
6. `assertAdmittedPlanHandoff` re-derives the typed handoff for execution (`apps/factory-cli/src/main.ts:299-304`).
7. `prepareExecutionRun` builds an `ExecutionRunPlan`; `runMechanicalReviewExecutionLoop` drives the review-execute-review loop (`apps/factory-cli/src/main.ts:310-322`).
8. `createEvaluationReport` and `decideEvolution` produce the evaluation/evolution stubs (`apps/factory-cli/src/main.ts:323-330`).
9. `createGitHubPrDeliveryPlan` produces the post-approval delivery plan (`apps/factory-cli/src/main.ts:331-335`).
10. Compose stage records into `FactoryRunManifest` via `recordStageArtifacts`, set final status with `setFactoryRunStatus`, write the entire run bundle to `.protostar/runs/<runId>/` (`apps/factory-cli/src/main.ts:338-484`).

### Draft Pre-admission Failure Flow

1. `parsePlanningPileResultInputs` / `parseCandidatePlansFromPlanningPileResults` collect parse errors.
2. `blockPlanningPreAdmission` calls `createPlanningPreAdmissionFailureArtifact` and writes a no-plan-admitted `planning-admission.json` plus `planning-mission.txt`/`planning-result.json` (`apps/factory-cli/src/main.ts:712-755`).
3. `runFactory` throws with `formatPlanningPreAdmissionFailure`; no execution/review artifacts are written.

**State Management:**
- All cross-stage state is materialized as JSON artifacts under `.protostar/runs/<runId>/`. Stages read durable artifacts (e.g. `readPersistedPlanningAdmissionArtifact`) rather than holding shared in-memory state.
- `ConfirmedIntent` is `DeepReadonly` (`packages/intent/src/models.ts`) and is the single source of truth for downstream stages.

## Key Abstractions

**ConfirmedIntent:**
- Purpose: Immutable, admitted intent passed across the spine.
- Examples: `packages/intent/src/confirmed-intent.ts`, `packages/intent/src/confirmed-intent/index.ts`, `packages/intent/src/confirmed-intent-readonly.contract.ts`.
- Pattern: Brand-typed `DeepReadonly` record produced only by `parseConfirmedIntent` / `assertConfirmedIntent` / draft promotion.

**IntentAmbiguityAssessment / Ambiguity Gate:**
- Purpose: Score draft/confirmed intents along weighted dimensions; reject above `INTENT_AMBIGUITY_THRESHOLD` (0.2).
- Examples: `packages/intent/src/ambiguity-scoring.ts`, `packages/intent/src/ambiguity/index.ts`.
- Pattern: Pure scoring functions returning `IntentAmbiguityAssessment`, gated by `assertIntentAmbiguityAccepted`.

**Admission Decision (intent + planning + capability):**
- Purpose: Explicit allow/block/escalate verdict with persisted artifact.
- Examples: `packages/policy/src/admission.ts`, `packages/policy/src/admission-contracts.ts`, `packages/policy/src/artifacts/index.ts`, `packages/planning/src/candidate-admitted-plan-boundary.contract.ts`.
- Pattern: `createAdmissionDecisionArtifact` returns a typed `AdmissionDecisionArtifactPayload` with schema version `protostar.admission-decision.v1`.

**CandidatePlanGraph → AdmittedPlan:**
- Purpose: Two-step typed boundary that prevents an unvetted plan from reaching execution.
- Examples: `packages/planning/src/index.ts`, `packages/planning/src/artifacts/index.ts`, `packages/planning/src/schema/index.ts`.
- Pattern: `parsePlanningPileResult` → `admitCandidatePlan(s)` → `assertAdmittedPlanHandoff` → `AdmittedPlanExecutionArtifact`.

**FactoryRunManifest / StageRecord:**
- Purpose: Durable per-run record of every stage, its status, and its artifacts.
- Examples: `packages/artifacts/src/index.ts`.
- Pattern: Append-only via `recordStageArtifacts`; final state via `setFactoryRunStatus`.

**ReviewGate / Mechanical Review Loop:**
- Purpose: Deterministic verdict (`pass` | `repair` | `block`) plus repair-loop budget enforcement.
- Examples: `packages/review/src/index.ts`, `packages/review/src/admitted-plan-input.contract.ts`.
- Pattern: `runMechanicalReviewExecutionLoop({ admittedPlan, execution, initialFailTaskIds, maxRepairLoops })`.

**FactoryPilePreset / FactoryPileMission:**
- Purpose: Bounded Dogpile presets used as model coordination cells.
- Examples: `packages/dogpile-adapter/src/index.ts`.
- Pattern: `planningPilePreset`, `reviewPilePreset`, `executionCoordinationPilePreset`, `buildPlanningMission`, `buildReviewMission`.

## Entry Points

**`apps/factory-cli/src/main.ts`:**
- Location: `apps/factory-cli/src/main.ts`
- Triggers: `pnpm run factory`, `protostar-factory run ...`, `pnpm --filter @protostar/factory-cli start -- run ...`.
- Responsibilities: Parse args, drive `runFactory`, write the run bundle. Exposes `runFactory` and `RunCommandOptions` for programmatic composition (used by `apps/factory-cli/src/main.test.ts`).

**`apps/factory-cli/src/confirmed-intent-handoff.ts`:**
- Location: `apps/factory-cli/src/confirmed-intent-handoff.ts`
- Triggers: Called from `runFactory` after admission.
- Responsibilities: Produce the single typed boundary object that downstream stages may read.

## Architectural Constraints

- **Threading:** Single Node.js event loop (Node `>=22`). Execution stage is currently a deterministic dry run with no worker threads.
- **Global state:** None. There is no module-level singleton; all state is parameterized into pure functions or written to the run-bundle directory.
- **Authority boundary:** Only `apps/factory-cli` and `packages/repo` may touch the filesystem/workspace. `packages/dogpile-adapter` MUST NOT perform filesystem I/O (per `AGENTS.md`).
- **Stage forward-only data:** Later stages must never reach into earlier stages' private state. They consume the persisted/typed artifact (e.g. `assertAdmittedPlanHandoff`, `readPersistedPlanningAdmissionArtifact`).
- **ConfirmedIntent immutability:** `DeepReadonly` brand; any mutation is a compile error and is contract-tested in `packages/intent/src/confirmed-intent-readonly.contract.ts`.
- **Strict TypeScript:** `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` set in `tsconfig.base.json`. Non-undefined optional properties must be conditionally spread (see `apps/factory-cli/src/main.ts:1027-1036`).
- **Module system:** ESM only (`"type": "module"`, `module: NodeNext`). Relative imports must use the `.js` suffix (e.g. `./confirmed-intent-handoff.js`).
- **Dogpile dependency:** `@dogpile/sdk` is `link:../../../dogpile`; the sibling `dogpile/` checkout must exist for `dogpile-adapter` to typecheck/build.

## Anti-Patterns

### Generic Catch-all Packages

**What happens:** Adding a `packages/utils`, `packages/agents`, or `packages/factory` package to host helpers used across stages.
**Why it's wrong:** Violates the domain-first rule in `AGENTS.md` ("Keep packages domain-first. Avoid generic `utils`, `agents`, or catch-all factory packages."). It dilutes ownership and re-creates the authority ambiguity Protostar is meant to eliminate.
**Do this instead:** Place helpers inside the package that owns the concept; if multiple stages need a type, lift it to the upstream stage they both depend on (e.g. types in `@protostar/intent`, `@protostar/policy`, or `@protostar/artifacts`).

### Reaching Backward Across Stages

**What happens:** A later stage imports private state from an earlier stage instead of reading the durable artifact (e.g. review reading planning's in-memory admission result rather than the typed handoff).
**Why it's wrong:** Breaks the "stage contracts pass durable data forward" rule in `AGENTS.md`; couples stages and bypasses admission gates.
**Do this instead:** Use the typed boundary helper — e.g. `assertAdmittedPlanHandoff` (`packages/planning/src/artifacts/index.ts`) or `readPersistedPlanningAdmissionArtifact` (`apps/factory-cli/src/main.ts:634`).

### Side Effects in Dogpile Adapter

**What happens:** Adding filesystem writes, network calls, or workspace mutation inside `packages/dogpile-adapter`.
**Why it's wrong:** The adapter is explicitly a coordination cell with no authority. Side effects there leak authority outside Protostar's control plane.
**Do this instead:** Put side effects behind `@protostar/repo`, `@protostar/execution`, or a caller-owned tool adapter, and let the CLI compose them.

### Mutating ConfirmedIntent

**What happens:** Treating a `ConfirmedIntent` as a mutable record after admission.
**Why it's wrong:** ConfirmedIntent is the immutable contract between intent and every downstream stage; mutation invalidates ambiguity, admission, and review evidence.
**Do this instead:** Re-run draft promotion (`promoteIntentDraft`) to produce a new `ConfirmedIntent`. The brand and `DeepReadonly` typing prevent accidental mutation at compile time.

## Error Handling

**Strategy:** Result objects at admission boundaries (`{ ok: true, ... } | { ok: false, errors: [...] }`); thrown `Error` only at the CLI composition level when an admission gate refuses a run.

**Patterns:**
- Admission/parse functions return discriminated unions (e.g. `parsePlanningPileResultInputs`, `parseCandidatePlansFromPlanningPileResults`, `promoteIntentDraft`).
- The CLI converts hard failures into a single-line error message via helpers like `formatPromotionFailure` (`apps/factory-cli/src/main.ts:1068`) and `formatPlanningPreAdmissionFailure` (`apps/factory-cli/src/main.ts:880`), then throws.
- `main()` sets `process.exitCode = 1` and prints `error.message` (`apps/factory-cli/src/main.ts:1186-1189`).
- Pre-admission failures still persist a no-plan-admitted artifact before throwing, so the run directory always reflects the gate decision.

## Cross-Cutting Concerns

**Logging:** None. The CLI only writes the final ConfirmedIntent JSON to stdout (`apps/factory-cli/src/main.ts:139`) and errors to stderr. The factory is "dark" — no progress logs.

**Validation:** Per-stage admission. Intent uses `parseConfirmedIntent` / `assertConfirmedIntent` / `promoteIntentDraft`. Planning uses `assertPlanningPileResult` / `parsePlanningPileResult` / `admitCandidatePlan(s)` / `assertAdmittedPlanHandoff`. Review uses `validateAdmittedPlanExecutionArtifact`.

**Authorization / Policy:** `authorizeFactoryStart` (`packages/policy/src/admission.ts`) gates whether a `ConfirmedIntent` may run; capability-envelope admission lives in `packages/policy/src/capability-admission.ts`, `capability-grant-admission.ts`, and `repo-scope-admission.ts`. Repair-loop budget comes from `intent.capabilityEnvelope.budget.maxRepairLoops`.

**Persistence:** All side effects funnel through `mkdir`/`writeFile` in `apps/factory-cli/src/main.ts`. Workspace boundary is described by `defineWorkspace` in `packages/repo/src/index.ts`.

---

*Architecture analysis: 2026-04-26*
