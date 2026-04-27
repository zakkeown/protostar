---
phase: 05-review-repair-loop
plan: 12
type: execute
wave: 5
depends_on: [07, 08, 09, 10, 11]
files_modified:
  - apps/factory-cli/src/main.ts
  - apps/factory-cli/src/run-factory.ts
  - apps/factory-cli/src/wiring/review-loop.ts
  - apps/factory-cli/src/wiring/review-loop.test.ts
  - apps/factory-cli/src/wiring/preflight.ts
  - apps/factory-cli/src/wiring/preflight.test.ts
  - .env.example
autonomous: true
requirements: [LOOP-01, LOOP-02, LOOP-04, LOOP-05]
must_haves:
  truths:
    - "`runFactory` constructs the four services (mechanicalChecker, modelReviewer, executor, persistence) and invokes `runReviewRepairLoop` (Q-01 wiring)"
    - "Old `runMechanicalReviewExecutionLoop` callsite removed from runFactory"
    - "Preflight verifies BOTH coder model AND judge model are loaded in LM Studio (Q-10 extension)"
    - "Approved-loop result writes review-decision.json AND mints DeliveryAuthorization for Phase 7 hand-off"
    - "Blocked-loop result writes review-block.json and exits with non-zero code (Q-14)"
    - ".env.example documents `LMSTUDIO_JUDGE_MODEL` env var"
  artifacts:
    - path: apps/factory-cli/src/wiring/review-loop.ts
      provides: "buildReviewRepairServices factory + runReviewRepairLoopWithDurablePersistence wrapper"
    - path: apps/factory-cli/src/wiring/preflight.ts
      provides: "preflightCoderAndJudge — verifies both LM Studio models"
  key_links:
    - from: apps/factory-cli/src/main.ts
      to: runReviewRepairLoop
      via: "runFactory invocation"
      pattern: "runReviewRepairLoop"
    - from: apps/factory-cli/src/wiring/review-loop.ts
      to: createReviewPersistence
      via: "FsAdapter injection"
      pattern: "createReviewPersistence"
---

<objective>
Wire the new loop into `apps/factory-cli`. This is the ONLY package (besides `packages/repo`) permitted to do fs I/O, so concrete `ReviewPersistence`, `TaskExecutorService`, and HTTP-bound `ModelReviewer` constructions live here.

Per Q-01: "Add a `factory-cli` wiring layer that constructs the real services and calls the loop — `runFactory` does not own iteration semantics."

Per Q-10: "Preflight (Q-13 from Phase 4) extends to verify both coder and judge models loaded."

Purpose: Replace the existing `runMechanicalReviewExecutionLoop` callsite in `runFactory`. Operator runs `pnpm run factory` and the new loop fires.
Output: Wiring module + preflight extension + main.ts edit + .env.example update.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/05-review-repair-loop/05-CONTEXT.md
@apps/factory-cli/src/main.ts
@packages/review/src/run-review-repair-loop.ts
@packages/review/src/persist-iteration.ts
@packages/mechanical-checks/src/create-mechanical-checks-adapter.ts
@packages/lmstudio-adapter/src/create-judge-adapter.ts
@packages/lmstudio-adapter/src/lmstudio-client.ts
@packages/policy/src/archetypes.ts
@.planning/phases/04-execution-engine/04-10-factory-cli-real-executor-wiring-PLAN.md

<interfaces>
```typescript
// apps/factory-cli/src/wiring/review-loop.ts
import type { FsAdapter, RepoSubprocessRunner } from "@protostar/repo";
import type {
  MechanicalChecker, ModelReviewer, ReviewPersistence,
  TaskExecutorService, ReviewRepairLoopInput
} from "@protostar/review";
import { createReviewPersistence } from "@protostar/review";
import { createMechanicalChecksAdapter } from "@protostar/mechanical-checks";
import { createLmstudioJudgeAdapter } from "@protostar/lmstudio-adapter";

export interface BuildReviewRepairServicesInput {
  readonly fs: FsAdapter;
  readonly runsRoot: string;
  readonly workspaceRoot: string;
  readonly factoryConfig: ParsedFactoryConfig;          // from @protostar/intent or @protostar/lmstudio-adapter
  readonly archetype: "cosmetic-tweak" | "feature-add" | "refactor" | "bugfix";
  readonly admittedPlan: AdmittedPlanExecutionArtifact;
  readonly runId: string;
  readonly baseRef: string;
  readonly executor: TaskExecutorService;               // built elsewhere from Phase 4 wiring
  readonly subprocess: RepoSubprocessRunner;            // injected into mechanical-checks adapter (per 05-07 warning #5 fix)
}

export function buildReviewRepairServices(input: BuildReviewRepairServicesInput): {
  readonly mechanicalChecker: MechanicalChecker;
  readonly modelReviewer: ModelReviewer;
  readonly persistence: ReviewPersistence;
};
```

The mechanical-checker is a small adapter-wrapper: takes the mechanical-checks `ExecutionAdapter`, drives it once per check call, collects the `final` evidence, returns `{ gate, result }`. Loop invokes `mechanicalChecker(input)` once per iteration.

```typescript
// apps/factory-cli/src/wiring/preflight.ts
import { preflightLmstudioModel } from "@protostar/lmstudio-adapter";

export interface PreflightOutcome {
  readonly status: "ready" | "coder-model-not-loaded" | "judge-model-not-loaded" | "unreachable" | "http-error";
  readonly detail?: string;
}

export async function preflightCoderAndJudge(input: {
  readonly baseUrl: string;
  readonly coderModel: string;
  readonly judgeModel: string;
  readonly timeoutMs: number;
}): Promise<PreflightOutcome>;
```

Implementation: call `preflightLmstudioModel` for coder, then judge. Sequential. First failure returns its outcome.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: buildReviewRepairServices wiring + mechanical-checker wrapper</name>
  <files>apps/factory-cli/src/wiring/review-loop.ts, apps/factory-cli/src/wiring/review-loop.test.ts</files>
  <read_first>
    - apps/factory-cli/src/main.ts (current runFactory + how runMechanicalReviewExecutionLoop is invoked — find via grep)
    - packages/review/src/run-review-repair-loop.ts (Plan 05-10 — input shape)
    - packages/review/src/persist-iteration.ts (Plan 05-10 — createReviewPersistence)
    - packages/mechanical-checks/src/create-mechanical-checks-adapter.ts (Plan 05-07)
    - packages/lmstudio-adapter/src/create-judge-adapter.ts (Plan 05-08)
    - packages/policy/src/archetypes.ts (cosmetic-tweak default commands — find or create)
  </read_first>
  <behavior>
    - Test 1 (buildReviewRepairServices returns three services): all three are typed correctly and callable.
    - Test 2 (mechanical-checker wrapper drives adapter): given a stub mechanical-checks adapter that yields `final` event with evidence, wrapper extracts gate + result and returns them; calls match `MechanicalChecker` signature.
    - Test 2b (per 05-07 warning #5 wiring contract): assert that `buildReviewRepairServices` passes `input.fs.readFile` to `createMechanicalChecksAdapter` config (`readFile`) and `input.subprocess` (`subprocess`). Use a spy on the adapter factory; assert the config object received contains both function references (referential equality).
    - Test 3 (modelReviewer thin wrapper): factory-cli's modelReviewer wraps `createLmstudioJudgeAdapter` and returns a `ModelReviewer` callable.
    - Test 4 (cosmetic-tweak default commands): when factoryConfig.mechanicalChecks.commands is absent, archetype === "cosmetic-tweak" defaults to `[{id:'verify',argv:['pnpm','verify']},{id:'lint',argv:['pnpm','lint']}]` (Q-07 default).
    - Test 5 (persistence resolves to runs root): persistence writes go under `runsRoot/{runId}/review/...`.
  </behavior>
  <action>
1. Create `apps/factory-cli/src/wiring/` directory.

2. Create `apps/factory-cli/src/wiring/review-loop.ts`. Implement `buildReviewRepairServices` per `<interfaces>`.
   - `mechanicalChecker`: wraps `createMechanicalChecksAdapter`. Per 05-07 warning #5 fix, the adapter config requires INJECTED `readFile` and `subprocess` capabilities (mechanical-checks no longer imports `node:fs` or `@protostar/repo` directly). Wire them here:
     ```typescript
     const adapter = createMechanicalChecksAdapter({
       workspaceRoot, commands, archetype, baseRef, runId, attempt,
       readFile: input.fs.readFile,                    // FsAdapter from @protostar/repo
       subprocess: input.subprocess,                   // RepoSubprocessRunner from @protostar/repo
     });
     ```
     For each call, drain the AsyncIterable, find the `final` event, return `{ gate: createReviewGate({...}), result: <evidence as MechanicalCheckResult> }`. Reuse `createReviewGate` + `createMechanicalReviewGate` from `packages/review/src/index.ts:128,234` to derive the verdict from findings.
   - `modelReviewer`: directly returns the result of `createLmstudioJudgeAdapter({ baseUrl, model: factoryConfig.adapters.judge.model, judgeId: 'qwen3-80b-judge-1', timeoutMs: 60_000 })`.
   - `persistence`: `createReviewPersistence({ fs: input.fs, runsRoot: input.runsRoot })`.

   **Add `subprocess: RepoSubprocessRunner` to `BuildReviewRepairServicesInput`** (it was implicit before; now required by the mechanical-checks injection contract). Source: `import { repoSubprocessRunner } from "@protostar/repo"` in this file (factory-cli is the authorized fs/exec carve-out per AGENTS.md).

3. Default commands fallback: if `factoryConfig.mechanicalChecks?.commands` is absent and archetype === "cosmetic-tweak", use the Q-07 default. Encode in a small helper `defaultMechanicalCommandsForArchetype(archetype)`.

4. Tests: stub adapters via inline async generators; assert wiring composes correctly. NO real LM Studio calls.

5. Add a `apps/factory-cli/src/wiring/index.ts` barrel exporting `buildReviewRepairServices`.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && grep -c 'export function buildReviewRepairServices' apps/factory-cli/src/wiring/review-loop.ts && grep -c 'createReviewPersistence\|createMechanicalChecksAdapter\|createLmstudioJudgeAdapter' apps/factory-cli/src/wiring/review-loop.ts | awk '$1 >= 3 {print "ok"}' | grep -q ok && pnpm --filter factory-cli test 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'export function buildReviewRepairServices' apps/factory-cli/src/wiring/review-loop.ts` == 1
    - All three package factories invoked (createReviewPersistence, createMechanicalChecksAdapter, createLmstudioJudgeAdapter)
    - **Per 05-07 warning #5 contract:** `grep -c 'readFile: input.fs.readFile' apps/factory-cli/src/wiring/review-loop.ts` ≥ 1 AND `grep -c 'subprocess: input.subprocess' apps/factory-cli/src/wiring/review-loop.ts` ≥ 1 (mechanical-checks fs/exec capabilities sourced from FsAdapter + RepoSubprocessRunner)
    - **Note (per 05-10 warning #6 parity):** the `appendFile` call to `runs/{runId}/review/review.jsonl` is unit-tested in 05-10 Task 2 Test 5b against a stub FsAdapter; this plan does NOT duplicate that test (single source of truth for Q-17/Q-18 path-pattern verification).
    - All 6 tests pass (was 5; readFile/subprocess wiring assertion added)
  </acceptance_criteria>
  <done>Wiring module ready; main.ts can swap callsites in Task 3.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: preflightCoderAndJudge — extend Phase 4 preflight</name>
  <files>apps/factory-cli/src/wiring/preflight.ts, apps/factory-cli/src/wiring/preflight.test.ts</files>
  <read_first>
    - packages/lmstudio-adapter/src/lmstudio-client.ts (Plan 05-08 Task 1 — preflightLmstudioModel)
    - .planning/phases/04-execution-engine/04-04-lmstudio-config-and-preflight-PLAN.md (predecessor preflight pattern)
    - .planning/phases/05-review-repair-loop/05-CONTEXT.md §Q-10 ("Preflight (Q-13) extends to verify both coder and judge models loaded.")
  </read_first>
  <behavior>
    - Test 1 (both ready): stub HTTP server reports both models loaded → outcome `{ status: "ready" }`.
    - Test 2 (coder missing): coder model not in /v1/models → `{ status: "coder-model-not-loaded", detail: "<model id>" }`; judge NOT checked (short-circuit).
    - Test 3 (judge missing): coder ok, judge missing → `{ status: "judge-model-not-loaded", detail: "<model id>" }`.
    - Test 4 (LM Studio unreachable): connection refused → `{ status: "unreachable" }`.
  </behavior>
  <action>
1. Create `apps/factory-cli/src/wiring/preflight.ts` per `<interfaces>`.
2. Implementation: sequentially call `preflightLmstudioModel({ baseUrl, model: coderModel })` then `preflightLmstudioModel({ baseUrl, model: judgeModel })`. Map outcomes:
   - coder check returns `model-not-loaded` → return `{ status: "coder-model-not-loaded", detail: coderModel }`.
   - coder ok, judge returns `model-not-loaded` → return `{ status: "judge-model-not-loaded", detail: judgeModel }`.
   - either returns `unreachable` → propagate (`{ status: "unreachable" }`).
   - both ok → `{ status: "ready" }`.
3. Tests stub LM Studio HTTP via Phase 4's stub server (Plan 04-03 deliverable). Configure stub for various scenarios.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && grep -c 'export async function preflightCoderAndJudge' apps/factory-cli/src/wiring/preflight.ts && grep -c 'judge-model-not-loaded\|coder-model-not-loaded' apps/factory-cli/src/wiring/preflight.ts | awk '$1 >= 2 {print "ok"}' | grep -q ok && pnpm --filter factory-cli test 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'export async function preflightCoderAndJudge' apps/factory-cli/src/wiring/preflight.ts` == 1
    - Both literal status strings present
    - All 4 tests pass
  </acceptance_criteria>
  <done>Preflight extended; runFactory's preflight check verifies both models before run start.</done>
</task>

<task type="auto">
  <name>Task 3: main.ts swap — runMechanicalReviewExecutionLoop → runReviewRepairLoop + .env.example</name>
  <files>apps/factory-cli/src/main.ts, apps/factory-cli/src/run-factory.ts, .env.example</files>
  <read_first>
    - apps/factory-cli/src/main.ts (full file — find runMechanicalReviewExecutionLoop callsite + preflight callsite)
    - apps/factory-cli/src/wiring/review-loop.ts (Task 1)
    - apps/factory-cli/src/wiring/preflight.ts (Task 2)
    - .env.example (current contents)
    - .planning/phases/05-review-repair-loop/05-CONTEXT.md §Q-01 wiring layer
  </read_first>
  <action>
1. In `apps/factory-cli/src/main.ts` (or wherever `runFactory` orchestration lives):
   - Replace `import { runMechanicalReviewExecutionLoop }` (or the existing import path) with `import { runReviewRepairLoop } from "@protostar/review";`.
   - Replace the preflight callsite (currently calls `preflightLmstudio` for coder only) with `preflightCoderAndJudge` from the new wiring module.
   - Replace the loop invocation:
     ```typescript
     const services = buildReviewRepairServices({ fs, runsRoot, workspaceRoot, factoryConfig, archetype, admittedPlan, runId, baseRef, executor });
     const result = await runReviewRepairLoop({
       runId,
       confirmedIntent,
       admittedPlan,
       initialExecution: executionResult,
       executor,
       mechanicalChecker: services.mechanicalChecker,
       modelReviewer: services.modelReviewer,
       persistence: services.persistence
     });
     ```
   - Branch on `result.status`:
     - `"approved"` → carry `result.authorization` (DeliveryAuthorization brand) into the next stage. For Phase 5 ship, this means: log nothing (dark factory), and exit 0 with the decision file written. Phase 7 will plug in `createGitHubPrDeliveryPlan(result.authorization, ...)`.
     - `"blocked"` → exit non-zero (e.g. exit code 3 for a review block) and emit no extra log; the operator inspects `review-block.json`.

2. Update `.env.example` — add:
   ```
   # LM Studio judge model (Phase 5 LOOP-02)
   LMSTUDIO_JUDGE_MODEL=qwen3-80b-a3b-mlx-4bit
   LMSTUDIO_API_KEY=
   ```
   (Coder model and base URL already added by Phase 4 Plan 04-04 / 04-10 — confirm by reading current .env.example; do NOT duplicate.)

3. Verify the swap by running `pnpm run factory` against the cosmetic-tweak fixture (existing Phase 4 deliverable). Expected: factory builds, runs preflight, runs the loop, and either reaches approved (writes review-decision.json + mints brand) or blocked (writes review-block.json). Real LM Studio must be running for an end-to-end test; failing preflight is an acceptable smoke outcome (proves wiring; full pass blocked on Phase 4 ship).

**No remaining `runMechanicalReviewExecutionLoop` callsite in factory-cli source.** Grep enforces.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && grep -rn 'runMechanicalReviewExecutionLoop' apps/factory-cli/src/ | grep -v '@deprecated' | wc -l | grep -q '^0$' && grep -c 'runReviewRepairLoop' apps/factory-cli/src/main.ts && grep -c 'preflightCoderAndJudge' apps/factory-cli/src/main.ts && grep -c 'LMSTUDIO_JUDGE_MODEL' .env.example && pnpm run verify:full 2>&1 | tail -15</automated>
  </verify>
  <acceptance_criteria>
    - No active callsite of `runMechanicalReviewExecutionLoop` remains in `apps/factory-cli/src/` (only `@deprecated` references in comments allowed)
    - `grep -c 'runReviewRepairLoop' apps/factory-cli/src/main.ts` ≥ 1
    - `grep -c 'preflightCoderAndJudge' apps/factory-cli/src/main.ts` ≥ 1
    - `grep -c 'LMSTUDIO_JUDGE_MODEL' .env.example` ≥ 1
    - `pnpm run verify:full` exits 0
  </acceptance_criteria>
  <done>Factory CLI invokes the new loop; preflight verifies both models; .env documents the new var.</done>
</task>

</tasks>

<threat_model>
| Boundary | Description |
|----------|-------------|
| factory-cli ↔ all Phase 5 services | sole construction site for fs/network-bound services |

| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|------------|
| T-05-27 | Tampering | runFactory still invokes old loop and skips model review | mitigate | grep gate forbids active runMechanicalReviewExecutionLoop callsite |
| T-05-28 | Information Disclosure | judge model env var leaks | accept | LMSTUDIO_API_KEY is operator-local; .env.example shows variable names without values |
| T-05-29 | Denial of Service | preflight blocks legitimate runs when LM Studio is slow | mitigate | preflight has its own timeoutMs (passed from factory-config); operator can override |
</threat_model>

<verification>
- `pnpm run verify:full` green
- `pnpm run factory` either approves a fixture or blocks at preflight (network) — both prove wiring
- Old loop callsite eliminated from active code paths
</verification>

<success_criteria>
- runFactory constructs all services and invokes runReviewRepairLoop
- Preflight extension verifies both models
- .env.example documents new env var
</success_criteria>

<output>
Create `.planning/phases/05-review-repair-loop/05-12-SUMMARY.md`: documents the wiring topology, the swap of old→new loop, and notes that Plan 05-13 declares the Phase 7 contract surface that consumes the minted DeliveryAuthorization.
</output>
</content>
</invoke>