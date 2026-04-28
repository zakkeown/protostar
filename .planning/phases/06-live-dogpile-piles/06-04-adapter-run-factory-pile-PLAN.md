---
phase: 06-live-dogpile-piles
plan: 04
type: execute
wave: 1
depends_on: [01, 03]
files_modified:
  - packages/dogpile-adapter/src/run-factory-pile.ts
  - packages/dogpile-adapter/src/run-factory-pile.test.ts
  - packages/dogpile-adapter/src/execution-coordination-mission.ts
  - packages/dogpile-adapter/src/execution-coordination-mission.test.ts
  - packages/dogpile-adapter/src/index.ts
autonomous: true
requirements: [PILE-01]
tags: [dogpile, sdk, abort-hierarchy, stream, q-01, q-02, q-11]
must_haves:
  truths:
    - "runFactoryPile invokes @dogpile/sdk stream() (NOT run()) and accumulates events via for-await on the StreamHandle (Q-02)"
    - "runFactoryPile constructs `AbortSignal.any([ctx.signal, AbortSignal.timeout(ctx.budget.timeoutMs)])` and passes the resulting child signal to stream() (Q-11)"
    - "runFactoryPile calls ctx.onEvent(ev) once per RunEvent yielded by the StreamHandle iterator before resolving (Q-02)"
    - "On AbortSignal trip, runFactoryPile classifies cause via signal.reason: DOMException name 'TimeoutError' → pile-timeout, else pile-cancelled (Q-11)"
    - "buildExecutionCoordinationMission(intent, mode, input) emits a FactoryPileMission whose intent text discriminates 'work-slicing' vs 'repair-plan-generation' (Q-15)"
  artifacts:
    - path: "packages/dogpile-adapter/src/run-factory-pile.ts"
      provides: "Network-only SDK invocation seam"
      contains: "export async function runFactoryPile"
    - path: "packages/dogpile-adapter/src/execution-coordination-mission.ts"
      provides: "Q-15 mission builder for both work-slicing and repair-plan triggers"
      contains: "export function buildExecutionCoordinationMission"
  key_links:
    - from: "packages/dogpile-adapter/src/run-factory-pile.ts"
      to: "@protostar/dogpile-types stream + RunResult + StreamHandle"
      via: "import"
      pattern: "stream.*from \\\"@protostar/dogpile-types\\\""
    - from: "packages/dogpile-adapter/src/run-factory-pile.ts"
      to: "./pile-failure-types + ./map-sdk-stop-to-pile-failure"
      via: "import"
      pattern: "./pile-failure-types"
---

<objective>
Wave 1 part B — implement the network-only SDK invocation seam `runFactoryPile`. This is the function `factory-cli` (Plan 07) calls to invoke any of the three piles. Adapter remains zero-fs (Plan 01 Task 3 static test stays green). Hierarchical AbortControllers are constructed here from caller-supplied `ctx.signal` + budget timeout.

Purpose: Q-01/Q-02 single-seam SDK boundary; Q-11 hierarchical aborts; Q-13 mapping pipeline lives in the catch-block. This is the load-bearing function for PILE-01 (planning), PILE-02 (review), and PILE-03 (exec-coord) live invocations.

Output: `runFactoryPile(mission, ctx) → Promise<PileRunOutcome>` with full unit test coverage using a stub `ConfiguredModelProvider`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/06-live-dogpile-piles/06-CONTEXT.md
@.planning/phases/06-live-dogpile-piles/06-RESEARCH.md
@packages/dogpile-adapter/src/index.ts
@packages/dogpile-adapter/src/pile-failure-types.ts
@packages/lmstudio-adapter/src/coder-adapter.ts

<interfaces>
<!-- VERIFIED at planning time (read at types.d.ts:479-487) -->
**AgentSpec carries ONLY `{ id, role, instructions? }`.** No per-agent provider/model field on the SDK type.
Per-agent provider override (Q-03) is therefore implemented in factory-cli (Plan 07) by constructing one provider per distinct agent model and routing internally — NOT on AgentSpec. runFactoryPile receives a single `provider` in `ctx`.

`StreamHandle` (engine.d.ts comments lines 27-43): async iterable of `RunEvent` with a `result: Promise<RunResult>`. Iterate with `for await`, then await `handle.result` for the accumulated RunResult.

Pile run context shape (Q-01):
```ts
export interface PileRunContext {
  readonly provider: ConfiguredModelProvider;     // from @dogpile/sdk
  readonly signal: AbortSignal;                   // run-level parent owned by factory-cli
  readonly budget: ResolvedPileBudget;            // already clamped via resolvePileBudget (Plan 03)
  readonly now?: () => number;                    // optional clock; defaults to Date.now
  readonly onEvent?: (e: RunEvent) => void;       // Q-02 forwarder for ReviewLifecycleEvent / inspect
}
```

PileRunOutcome union (Q-13):
```ts
export type PileRunOutcome =
  | { readonly ok: true; readonly result: RunResult; readonly trace: Trace; readonly accounting: RunAccounting; readonly stopReason: NormalizedStopReason | null }
  | { readonly ok: false; readonly failure: PileFailure };
```

extractStopReason (Pitfall 1): RunAccounting has NO top-level stopReason field. Walk `result.eventLog.events` for the terminal `FinalEvent` or `BudgetStopEvent`; return its embedded stop reason or `null` if absent.

Abort classification (Q-11):
```ts
function classifyAbortReason(signal: AbortSignal): "pile-timeout" | "pile-cancelled" {
  if (!signal.aborted) return "pile-cancelled";  // unreached at the catch site
  const r = signal.reason;
  if (r instanceof DOMException && r.name === "TimeoutError") return "pile-timeout";
  return "pile-cancelled";
}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: runFactoryPile + PileRunContext + PileRunOutcome (Q-01, Q-02, Q-11) with tests</name>
  <files>packages/dogpile-adapter/src/run-factory-pile.ts, packages/dogpile-adapter/src/run-factory-pile.test.ts, packages/dogpile-adapter/src/index.ts</files>
  <read_first>
    - packages/dogpile-adapter/src/index.ts (FactoryPileMission, FactoryPilePreset shapes — lines 27-40)
    - packages/dogpile-adapter/src/pile-failure-types.ts (Plan 03 output)
    - packages/dogpile-adapter/src/map-sdk-stop-to-pile-failure.ts (Plan 03 output)
    - packages/lmstudio-adapter/src/coder-adapter.ts (Phase 4 adapter pattern — chainAbortSignal at lines 302-318)
    - .planning/phases/06-live-dogpile-piles/06-RESEARCH.md §"Pattern 1" + §"Pitfall 1"
    - node_modules/.pnpm/@dogpile+sdk@0.2.0/node_modules/@dogpile/sdk/dist/types.d.ts (read RunEvent union ~line 1837 and FinalEvent / BudgetStopEvent shapes ~lines 1700-1840 to implement extractStopReason)
  </read_first>
  <behavior>
    - Signature: `export async function runFactoryPile(mission: FactoryPileMission, ctx: PileRunContext): Promise<PileRunOutcome>`.
    - Body sequence:
      1. Build childSignal = `AbortSignal.any([ctx.signal, AbortSignal.timeout(ctx.budget.timeoutMs)])`.
      2. Capture startedAt = (ctx.now ?? Date.now)().
      3. Call `stream({ intent: mission.intent, model: ctx.provider, protocol: mission.preset.protocol, tier: mission.preset.tier, agents: mission.preset.agents, budget: { maxTokens: ctx.budget.maxTokens, timeoutMs: ctx.budget.timeoutMs }, terminate: mission.preset.terminate, signal: childSignal })`.
      4. Iterate `for await (const ev of handle)` invoking `ctx.onEvent?.(ev)` per event.
      5. Await `result = await handle.result`.
      6. Determine `stopReason = extractStopReason(result)` (walk eventLog for terminal FinalEvent/BudgetStopEvent).
      7. If stopReason maps to a failure via `mapSdkStopToPileFailure(stopReason, { kind: mission.preset.kind, elapsedMs, budget: ctx.budget })`, return `{ ok: false, failure }`.
      8. Otherwise return `{ ok: true, result, trace: result.trace, accounting: result.accounting, stopReason }`.
    - On thrown error (catch block):
      - If childSignal.aborted: return `{ ok: false, failure: { kind, class: classifyAbortReason(childSignal), … } }` where:
        - pile-timeout → `{ class: "pile-timeout", elapsedMs, configuredTimeoutMs: ctx.budget.timeoutMs }`
        - pile-cancelled → `{ class: "pile-cancelled", reason: ctx.signal.aborted ? "parent-abort" : "sigint" }`
      - Else (network/transport): return `{ ok: false, failure: { kind, class: "pile-network", attempt: 1, lastError: { code: extractErrorCode(err), message: String((err as Error).message ?? err) } } }`.
    - Function MUST NOT import from `node:fs`, `node:fs/promises`, `fs`, or `node:path` (Plan 01 Task 3 static test enforces).
    - Function MUST NOT persist anything (Q-07): persistence is factory-cli's job in Plan 07.
  </behavior>
  <action>
    Write test file FIRST using a stub `ConfiguredModelProvider` and a stubbed `stream` import (use `node:test` `mock.module` if available; otherwise extract `stream` into an injected default-arg, or use an interface seam).

    Approach (recommended for testability without module-mocking ceremony): expose an internal injection seam in `run-factory-pile.ts`:
    ```ts
    export interface RunFactoryPileDeps {
      readonly stream?: typeof streamFromSdk;        // defaults to imported real stream
      readonly now?: () => number;
    }
    export async function runFactoryPile(mission, ctx, deps: RunFactoryPileDeps = {}): Promise<PileRunOutcome> { ... }
    ```
    Tests inject a fake stream returning a pre-built `StreamHandle`.

    Test cases (each `it(...)`):
    1. **happy path** — fake stream yields 3 RunEvents then resolves to a RunResult whose eventLog ends with FinalEvent + stopReason `"convergence"`. Assert outcome.ok === true, ctx.onEvent called 3 times, outcome.stopReason === "convergence".
    2. **`run-factory-pile` (label test for grep)** — duplicate of (1) with name string `"run-factory-pile happy path"` so `--grep run-factory-pile` matches.
    3. **on-event-forwarding** — fake stream yields 5 events; assert ctx.onEvent invocation count === 5; test name `"on-event-forwarding count matches stream events"`.
    4. **pile-timeout** — fake stream awaits forever; ctx.budget.timeoutMs = 25; assert outcome.ok === false && outcome.failure.class === "pile-timeout" && outcome.failure.configuredTimeoutMs === 25; test name includes `"pile-timeout"`.
    5. **abort-hierarchy parent abort** — caller aborts ctx.signal mid-stream; assert outcome.failure.class === "pile-cancelled"; test name includes `"abort-hierarchy"`.
    6. **abort-hierarchy timeout-not-parent** — pile timeout fires; assert ctx.signal NOT aborted afterwards (parent unaffected); test name `"abort-hierarchy: pile timeout does not abort parent"`.
    7. **pile-network** — fake stream throws `new Error("ECONNREFUSED")` synchronously; assert outcome.failure.class === "pile-network" && outcome.failure.lastError.message includes "ECONNREFUSED".
    8. **pile-schema-parse path NOT triggered here** — note in test that schema-parse failures are produced by domain parsers (Plans 05/06), not runFactoryPile; assert that runFactoryPile.ok === true even when result.output is not valid JSON (parsing is deferred to caller per Q-12).

    Run tests — RED. Implement `run-factory-pile.ts`. Re-run — GREEN.

    Add to `packages/dogpile-adapter/src/index.ts`:
    - `export { runFactoryPile } from "./run-factory-pile.js";`
    - `export type { PileRunContext, PileRunOutcome, RunFactoryPileDeps } from "./run-factory-pile.js";`

    Per D-01 (Q-01): single SDK call seam; factory-cli passes ctx, receives outcome.
    Per D-02 (Q-02): `stream()` is the entrypoint; `run()` is NOT used.
    Per D-11 (Q-11): hierarchical AbortControllers via `AbortSignal.any`; classify via signal.reason.
    Per D-09 (Q-09): zero fs imports — Plan 01 Task 3 static test enforces.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/dogpile-adapter test --grep run-factory-pile &amp;&amp; pnpm --filter @protostar/dogpile-adapter test --grep on-event-forwarding &amp;&amp; pnpm --filter @protostar/dogpile-adapter test --grep pile-timeout &amp;&amp; pnpm --filter @protostar/dogpile-adapter test --grep abort-hierarchy</automated>
  </verify>
  <done>
    All 8 test cases pass; static no-fs test (Plan 01) still passes; barrel exports `runFactoryPile`, `PileRunContext`, `PileRunOutcome`; `pnpm --filter @protostar/dogpile-adapter build` passes.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: buildExecutionCoordinationMission (Q-15) + tests + barrel</name>
  <files>packages/dogpile-adapter/src/execution-coordination-mission.ts, packages/dogpile-adapter/src/execution-coordination-mission.test.ts, packages/dogpile-adapter/src/index.ts</files>
  <read_first>
    - packages/dogpile-adapter/src/index.ts (existing buildPlanningMission lines 102-119, buildReviewMission lines 121-140 — same pattern)
    - .planning/phases/06-live-dogpile-piles/06-CONTEXT.md §"Q-15" lines 131-141 (mission discriminator: `mode: 'work-slicing' | 'repair-plan-generation'`)
  </read_first>
  <behavior>
    - Signature: `export function buildExecutionCoordinationMission(intent: ConfirmedIntent, mode: "work-slicing" | "repair-plan-generation", input: ExecutionCoordinationMissionInput): FactoryPileMission`.
    - `ExecutionCoordinationMissionInput` is a discriminated union:
      - `{ kind: "work-slicing"; admittedPlan: PlanningAdmissionAcceptedArtifactPayload }`
      - `{ kind: "repair-plan-generation"; failingTaskIds: readonly string[]; mechanicalCritique?: string }`
    - The returned `FactoryPileMission.preset` is `executionCoordinationPilePreset`.
    - The returned `FactoryPileMission.intent` is a deterministic string that:
      - Begins with `Confirmed intent: ${intent.title}\n`
      - Contains the literal token `MODE: work-slicing` OR `MODE: repair-plan-generation` (so the pile prompt + downstream parsing in Plan 06 can branch).
      - Includes a JSON-stringified compact summary of the relevant input section.
      - Ends with the instruction: `Return JSON only matching ExecutionCoordinationProposal; do not include explanatory prose.`
    - Pure: no I/O, no clock reads.
  </behavior>
  <action>
    Write test FIRST. Test cases (4):
    1. work-slicing mode — given a stub admittedPlan, asserts `mission.intent` contains `"MODE: work-slicing"` AND `mission.preset.kind === "execution-coordination"`.
    2. repair-plan-generation mode — given failingTaskIds=["t-1","t-2"], asserts `mission.intent` contains `"MODE: repair-plan-generation"` AND each failing task id appears in the intent.
    3. mode mismatch — passing `mode="work-slicing"` with `input.kind="repair-plan-generation"` should throw `Error("buildExecutionCoordinationMission: mode/input.kind mismatch")` (defensive — these MUST agree).
    4. preset reference — `mission.preset === executionCoordinationPilePreset` (referential equality with the renamed export from Plan 01).

    Run tests — RED. Implement. Re-run — GREEN.

    Add to barrel: `export { buildExecutionCoordinationMission, type ExecutionCoordinationMissionInput } from "./execution-coordination-mission.js";`.

    Per D-15 (Q-15): one preset, two trigger modes; mission text discriminates. Per D-16 (Q-16): preset name is `executionCoordinationPilePreset`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/dogpile-adapter test --grep execution-coordination-mission &amp;&amp; node -e "const m=require('@protostar/dogpile-adapter'); if (typeof m.buildExecutionCoordinationMission !== 'function') throw new Error('missing builder'); if (m.executionCoordinationPilePreset.kind !== 'execution-coordination') throw new Error('preset kind drift'); console.log('mission ok')"</automated>
  </verify>
  <done>
    All 4 test cases pass; barrel exports the builder; preset referential equality holds; static no-fs test still passes.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| @dogpile/sdk stream → runFactoryPile | Network ingress; SDK errors flow into PileFailure mapping. |
| ctx.signal (parent) → childSignal (pile-scoped) | Run-level cancel must cascade; pile-level timeout must NOT bubble up to abort the run. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-6-02 | Denial of Service | Pile timeout aborts the entire run instead of just the pile | mitigate | AbortSignal.any builds child from parent + timeout; child timeout fires only the child; Test case 6 asserts parent unaffected after pile timeout |
| T-6-05 | Elevation of Privilege | runFactoryPile persists artifacts (breaks fs-authority boundary) | mitigate | Function returns plain values; persistence is factory-cli's job (Plan 07); Plan 01 Task 3 static no-fs test enforces zero fs imports |
| T-6-15 | Tampering | SDK error message leaks credentials into PileFailure.lastError | accept | lastError.message captures error text; LM Studio errors do not include API keys (LM Studio is local); document in CONCERNS that production providers must redact secrets at the provider boundary |
| T-6-16 | Spoofing | Mission discriminator (MODE: work-slicing vs repair-plan-generation) is altered by upstream code | mitigate | buildExecutionCoordinationMission is the single source for mission text; Task 2 case 3 asserts mode/input.kind agreement is enforced |
</threat_model>

<verification>
- All Plan 03 tests still pass.
- New Plan 04 tests all pass.
- `pnpm --filter @protostar/dogpile-adapter build` passes.
- The static no-fs contract test (Plan 01 Task 3) still passes after these new files land.
- `grep -q "from \"node:fs\"" packages/dogpile-adapter/src/run-factory-pile.ts` returns false.
</verification>

<success_criteria>
- Plan 05 (`createReviewPileModelReviewer`) and Plan 07 (factory-cli) can `import { runFactoryPile, type PileRunContext, type PileRunOutcome } from "@protostar/dogpile-adapter"`.
- All abort hierarchy invariants enforced: parent aborts cascade; pile-level timeout is leaf-only.
- The Q-15 mission builder is available for Plan 06 / Plan 07 work-slicing + repair-plan triggers.
</success_criteria>

<output>
After completion, create `.planning/phases/06-live-dogpile-piles/06-04-SUMMARY.md` recording: runFactoryPile signature, abort-hierarchy proof, mission builder shape, barrel exports.
</output>
