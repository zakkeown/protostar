---
phase: 06-live-dogpile-piles
plan: 07
type: execute
wave: 3
depends_on: [02, 04, 05, 06]
files_modified:
  - apps/factory-cli/src/cli-args.ts
  - apps/factory-cli/src/cli-args.test.ts
  - apps/factory-cli/src/load-factory-config.ts
  - apps/factory-cli/src/load-factory-config.test.ts
  - apps/factory-cli/src/refusals-index.ts
  - apps/factory-cli/src/refusals-index.test.ts
  - apps/factory-cli/src/pile-mode-resolver.ts
  - apps/factory-cli/src/pile-mode-resolver.test.ts
  - apps/factory-cli/src/pile-persistence.ts
  - apps/factory-cli/src/pile-persistence.test.ts
  - apps/factory-cli/src/main.ts
  - apps/factory-cli/src/main.test.ts
autonomous: true
requirements: [PILE-01, PILE-04, PILE-05]
tags: [factory-cli, cli, persistence, abort-hierarchy, q-04, q-07, q-12]
must_haves:
  truths:
    - "CLI flags --planning-mode, --review-mode, --exec-coord-mode are parsed; precedence is CLI > factory-config.json > built-in default ('fixture' per Q-05)"
    - "factory-cli persists per-pile artifacts at runs/{id}/piles/{kind}/iter-{N}/{result.json,trace.json,refusal.json} using atomic tmp+rename writes (Q-07/Q-08)"
    - "factory-cli appends pile failures to .protostar/refusals.jsonl using existing appendRefusalIndexEntry; RefusalStage extended with pile-planning, pile-review, pile-execution-coordination (Q-12)"
    - "factory-cli constructs the run-level AbortController parent and passes its signal as ctx.signal to runFactoryPile; per-pile timeout is owned by runFactoryPile via AbortSignal.any (Q-11)"
    - "Per-agent provider routing (Q-03 fallback): factory-cli builds a Map<agentId, ConfiguredModelProvider> when factory-config.json declares per-agent overrides; default provider = LM Studio shared baseUrl"
  artifacts:
    - path: "apps/factory-cli/src/cli-args.ts"
      provides: "CLI flag parsing for --planning-mode, --review-mode, --exec-coord-mode"
      contains: "planning-mode"
    - path: "apps/factory-cli/src/load-factory-config.ts"
      provides: "factory-config.json piles block parsing"
      contains: "piles"
    - path: "apps/factory-cli/src/refusals-index.ts"
      provides: "RefusalStage + sourceOfTruth extensions for pile failures (Q-12)"
      contains: "pile-planning"
    - path: "apps/factory-cli/src/pile-mode-resolver.ts"
      provides: "Q-04 precedence resolver (CLI > config > default)"
      contains: "resolvePileMode"
    - path: "apps/factory-cli/src/pile-persistence.ts"
      provides: "Q-07 per-pile artifact writer; sole fs ingress for pile artifacts"
      contains: "writePileArtifacts"
  key_links:
    - from: "apps/factory-cli/src/main.ts"
      to: "@protostar/dogpile-adapter runFactoryPile"
      via: "import"
      pattern: "runFactoryPile"
    - from: "apps/factory-cli/src/main.ts"
      to: "apps/factory-cli/src/pile-persistence.ts"
      via: "import { writePileArtifacts }"
      pattern: "writePileArtifacts"
---

<objective>
Wave 3 — wire `apps/factory-cli` to invoke piles. This is the orchestration plan: CLI flag parsing, factory-config schema parsing, mode precedence, per-pile persistence, refusal-index extension, and main.ts pile-invocation flow.

Purpose: PILE-01 (planning-mode pile produces admitted plan), PILE-04 (refusal symmetry), PILE-05 (budget exhaustion fails pile not run — actually enforced by Plan 04's runFactoryPile; this plan threads the parent AbortController correctly).

Output: factory-cli end-to-end pile invocation. Wave 4 contract tests will verify e2e behaviour.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/06-live-dogpile-piles/06-CONTEXT.md
@.planning/phases/06-live-dogpile-piles/06-RESEARCH.md
@apps/factory-cli/src/main.ts
@apps/factory-cli/src/cli-args.ts
@apps/factory-cli/src/load-factory-config.ts
@apps/factory-cli/src/refusals-index.ts
@packages/lmstudio-adapter/src/factory-config.schema.json

<interfaces>
PileMode = `"fixture" | "live"`. Precedence (D-04): CLI flag > factory-config.json piles.{kind}.mode > built-in default `"fixture"`.

Pile-persistence layout (D-07):
```
runs/{id}/piles/
  planning/iter-0/{result.json,trace.json,refusal.json?}
  review/iter-{N}/{...}
  execution-coordination/iter-{N}/{...}
```

Refusal index extension (D-12):
```ts
// before:
type RefusalStage = "intent" | "planning" | "precedence" | "workspace-trust" | "repo-runtime" | "coder-adapter-ready";
// after:
type RefusalStage = ...existing | "pile-planning" | "pile-review" | "pile-execution-coordination";
```

Per-agent provider routing (Q-03 fallback — VERIFIED at Plan 04 planning that AgentSpec lacks per-agent provider field):
- factory-cli inspects pile preset's `agents[]` and the optional `factory-config.json: piles.<kind>.providers: { <agentId>: { baseUrl, model } }` block.
- For each unique baseUrl/model, factory-cli constructs one `ConfiguredModelProvider` via `createOpenAICompatibleProvider`.
- factory-cli then composes a single provider passed to runFactoryPile. (For v0.1 cosmetic-tweak archetype, all agents share one provider — single-provider path.)
- If config block absent, all agents use the shared default provider.
- This is the Wave 1 fallback path documented in RESEARCH Pitfall 2 / Assumption A1.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: CLI flags + factory-config piles parsing + RefusalStage extension</name>
  <files>apps/factory-cli/src/cli-args.ts, apps/factory-cli/src/cli-args.test.ts, apps/factory-cli/src/load-factory-config.ts, apps/factory-cli/src/load-factory-config.test.ts, apps/factory-cli/src/refusals-index.ts, apps/factory-cli/src/refusals-index.test.ts</files>
  <read_first>
    - apps/factory-cli/src/cli-args.ts (current parser — confirm parsing pattern; minimum-touch addition)
    - apps/factory-cli/src/load-factory-config.ts (current piles? confirm; integrate piles block parsing)
    - apps/factory-cli/src/refusals-index.ts (lines 3-9 — current RefusalStage)
    - packages/lmstudio-adapter/src/factory-config.schema.json (Plan 02 — confirm piles block landed)
  </read_first>
  <behavior>
    - `cli-args.ts` exports a parser that accepts `--planning-mode <fixture|live>`, `--review-mode <fixture|live>`, `--exec-coord-mode <fixture|live>`. Invalid values fail with a typed error.
    - `load-factory-config.ts` validates the `piles` block against the schema (use existing JSON Schema validation; per Plan 02 the schema declares `additionalProperties: false`).
    - `refusals-index.ts` extends `RefusalStage` with `"pile-planning" | "pile-review" | "pile-execution-coordination"`. No change to `formatRefusalIndexLine` or `appendRefusalIndexEntry` shapes (additive enum extension).
  </behavior>
  <action>
    Tests (3 files, distributed):
    
    `cli-args.test.ts` (3 cases):
    1. `--planning-mode live` parses to `{ planningMode: "live" }`.
    2. `--planning-mode invalid` throws.
    3. all three flags supported simultaneously.
    
    `load-factory-config.test.ts` (3 cases):
    1. config with valid piles block parses; resulting object has `piles.planning.mode === "live"`.
    2. config with invalid mode value (e.g. "auto") fails schema validation.
    3. config without piles block returns `piles === undefined` (additive — no PILE config defaults to fixture mode).
    
    `refusals-index.test.ts` extension (2 cases):
    1. RefusalStage type accepts `"pile-planning"`, `"pile-review"`, `"pile-execution-coordination"` (compile-time check via assignment).
    2. `formatRefusalIndexLine({ stage: "pile-planning", ... })` returns valid JSON line ending in `\n`.

    Run RED. Implement minimal additions to each file. GREEN.

    Per D-04 (Q-04): CLI > config > default. Per D-12 (Q-12): refusal symmetry — extend the enum, do not introduce a parallel pipe.
  </action>
  <verify>
    <automated>pnpm --filter protostar-factory test --grep "cli-args|load-factory-config|refusals-index" 2>&amp;1 | grep -E "✔|pass" | head -20 &amp;&amp; pnpm --filter protostar-factory build &amp;&amp; grep -q "pile-planning" apps/factory-cli/src/refusals-index.ts &amp;&amp; grep -q "pile-review" apps/factory-cli/src/refusals-index.ts &amp;&amp; grep -q "pile-execution-coordination" apps/factory-cli/src/refusals-index.ts</automated>
  </verify>
  <acceptance_criteria>
    - Command exits 0: `pnpm --filter protostar-factory test --grep "cli-args|load-factory-config|refusals-index" 2>&amp;1 | grep -E "✔|pass" | head -20 &amp;&amp; pnpm --filter protostar-factory build &amp;&amp; grep -q "pile-planning" apps/factory-cli/src/refusals-index.ts &amp;&amp; grep -q "pile-review" apps/factory-cli/src/refusals-index.ts &amp;&amp; grep -q "pile-execution-coordination" apps/factory-cli/src/refusals-index.ts`
    - All grep/test invocations inside the command match (the command's `&&` chain enforces this — any failed step fails the whole gate).
    - No subjective judgment used; verification is binary on the shell exit status of the automated command above.
  </acceptance_criteria>
  <done>
    All extension tests pass; existing factory-cli tests still pass; RefusalStage extended.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: pile-mode-resolver + pile-persistence (Q-04 precedence + Q-07/Q-08 persistence)</name>
  <files>apps/factory-cli/src/pile-mode-resolver.ts, apps/factory-cli/src/pile-mode-resolver.test.ts, apps/factory-cli/src/pile-persistence.ts, apps/factory-cli/src/pile-persistence.test.ts</files>
  <read_first>
    - apps/factory-cli/src/cli-args.ts (Task 1 output — flag types)
    - apps/factory-cli/src/load-factory-config.ts (Task 1 output — config types)
    - apps/factory-cli/src/snapshot-writer.ts (existing atomic tmp+rename pattern to mirror)
    - .planning/phases/06-live-dogpile-piles/06-CONTEXT.md §"Q-07" (layout) + §"Q-08" (always persist trace)
  </read_first>
  <behavior>
    `pile-mode-resolver.ts`:
    - `resolvePileMode(kind: PileKind, cli: { planningMode?, reviewMode?, execCoordMode? }, config: FactoryConfig['piles']): "fixture" | "live"`.
    - Precedence: CLI flag (if defined) > config[kind].mode (if defined) > "fixture".

    `pile-persistence.ts`:
    - `writePileArtifacts(input: { runId, kind, iteration, outcome: PileRunOutcome, refusal?: { reason: string; stage: RefusalStage; sourceOfTruth: PileSourceOfTruth } }, deps?: { writeFile?, mkdir? }): Promise<{ resultPath?, tracePath?, refusalPath? }>`.
    - On `outcome.ok === true`: writes `result.json` (JSON.stringify(outcome.result, null, 2)) and `trace.json` (JSON.stringify(outcome.trace, null, 2)) atomically.
    - On `outcome.ok === false`: writes `refusal.json` with the PileFailure + refusal envelope (sourceOfTruth + reason); does NOT write result.json/trace.json (no run output to capture).
    - All writes via tmp+rename (mirror existing snapshot-writer pattern).
    - Layout: `${runRoot}/runs/${runId}/piles/${kindDirName}/iter-${iteration}/` where `kindDirName` = `kind` (i.e. `planning`, `review`, `execution-coordination`).
    - Pure-ish: file system writes are explicit; deps injectable for tests.
  </behavior>
  <action>
    `pile-mode-resolver.test.ts` (4 cases):
    1. CLI flag set, config set → CLI wins.
    2. CLI flag absent, config set → config wins.
    3. both absent → "fixture".
    4. invalid CLI value rejected upstream (cli-args layer); resolver only sees valid values — test that resolver doesn't crash on undefined.

    `pile-persistence.test.ts` (5 cases) using a mock fs:
    1. ok=true outcome → writes result.json AND trace.json; no refusal.json.
    2. ok=false outcome → writes refusal.json only; no result.json/trace.json.
    3. trace serialization round-trips (JSON.parse(trace.json) deeply equals input.outcome.trace).
    4. atomic write: tmp file is created then renamed (mock fs verifies rename call).
    5. layout: writes go to `runs/<runId>/piles/<kind>/iter-<N>/` with kind in [`planning`, `review`, `execution-coordination`].

    Run RED. Implement. GREEN.

    Per D-07 (Q-07): factory-cli owns ALL writes (zero fs in dogpile-adapter — Plan 01 contract enforces). Per D-08 (Q-08): always persist trace.json.
  </action>
  <verify>
    <automated>pnpm --filter protostar-factory test --grep "pile-mode-resolver|pile-persistence"</automated>
  </verify>
  <acceptance_criteria>
    - Command exits 0: `pnpm --filter protostar-factory test --grep "pile-mode-resolver|pile-persistence"`
    - All grep/test invocations inside the command match (the command's `&&` chain enforces this — any failed step fails the whole gate).
    - No subjective judgment used; verification is binary on the shell exit status of the automated command above.
  </acceptance_criteria>
  <done>
    9 tests pass across both files; both modules export their primary functions; build passes.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3a: main.ts planning seam + run-level AbortController + provider routing helper</name>
  <files>apps/factory-cli/src/main.ts, apps/factory-cli/src/main.test.ts (extend existing)</files>
  <read_first>
    - apps/factory-cli/src/main.ts (full file — current run flow; identify the planning admission seam)
    - apps/factory-cli/src/main.test.ts (existing test patterns)
    - apps/factory-cli/src/main.real-execution.test.ts (Phase 4 SIGINT/sentinel pattern — reuse the parent AbortController)
    - apps/factory-cli/src/run-real-execution.ts (Phase 4 invocation pattern to mirror at the pile invocation site)
    - .planning/phases/06-live-dogpile-piles/06-CONTEXT.md §"Q-03" (per-agent provider routing fallback)
  </read_first>
  <behavior>
    main.ts modifications (planning-seam slice only):
    1. After parsing CLI args + factory-config, build the `pileMode` map via `resolvePileMode` for each pile kind.
    2. Construct the run-level `AbortController` (`runAbortController`) — REUSE Phase 4's existing one if already present; otherwise create. Its signal is the parent for ALL pile invocations (planning + review + exec-coord — Tasks 3a and 3b share the same controller).
    3. Build the per-agent provider routing helper `buildPileProvider(kind, presetAgents, configPilesProviders)`. Default path: single `createOpenAICompatibleProvider({ baseUrl: factoryConfig.adapters.coder.baseUrl })`. Per-agent overrides: when `factory-config.json: piles.<kind>.providers` declares `{ <agentId>: { baseUrl, model } }` entries, build one ConfiguredModelProvider per unique baseUrl/model. For v0.1 cosmetic-tweak archetype the single-provider path is exercised; the helper is unit-tested inline so per-agent paths are covered without requiring the cosmetic loop to use them.
    4. **Planning seam (PILE-01):** if `pileMode.planning === "live"`:
        a. Resolve provider via `buildPileProvider("planning", planningPilePreset.agents, factoryConfig.piles?.planning?.providers)`.
        b. Build mission via `buildPlanningMission(intent)`.
        c. Build PileRunContext: `{ provider, signal: runAbortController.signal, budget: resolvePileBudget(planningPilePreset.budget, intent.capabilityEnvelope.budget), now: () => Date.now(), onEvent: (ev) => emitLifecycleEvent(ev) }`.
        d. `outcome = await runFactoryPile(mission, ctx)`.
        e. Persist via `writePileArtifacts({ runId, kind: "planning", iteration: 0, outcome, refusal? })`.
        f. On ok=true: parse via `parsePlanningPileResult` → `admitCandidatePlans` (existing path). On parse failure: write refusal.json + append .protostar/refusals.jsonl with stage `"pile-planning"` + sourceOfTruth `"PlanningPileResult"`. On outcome.ok=false: same refusal path with PileFailure as evidence.
    5. **Auto-fallback prohibition (D-06):** on any pile failure (ok=false OR parse error), factory-cli writes the refusal artifact, exits non-zero, and DOES NOT silently switch to fixture.
  </behavior>
  <action>
    Tests (4 cases) extending `main.test.ts`:
    1. **pile-mode-precedence** — CLI `--planning-mode live`, config `piles.planning.mode = "fixture"` → resolved mode `"live"`; assert runFactoryPile invoked.
    2. **planning-pile fixture mode (default)** — no flags, no config piles block → planning seam takes the fixture path; runFactoryPile NOT invoked. (Use a stubbed runFactoryPile to confirm zero invocations.)
    3. **planning-pile live failure → refusal** — stub runFactoryPile to return `{ ok: false, failure: pile-timeout }`; assert main.ts writes refusal.json AND appends `.protostar/refusals.jsonl` with stage `"pile-planning"`; exit code non-zero. **No auto-fallback to fixture.**
    4. **abort cascade (planning)** — caller aborts `runAbortController`; assert open planning pile invocation receives the abort signal (via the stubbed runFactoryPile capturing ctx.signal.aborted).

    `buildPileProvider` is unit-tested inline (2 cases): default single-provider path; per-agent override map produces one provider per unique baseUrl.

    Run RED. Implement minimal main.ts diff to thread the planning-seam flow. GREEN.

    Per D-01/D-02 (Q-01/Q-02): single SDK seam via runFactoryPile. Per D-06 (Q-06): no auto-fallback. Per D-11 (Q-11): runAbortController is parent; pile timeouts are children.
  </action>
  <verify>
    <automated>pnpm --filter protostar-factory test --grep "pile-mode-precedence|planning-pile|abort cascade|buildPileProvider" &amp;&amp; pnpm --filter protostar-factory build</automated>
  </verify>
  <acceptance_criteria>
    - Command exits 0: `pnpm --filter protostar-factory test --grep "pile-mode-precedence|planning-pile|abort cascade|buildPileProvider" &amp;&amp; pnpm --filter protostar-factory build`
    - All grep/test invocations inside the command match (the command's `&&` chain enforces this — any failed step fails the whole gate).
    - No subjective judgment used; verification is binary on the shell exit status of the automated command above.
  </acceptance_criteria>
  <done>
    All 6 main.test extensions pass (4 planning-seam + 2 buildPileProvider); existing factory-cli tests remain passing; runtime no-fs contract on dogpile-adapter (Plan 01 Task 3) still passes (factory-cli owns all writes). Run-level AbortController is wired and ready for Task 3b to consume.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3b: main.ts review seam + exec-coord seams (sharing the run-level AbortController + provider helper from 3a)</name>
  <files>apps/factory-cli/src/main.ts, apps/factory-cli/src/main.test.ts (extend existing)</files>
  <read_first>
    - apps/factory-cli/src/main.ts (after Task 3a — confirm runAbortController + buildPileProvider are in place)
    - packages/review/src/index.ts (after Plan 05 — confirm createReviewPileModelReviewer exported)
    - packages/repair/src/index.ts (after Plan 06 — confirm parseExecutionCoordinationPileResult + admitRepairPlanProposal exported)
    - packages/planning/src/index.ts (after Plan 06 — confirm admitWorkSlicing exported)
  </read_first>
  <behavior>
    main.ts modifications (review + exec-coord slices):
    1. **Review seam (PILE-02):** when Phase 5's review-repair loop is invoked AND `pileMode.review === "live"`, factory-cli constructs the ModelReviewer via `createReviewPileModelReviewer({ runPile: runFactoryPile, buildContext: (input) => ({ provider: buildPileProvider("review", reviewPilePreset.agents, factoryConfig.piles?.review?.providers), signal: runAbortController.signal, budget: resolvePileBudget(reviewPilePreset.budget, intent.capabilityEnvelope.budget), now: Date.now, onEvent: ... }) })` and passes it into the loop where Phase 5's fixture passthrough was used. Persist outcomes via `writePileArtifacts({ runId, kind: "review", iteration, outcome })` at each iteration.
    2. **Exec-coord seam (PILE-03):** at BOTH the work-slicing trigger AND the post-`synthesizeRepairPlan` trigger, factory-cli (gated by `pileMode.executionCoordination === "live"`) builds the mission via `buildExecutionCoordinationMission(intent, mode, input)`, calls runFactoryPile with ctx referencing `runAbortController.signal` and `buildPileProvider("execution-coordination", ...)`, parses via `parseExecutionCoordinationPileResult`, and feeds the output to `admitWorkSlicing` (work-slicing trigger) or `admitRepairPlanProposal` (repair-plan trigger). Persist via `writePileArtifacts({ runId, kind: "execution-coordination", iteration, outcome })`.
    3. **Auto-fallback prohibition (D-06)** continues to apply: any pile failure (ok=false OR parse error OR admission rejection at the seams) writes refusal.json + refusals.jsonl entry with the appropriate stage (`pile-review` / `pile-execution-coordination`) and exits non-zero. No silent fallback.
  </behavior>
  <action>
    Tests (3 cases) extending `main.test.ts`:
    1. **review-pile-seam** — `--review-mode live`; stub createReviewPileModelReviewer's runPile to return ok=true with valid ReviewPileBody; assert review-repair loop receives the live ModelReviewer (NOT the fixture passthrough); pile artifacts persisted at `runs/{id}/piles/review/iter-0/`.
    2. **exec-coord work-slicing trigger** — `--exec-coord-mode live`; admittedPlan triggers the work-slicing heuristic (targetFiles>3); stub runFactoryPile to return ok=true with a work-slicing proposal; assert admitWorkSlicing called and the re-admitted plan replaces the original; artifacts at `runs/{id}/piles/execution-coordination/iter-0/`.
    3. **exec-coord repair-plan failure → refusal** — `--exec-coord-mode live`; stub runFactoryPile post-synthesizeRepairPlan to return ok=false with a pile-timeout; assert refusal.json written with stage `"pile-execution-coordination"`; deterministic RepairPlan path NOT silently substituted (D-06 — explicit refusal, operator decides).

    Run RED. Implement minimal main.ts diff threading both seams through the existing runAbortController + buildPileProvider. GREEN.

    Per D-14 (Q-14): review seam uses createReviewPileModelReviewer. Per D-15 (Q-15): exec-coord pile is invoked at both work-slicing and repair-plan triggers; admission helpers gate both. Per D-06 (Q-06): no auto-fallback at any seam.
  </action>
  <verify>
    <automated>pnpm --filter protostar-factory test --grep "review-pile-seam|exec-coord" &amp;&amp; pnpm --filter protostar-factory build &amp;&amp; pnpm run verify</automated>
  </verify>
  <acceptance_criteria>
    - Command exits 0: `pnpm --filter protostar-factory test --grep "review-pile-seam|exec-coord" &amp;&amp; pnpm --filter protostar-factory build &amp;&amp; pnpm run verify`
    - All grep/test invocations inside the command match (the command's `&&` chain enforces this — any failed step fails the whole gate).
    - No subjective judgment used; verification is binary on the shell exit status of the automated command above.
  </acceptance_criteria>
  <done>
    All 3 main.test extensions pass; full `pnpm run verify` is green; existing factory-cli tests remain passing; runtime no-fs contract on dogpile-adapter (Plan 01 Task 3) still passes. All three pile seams (planning from 3a, review + exec-coord from 3b) share the same runAbortController and the same buildPileProvider helper.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Operator CLI invocation → cli-args parser | Untrusted command-line input. |
| factory-config.json (operator-authored) → load-factory-config | Untrusted config crosses fs boundary. |
| Pile output (live mode) → factory-cli persistence | Network-derived bytes reach disk; size + content unchecked except via parser. |
| Run-level AbortController → pile invocations | Authority boundary: parent must cascade; pile timeouts must NOT bubble up. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-6-06 | Tampering / Repudiation | Live failure silently substitutes fixture (D-06 violation) | mitigate | Test 3 enforces non-zero exit + refusal artifact; no fallback code path exists |
| T-6-23 | Tampering | Pile output written outside the run dir (path traversal via runId) | mitigate | runId is generated by factory-cli (Phase 4 Q-09 cyclic seam); writePileArtifacts joins via `node:path` resolve and asserts target stays under runs/ root |
| T-6-24 | Information Disclosure | trace.json contains chat content with secrets | accept | LM Studio runs locally; secrets are not present in prompts; document in CONCERNS for Phase 7+ when remote providers may carry tokens |
| T-6-25 | Denial of Service | Trace blob volume balloons under repeated dogfood | accept | Q-08 mandates always-persist; pruning recipe deferred to Phase 9 OP-08 |
| T-6-26 | Elevation of Privilege | Per-agent provider override redirects to attacker-controlled endpoint | mitigate | factory-config.json piles.<kind>.providers baseUrl is operator-authored; capability envelope's `network.allowedHosts` (Phase 2) constrains; reject mismatches at provider build time |
</threat_model>

<verification>
- `pnpm run verify` passes (full suite).
- factory-cli runs in fixture mode by default (no LM Studio dependency for unit/contract tests).
- Live mode is gated on `--planning-mode live` OR `factory-config.json: piles.planning.mode = "live"`.
- Pile failures produce refusal.jsonl entries with the right stage.
</verification>

<success_criteria>
- PILE-01 satisfied: `--planning-mode live` invokes planningPilePreset against @dogpile/sdk and produces an admitted plan via the unchanged admission path (Wave 4 Plan 08 verifies end-to-end).
- PILE-04 satisfied: pile failures produce no-admission artifacts byte-compatible with fixture parse failures (Wave 4 snapshot test verifies).
- PILE-05 satisfied: pile-level timeout aborts only the pile (Plan 04 Test 6 + this plan's run-level controller threading).
- The dark-factory contract holds: live failures NEVER substitute fixture data; refusals are evidence-bearing.
</success_criteria>

<output>
After completion, create `.planning/phases/06-live-dogpile-piles/06-07-SUMMARY.md` recording: CLI flag list, config schema usage, persistence layout verified, refusal stage extensions, abort hierarchy threading, per-agent provider fallback shape.
</output>
