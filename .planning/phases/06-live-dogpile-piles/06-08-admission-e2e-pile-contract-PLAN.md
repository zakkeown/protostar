---
phase: 06-live-dogpile-piles
plan: 08
type: execute
wave: 4
depends_on: [03, 04, 05, 06, 07]
files_modified:
  - packages/admission-e2e/src/dogpile-adapter-no-fs.contract.test.ts
  - packages/admission-e2e/src/pile-refusal-byte-equality.contract.test.ts
  - packages/admission-e2e/src/pile-integration-smoke.contract.test.ts
autonomous: true
requirements: [PILE-03, PILE-04, PILE-06]
tags: [admission-e2e, contract-tests, no-fs-runtime, refusal-symmetry]
must_haves:
  truths:
    - "runtime no-fs contract: invoking runFactoryPile with a stub provider does not read or write through node:fs (Q-09 runtime defense in depth)"
    - "refusal byte-equality: fixture-parse failure refusal artifact and pile-schema-parse failure refusal artifact differ ONLY in the failure-class discriminator field (PILE-04)"
    - "pile integration smoke: --planning-mode live with a stub ConfiguredModelProvider produces an admitted plan via the existing planning admission path (PILE-01 / PILE-03 dual triggers)"
  artifacts:
    - path: "packages/admission-e2e/src/dogpile-adapter-no-fs.contract.test.ts"
      provides: "Q-09 runtime fs-stub regression"
      min_lines: 40
    - path: "packages/admission-e2e/src/pile-refusal-byte-equality.contract.test.ts"
      provides: "PILE-04 fixture-vs-live refusal byte-equality"
      min_lines: 40
    - path: "packages/admission-e2e/src/pile-integration-smoke.contract.test.ts"
      provides: "PILE-01 / PILE-03 end-to-end smoke with stub provider"
      min_lines: 40
  key_links:
    - from: "packages/admission-e2e/src/dogpile-adapter-no-fs.contract.test.ts"
      to: "@protostar/dogpile-adapter runFactoryPile"
      via: "import"
      pattern: "runFactoryPile"
    - from: "packages/admission-e2e/src/pile-refusal-byte-equality.contract.test.ts"
      to: "apps/factory-cli pile-persistence"
      via: "import"
      pattern: "writePileArtifacts"
---

<objective>
Wave 4 — close the verification loop with three e2e contract tests in `@protostar/admission-e2e`: runtime no-fs (Q-09 defense in depth), refusal byte-equality (PILE-04), and a stub-provider integration smoke (PILE-01 + PILE-03).

Purpose: Plans 01-07 supplied the implementation; this plan supplies the regressions that prevent silent drift. PILE-06 (no-fs) is enforced via TWO tests now (static in Plan 01 + runtime here). PILE-04 (refusal symmetry) and PILE-01/PILE-03 (planning + exec-coord triggers) are exercised end-to-end.

Output: Three contract tests in admission-e2e; all green.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/06-live-dogpile-piles/06-CONTEXT.md
@.planning/phases/06-live-dogpile-piles/06-RESEARCH.md
@packages/admission-e2e/src/authority-no-fs.contract.test.ts
@packages/dogpile-adapter/src/index.ts
@packages/dogpile-adapter/src/run-factory-pile.ts
@apps/factory-cli/src/pile-persistence.ts
@apps/factory-cli/src/refusals-index.ts

<interfaces>
**Stub ConfiguredModelProvider** (constructed inline in tests): minimum surface to satisfy `@dogpile/sdk` provider contract — see `node_modules/.pnpm/@dogpile+sdk@0.2.0/.../dist/types.d.ts` for `ConfiguredModelProvider` shape; for stubs, the tests can either:
(a) wrap the real `createOpenAICompatibleProvider` with a fetch interceptor that returns deterministic JSON, OR
(b) inject a fake `stream` function via the `RunFactoryPileDeps` seam (Plan 04 Task 1) — RECOMMENDED, simpler.

**Runtime fs-stub pattern (Q-09):**
```ts
// Wrap node:fs at module load via experimental loader OR more pragmatically:
// 1) Construct a Proxy that throws on any property access.
// 2) Use node:test mock.module('node:fs', { ... }) to replace before runFactoryPile loads.
// If module mocking is awkward, the pragmatic version: invoke runFactoryPile with the deps-injection seam,
// and assert via static analysis + the Plan 01 static test that no fs imports exist in the call chain.
```
RECOMMENDED: use the `RunFactoryPileDeps` seam (inject a fake `stream`) and assert that running runFactoryPile end-to-end (with a fake provider that yields a deterministic RunResult) does not trigger any `node:fs` access — verified by the absence of fs imports in transitive code (re-run the static walker on the resolved import graph at test time).

**Refusal byte-equality (PILE-04):**
- Synthesize a fixture-parse failure: feed an unparsable string through `parsePlanningPileResult` and capture the resulting refusal artifact.
- Synthesize a pile-schema-parse failure: build a PileFailure with `class: "pile-schema-parse"` and run it through factory-cli's `writePileArtifacts` refusal path.
- Compare the two refusal artifacts; they must be byte-equal modulo the discriminator field (`failure.class` and any timestamps).
- Asserts evidence-uniformity per CONTEXT Q-12.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Runtime no-fs contract test for dogpile-adapter (Q-09 runtime defense in depth)</name>
  <files>packages/admission-e2e/src/dogpile-adapter-no-fs.contract.test.ts</files>
  <read_first>
    - packages/admission-e2e/src/authority-no-fs.contract.test.ts (static walker pattern)
    - packages/dogpile-adapter/src/run-factory-pile.ts (RunFactoryPileDeps seam from Plan 04 Task 1)
    - .planning/phases/06-live-dogpile-piles/06-RESEARCH.md §"Pattern 4" (runtime test sketch)
  </read_first>
  <behavior>
    - Test invokes `runFactoryPile(mission, ctx, { stream: fakeStream })` where `fakeStream` returns a StreamHandle yielding 1 RunEvent and resolving to a deterministic RunResult.
    - Defense-in-depth: in addition to the dynamic call, the test ALSO walks the dogpile-adapter src + its imports (transitively into @protostar/dogpile-types but NOT past the @dogpile/sdk boundary) and asserts no fs imports.
    - The transitive walker is the runtime equivalent of "would this code path touch fs if executed."
    - Test name includes the literal `"dogpile-adapter-no-fs"` so `--grep dogpile-adapter-no-fs` matches.
  </behavior>
  <action>
    Create `packages/admission-e2e/src/dogpile-adapter-no-fs.contract.test.ts`:
    - Mirror `authority-no-fs.contract.test.ts` static walker but rooted at `packages/dogpile-adapter/src` AND `packages/dogpile-types/src`.
    - EXCLUDE the existing `packages/dogpile-adapter/src/no-fs.contract.test.ts` from the walk (it has fs imports for self-walking).
    - Add a SECOND `it(...)` block: run `runFactoryPile(mission, ctx, { stream: fakeStream })` with a fake stream that yields one event and resolves to a stub RunResult. Assert outcome.ok === true. If the function completes without error, the runtime exercise has run end-to-end without crashing — combined with the static walker, this is the runtime defense.
    - Use a dependencies-injection approach (NO module-level fs proxy). The fake stream lives in the test file.

    Per D-09 (Q-09): both static (Plan 01) AND runtime (this plan) — defense in depth.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/admission-e2e test --grep dogpile-adapter-no-fs</automated>
  </verify>
  <acceptance_criteria>
    - Command exits 0: `pnpm --filter @protostar/admission-e2e test --grep dogpile-adapter-no-fs`
    - All grep/test invocations inside the command match (the command's `&&` chain enforces this — any failed step fails the whole gate).
    - No subjective judgment used; verification is binary on the shell exit status of the automated command above.
  </acceptance_criteria>
  <done>
    Both `it` blocks pass; the file exists at the documented path; static walker reports zero offenders; runtime invocation completes ok=true.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Refusal byte-equality contract (PILE-04)</name>
  <files>packages/admission-e2e/src/pile-refusal-byte-equality.contract.test.ts</files>
  <read_first>
    - packages/planning/src/index.ts §parsePlanningPileResult (existing fixture-parse failure path — capture refusal shape)
    - apps/factory-cli/src/pile-persistence.ts (Plan 07 Task 2 — refusal write path)
    - apps/factory-cli/src/refusals-index.ts (refusal entry shape)
    - .planning/phases/06-live-dogpile-piles/06-RESEARCH.md §"Pitfall 4"
  </read_first>
  <behavior>
    - Build TWO refusal artifacts:
      A. Fixture-parse failure: invoke `parsePlanningPileResult({ output: "not json" })` and convert the parse-error result to a refusal artifact via the existing factory-cli refusal-writing helper.
      B. Pile-schema-parse failure: invoke `writePileArtifacts({ outcome: { ok: false, failure: { kind: "planning", class: "pile-schema-parse", sourceOfTruth: "PlanningPileResult", parseErrors: ["not json"] } }, ... })`.
    - Compare the two written refusal artifacts.
    - Assert they are byte-equal modulo:
      - `failure.class` (B has it, A may not have the same string)
      - `timestamp` fields
    - All other top-level keys (sourceOfTruth, runId, stage prefix `"pile-planning"`/`"planning"`, schemaVersion) must agree.
    - Test name includes `"refusal-byte-equal"` for grep.
  </behavior>
  <action>
    Implement the test with a temporary directory (mkdtemp from node:fs/promises — admission-e2e is allowed fs access; the fs-authority rule applies to packages/* and dogpile-adapter, not admission-e2e tests). Use the existing factory-cli helpers.

    Test asserts:
    1. Both refusal.json files exist.
    2. After loading both, removing the keys in the modulo-list above, the remaining objects are deepEqual.
    3. The discriminator difference is exactly the failure-class field.

    Per D-12 (Q-12): refusal symmetry — fixture and live failures funnel through the same artifact shape.
    Per D-06 (Q-06): live failure is first-class refusal, never silently substituted.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/admission-e2e test --grep refusal-byte-equal</automated>
  </verify>
  <acceptance_criteria>
    - Command exits 0: `pnpm --filter @protostar/admission-e2e test --grep refusal-byte-equal`
    - All grep/test invocations inside the command match (the command's `&&` chain enforces this — any failed step fails the whole gate).
    - No subjective judgment used; verification is binary on the shell exit status of the automated command above.
  </acceptance_criteria>
  <done>
    Test passes; the two refusal artifacts agree on all schema-uniform fields; the only difference is the documented failure-class discriminator.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Pile integration smoke — planning + exec-coord with stub provider (PILE-01, PILE-03)</name>
  <files>packages/admission-e2e/src/pile-integration-smoke.contract.test.ts</files>
  <read_first>
    - apps/factory-cli/src/main.ts (Plan 07 Task 3 — pile invocation flow)
    - apps/factory-cli/src/main.real-execution.test.ts (existing integration test pattern)
    - packages/dogpile-adapter/src/run-factory-pile.ts (RunFactoryPileDeps stream injection seam)
    - .planning/phases/06-live-dogpile-piles/06-CONTEXT.md §"Q-15" (work-slicing + repair-plan triggers)
  </read_first>
  <behavior>
    - Three `it(...)` blocks:
    
    A. **planning-pile-live** — invoke factory-cli main with `--planning-mode live`, a stubbed runFactoryPile that returns a deterministic RunResult containing a valid `PlanningPileResult.output` (a tiny CandidatePlan JSON). Assert main writes `runs/<id>/admitted-plan.json` AND `terminal-status.json.status === "admitted"`.
    
    B. **work-slicing-trigger** — same as A but additionally configure factory-config.json to enable executionCoordination live mode AND craft an admitted plan that crosses the work-slicing threshold (targetFiles > 3). Stub the exec-coord runFactoryPile to return a valid work-slicing proposal. Assert factory-cli invokes admitWorkSlicing AND the resulting plan is the sliced version.
    
    C. **repair-plan-trigger** — invoke factory-cli with a stubbed mechanical review that fails some tasks. Stub exec-coord runFactoryPile to return a repair-plan proposal. Assert factory-cli invokes admitRepairPlanProposal AND the deterministic synthesizeRepairPlan output is overridden by the pile-derived RepairPlan.
  </behavior>
  <action>
    Build the three tests in one file with shared setup (tmpdir, fixture intent, stubbed providers via the dependency-injection seams established in Plans 04/07).
    Each test name contains the grep token literally: `"planning-pile-live"`, `"work-slicing-trigger"`, `"repair-plan-trigger"`.

    Per PILE-01: planning pile produces an admitted plan via existing path.
    Per PILE-03: exec-coord pile invoked at BOTH triggers (work-slicing AND repair-plan).
    Per D-06 (Q-06): if any of the three are forced to fail, factory-cli refuses (covered by Plan 07 Task 3 Test 3; this plan covers the success paths).
  </action>
  <verify>
    <automated>pnpm --filter @protostar/admission-e2e test --grep "planning-pile-live|work-slicing-trigger|repair-plan-trigger" &amp;&amp; pnpm run verify</automated>
  </verify>
  <acceptance_criteria>
    - Command exits 0: `pnpm --filter @protostar/admission-e2e test --grep "planning-pile-live|work-slicing-trigger|repair-plan-trigger" &amp;&amp; pnpm run verify`
    - All grep/test invocations inside the command match (the command's `&&` chain enforces this — any failed step fails the whole gate).
    - No subjective judgment used; verification is binary on the shell exit status of the automated command above.
  </acceptance_criteria>
  <done>
    All three integration smoke blocks pass; full repo `pnpm run verify` is green; PILE-01, PILE-03, PILE-04, PILE-06 are all backed by automated regressions.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Stubbed pile output → integration test assertions | Tests act as adversarial pile output to verify admission boundary holds. |
| dogpile-adapter src/ → fs (runtime) | Defense-in-depth boundary on top of Plan 01's static check. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-6-07 | Tampering | Future change introduces fs import in dogpile-adapter via a transitive dep | mitigate | Task 1 transitive walker AND existing static test in Plan 01 — both must remain green |
| T-6-06 (recap) | Tampering / Repudiation | Refusal artifact shape drift between fixture and live paths | mitigate | Task 2 byte-equality test fails on any unintentional schema drift |
| T-6-27 | Elevation of Privilege | Pile-derived plan bypasses admission seam in integration test | mitigate | Task 3 asserts admitWorkSlicing/admitRepairPlanProposal are CALLED (test spies on the admission helpers); never permit a pile output to reach execution without admission |
</threat_model>

<verification>
- All three contract tests pass.
- `pnpm run verify` (full suite) is green.
- The Plan 01 static no-fs test AND the Plan 08 Task 1 runtime test BOTH pass (Q-09 defense in depth).
- The byte-equality test (Task 2) confirms PILE-04's "same as fixture" success criterion.
- The integration smoke (Task 3) confirms PILE-01 and PILE-03 (both triggers) end-to-end with stubs.
</verification>

<success_criteria>
- PILE-06 doubly-enforced (static + runtime).
- PILE-04 has a regression test pinning byte-equality.
- PILE-01 has end-to-end coverage with a stub provider; live LM Studio smoke remains a manual verification per VALIDATION.md.
- PILE-03 has both work-slicing AND repair-plan trigger coverage.
- The phase verification gate (`pnpm run verify` green) is met.
</success_criteria>

<output>
After completion, create `.planning/phases/06-live-dogpile-piles/06-08-SUMMARY.md` recording: three new contract tests, requirement IDs covered, full verify status, manual smoke remaining (LM Studio live).
</output>
