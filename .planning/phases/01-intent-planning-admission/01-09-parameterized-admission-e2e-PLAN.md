---
phase: 01-intent-planning-admission
plan: 09
type: execute
wave: 3
depends_on: [03, 04, 06, 07, 08]
files_modified:
  - packages/admission-e2e/src/fixture-discovery.ts
  - packages/admission-e2e/src/parameterized-admission.test.ts
  - packages/admission-e2e/src/ac-normalization-deep-equal.test.ts
  - packages/admission-e2e/src/snapshot-mutator.ts
  - packages/admission-e2e/src/snapshot-mutator-fuzzed.test.ts
  - packages/admission-e2e/package.json
  - packages/admission-e2e/tsconfig.json
autonomous: true
requirements:
  - INTENT-01
  - INTENT-03
  - PLAN-A-01
  - PLAN-A-02
must_haves:
  truths:
    - "A single parameterized test in packages/admission-e2e loops every file under examples/intents/**/*.json AND examples/planning-results/**/*.json (Q-11)"
    - "Files under bad/ subdirs MUST reject; files outside bad/ MUST pass — directory layout is the manifest (Q-06 + Q-11)"
    - "A meta-test asserts every file under examples/intents/** and examples/planning-results/** is reached by the loop (no fixture added but never tested)"
    - "A snapshot-mutation generator programmatically corrupts the good scaffold fixture (drop required field, duplicate task id, inject unknown AC, mutate ambiguity score) and asserts each mutant rejects with the correct rule (Q-05)"
    - "An AC normalization e2e test deep-equals the AcceptanceCriterion[] array end-to-end: draft → confirmed (post-promoteIntentDraft) → downstream stages observe identical AC (Q-10, INTENT-03)"
    - "All Phase 1 refusal artifacts (clarification-report.json, no-plan-admitted.json) produced by the loop carry schemaVersion 1.0.0"
  artifacts:
    - path: packages/admission-e2e/src/parameterized-admission.test.ts
      provides: "Single source of truth for fixture-driven admission verdicts"
    - path: packages/admission-e2e/src/ac-normalization-deep-equal.test.ts
      provides: "End-to-end deep-equal pin on AcceptanceCriterion[] across packages"
    - path: packages/admission-e2e/src/snapshot-mutator.ts
      provides: "Pure deterministic mutator: takes a good fixture + a mutation kind, returns a corrupted variant"
    - path: packages/admission-e2e/src/snapshot-mutator-fuzzed.test.ts
      provides: "Each mutant rejects with the expected admission rule"
  key_links:
    - from: packages/admission-e2e/src/fixture-discovery.ts
      to: examples/intents/, examples/planning-results/
      via: "node:fs/promises readdir + path-suffix detection of /bad/"
      pattern: "examples"
    - from: packages/admission-e2e/src/parameterized-admission.test.ts
      to: "@protostar/intent + @protostar/planning admission paths"
      via: "promoteIntentDraft + parsePlanningPileResult + admitCandidatePlans + assertAdmittedPlanHandoff"
      pattern: "assertAdmittedPlanHandoff"
---

<objective>
Build the cross-package parameterized e2e admission test that closes INTENT-01, INTENT-03, PLAN-A-01, and PLAN-A-02 at the runtime layer. Discovery is by directory: every file under examples/**/bad/ MUST reject, every file outside MUST pass. A snapshot mutator + curated bad fixtures (already relocated by Plan 03) cover both syntactic and semantic refusal cases. An AC normalization deep-equal test pins the cross-package handoff per Q-10 + INTENT-03.

Purpose: Single source of truth for fixture coverage. Pairs with Plan 03 (directory layout) and Plans 06/07 (branded mints) so the runtime test exercises the same handoff the compile-time contracts pin. The loop itself is the gate — adding a fixture to bad/ that does NOT reject fails the suite.

Output: packages/admission-e2e populated with fixture-discovery, parameterized admission test, snapshot mutator + tests, and AC deep-equal test.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/01-intent-planning-admission/01-CONTEXT.md
@.planning/codebase/CONVENTIONS.md
@.planning/codebase/TESTING.md
@packages/admission-e2e/src/index.ts
@packages/admission-e2e/package.json
@examples/intents
@examples/planning-results
@packages/intent/src/index.ts
@packages/planning/src/index.ts
@packages/intent/src/acceptance-criteria-normalization.contract.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: fixture-discovery + parameterized-admission test (directory-as-manifest)</name>
  <read_first>
    - /Users/zakkeown/Code/protostar/examples/intents (post-Plan-03 layout — bad/ subdir present)
    - /Users/zakkeown/Code/protostar/examples/planning-results (post-Plan-03 layout — bad/ subdir present)
    - /Users/zakkeown/Code/protostar/packages/intent/src/index.ts (public API: promoteIntentDraft, IntentDraft type, ConfirmedIntentPromotionResult discriminated shape)
    - /Users/zakkeown/Code/protostar/packages/planning/src/index.ts (public API: parsePlanningPileResult, admitCandidatePlans, assertAdmittedPlanHandoff)
    - /Users/zakkeown/Code/protostar/packages/admission-e2e/package.json (Plan 05 — workspace deps already cover intent + policy + planning + execution)
    - /Users/zakkeown/Code/protostar/apps/factory-cli/src/main.test.ts (pattern for resolving examples/ relative to dist via import.meta.url + ../../..)
    - /Users/zakkeown/Code/protostar/.planning/codebase/TESTING.md (test runner pattern; avoid new deps)
  </read_first>
  <behavior>
    **Discovery scope is INTENTIONALLY NARROW (BLOCKER 2 + 3 fix).** The ambiguity-tier subdirs (`examples/intents/greenfield/`, `examples/intents/brownfield/`, anything matching `*.ambiguity.*`) are owned by their dedicated tests (`greenfield-ambiguity-fixtures.test.ts`, `brownfield-ambiguity-fixtures.test.ts`) and are EXPLICITLY EXCLUDED from this loop. Including them here would either (a) misclassify ambiguity-by-design drafts as expected-accept, or (b) silently bypass the ambiguity gate by treating confirmed-shaped fixtures as already-confirmed.

    - fixture-discovery.ts: pure async function `discoverFixtures(examplesRoot: string): Promise<readonly DiscoveredFixture[]>` where `DiscoveredFixture = { kind: "intent" | "planning"; absolutePath: string; relativePath: string; expectedVerdict: "accept" | "reject" }`.
    - **Discovery scope (in scope):**
        * Intent side: `examples/intents/*.json` (TOP-LEVEL ONLY — non-recursive) → expectedVerdict = "accept". PLUS `examples/intents/bad/**/*.json` (recursive under bad/) → expectedVerdict = "reject".
        * Planning side: `examples/planning-results/*.json` (TOP-LEVEL ONLY) → "accept". PLUS `examples/planning-results/bad/**/*.json` → "reject".
    - **Discovery scope (explicitly excluded):**
        * `examples/intents/greenfield/**` — owned by greenfield-ambiguity-fixtures.test.ts.
        * `examples/intents/brownfield/**` — owned by brownfield-ambiguity-fixtures.test.ts.
        * Any path matching `*.ambiguity.*` (regardless of directory).
        * Any non-JSON file.
    - **Input contract is fixed: top-level intent fixtures are IntentDraft shape.** The loop calls `promoteIntentDraft` on every accept-side intent fixture and asserts (a) ambiguity ≤ 0.2, (b) the result is a successful ConfirmedIntent. There is NO `parseConfirmedIntent` path in this e2e — that path was the silent-bypass (BLOCKER 2 root cause). If a top-level intent fixture is currently confirmed-shape rather than draft-shape, Plan 03 must convert it during fixture relocation; surface this as a Plan 03 follow-up if discovered.
    - **Planning fixture flow:** read JSON → parsePlanningPileResult → admitCandidatePlans → if all pass, assertAdmittedPlanHandoff → assert verdict matches expectedVerdict.
    - **Meta-test (coverage):** the loop has covered every file in the IN-SCOPE set. The meta-test does NOT count excluded directories (greenfield/, brownfield/, *.ambiguity.*) in the disk-side reference walk — it only sanity-checks that the loop didn't drop a top-level or bad/ file.
  </behavior>
  <action>
    1. In packages/admission-e2e/package.json confirm workspace deps include `@protostar/intent`, `@protostar/policy`, `@protostar/planning` (added by Plan 05). `@protostar/factory-cli` is NOT a dep (avoid circular). fs is permitted in test files only.

    2. In packages/admission-e2e/tsconfig.json, ensure references include @protostar/intent, @protostar/policy, @protostar/planning (already added by Plan 05).

    3. Create packages/admission-e2e/src/fixture-discovery.ts:
       - Export `interface DiscoveredFixture { readonly kind: "intent" | "planning"; readonly absolutePath: string; readonly relativePath: string; readonly expectedVerdict: "accept" | "reject" }`.
       - Export `async function discoverFixtures(examplesRoot: string): Promise<readonly DiscoveredFixture[]>`.
       - **Two-phase walk per kind (NON-RECURSIVE for top-level + recursive only under bad/):**
         * For intents: `readdir(${examplesRoot}/intents, { withFileTypes: true })`. Keep only `entry.isFile() && entry.name.endsWith(".json") && !entry.name.includes(".ambiguity.")` → expectedVerdict = "accept". Then `readdir(${examplesRoot}/intents/bad, { withFileTypes: true, recursive: true })` if it exists, filter to `*.json` and `!*.ambiguity.*` → expectedVerdict = "reject".
         * Mirror for planning-results: top-level `*.json` → "accept", `bad/**/*.json` → "reject".
       - **Excluded paths (assert in code):** any path containing `/greenfield/`, `/brownfield/`, or `.ambiguity.` is filtered out. Add a comment documenting that these are owned by their dedicated tests.
       - kind set per root subdir: under intents → "intent"; under planning-results → "planning".
       - Result is sorted by relativePath for deterministic test ordering.

    4. Create packages/admission-e2e/src/parameterized-admission.test.ts:
       - Resolve `examplesRoot` relative to import.meta.url. The package is at packages/admission-e2e/; from `dist/parameterized-admission.test.js` the repo root is `../../..` and examples is `../../../examples`. Verify actual depth from dist before committing.
       - Call `discoverFixtures(examplesRoot)`.
       - **Meta-test (coverage):** perform an independent disk walk producing the same in-scope set (top-level + bad/, excluding greenfield/brownfield/*.ambiguity.*). Assert the loop's discovered set equals that reference set. Failure mode: a top-level or bad/ fixture exists on disk but was not iterated.
       - For each fixture (for-of loop, label = relativePath):
           * Read file via node:fs/promises readFile + JSON.parse.
           * Intent fixtures (drafts only — by contract): coerce parsed JSON to IntentDraft and call `promoteIntentDraft`. If `expectedVerdict === "accept"`: assert (a) the result is the success branch carrying a `ConfirmedIntent`, AND (b) the underlying ambiguity score on the draft is ≤ 0.2 (read from the draft input or from the success-branch metadata, whichever the public API exposes). If `expectedVerdict === "reject"`: assert promoteIntentDraft returns the rejection branch (clarification report present / no confirmed intent).
           * Planning fixtures: parsePlanningPileResult → admitCandidatePlans → assertAdmittedPlanHandoff. Verdict accept = branded AdmittedPlan returned; reject = errors / no admitted candidate.
           * Do NOT throw on success branch — use `assert.fail` with the fixture's relativePath in the message so failure attribution is unambiguous.
       - **DO NOT call `parseConfirmedIntent` anywhere in this file** — top-level intent fixtures are drafts by contract. If a top-level fixture currently parses as confirmed-shape, surface it (test fail) and add a Plan 03 follow-up note to convert it to draft shape; do not "coerce" to bypass the ambiguity gate.

    5. **Fixture-shape audit (executed BEFORE writing the test loop):** run `ls examples/intents/*.json` and read each top-level file. Confirm each has draft shape (no `confirmedAt` field, has draft-specific fields). If any are confirmed-shape, STOP and create a Plan 03 follow-up checklist item in SUMMARY; choose: (a) fix the fixture inline as part of this plan if trivial, or (b) park the test until Plan 03 follow-up lands.

    6. Build + test pnpm --filter @protostar/admission-e2e test. Both the meta-test and the parameterized loop must pass against the post-Plan-03 fixture set.

    7. SUMMARY records: discovered fixture counts per kind (top-level + bad/), explicitly-excluded directory list with rationale, and any fixture-shape audit findings from step 5.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/admission-e2e build && pnpm --filter @protostar/admission-e2e test</automated>
  </verify>
  <acceptance_criteria>
    - ls packages/admission-e2e/src/fixture-discovery.ts packages/admission-e2e/src/parameterized-admission.test.ts exist.
    - grep -c "discoverFixtures" packages/admission-e2e/src/fixture-discovery.ts is at least 2 (export + signature).
    - grep -c "/bad/" packages/admission-e2e/src/fixture-discovery.ts is at least 1.
    - grep -cE "/greenfield/|/brownfield/|\.ambiguity\." packages/admission-e2e/src/fixture-discovery.ts is at least 1 (explicit exclusion).
    - grep -c "greenfield" packages/admission-e2e/src/parameterized-admission.test.ts is 0 OR appears only in a comment that documents the exclusion (use `grep -v '^\s*//' packages/admission-e2e/src/parameterized-admission.test.ts | grep -c greenfield` is 0).
    - grep -c "parseConfirmedIntent" packages/admission-e2e/src/parameterized-admission.test.ts is 0 (NEVER call this in the e2e — top-level fixtures are drafts).
    - grep -c "promoteIntentDraft" packages/admission-e2e/src/parameterized-admission.test.ts is at least 1.
    - grep -c "expectedVerdict" packages/admission-e2e/src/parameterized-admission.test.ts is at least 2.
    - The non-recursive top-level glob discipline is visible in fixture-discovery.ts: there must be at least one `readdir(...)` call WITHOUT `recursive: true` (top-level walk), AND at least one `readdir(.../bad, ..., recursive: true)` call (bad/ walk). Verify via `grep -c "recursive: true" packages/admission-e2e/src/fixture-discovery.ts` is at least 1, AND at least one readdir without that option exists.
    - pnpm --filter @protostar/admission-e2e test exits 0.
    - Manual probe (record in SUMMARY): drop `examples/intents/bad/probe.json` that does not reject → suite fails. Drop `examples/intents/probe.json` that does reject → suite fails. Drop `examples/intents/greenfield/probe.json` → suite is UNCHANGED (greenfield is excluded; that fixture is owned by greenfield-ambiguity-fixtures.test.ts). Run locally, revert.
  </acceptance_criteria>
  <done>Parameterized e2e test exercises every fixture according to directory-as-manifest; meta-test guarantees coverage.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: AC normalization cross-package deep-equal test</name>
  <read_first>
    - /Users/zakkeown/Code/protostar/packages/intent/src/acceptance-criteria-normalization.contract.ts (single-package contract today)
    - /Users/zakkeown/Code/protostar/packages/intent/src/acceptance-criteria-normalization.test.ts (existing tests)
    - /Users/zakkeown/Code/protostar/packages/intent/src/acceptance-criteria.ts (normalization implementation)
    - /Users/zakkeown/Code/protostar/packages/intent/src/index.ts (public AcceptanceCriterion type)
    - /Users/zakkeown/Code/protostar/packages/planning/src/index.ts (where AC flows after handoff)
    - /Users/zakkeown/Code/protostar/packages/execution/src/index.ts (downstream consumer of AC after AdmittedPlan)
  </read_first>
  <behavior>
    - The test takes a representative IntentDraft fixture (e.g. examples/intents/scaffold.draft.json).
    - It calls promoteIntentDraft → captures the normalized AcceptanceCriterion[] from the resulting branded ConfirmedIntent.
    - It then drives a downstream stage (parsePlanningPileResult on a matching planning fixture, then admitCandidatePlans, then assertAdmittedPlanHandoff) that exposes the AC the downstream stages observe.
    - Asserts assert.deepEqual on the entire AcceptanceCriterion[] across both observation points. Any divergence (ordering, casing, extra field, missing field) fails the test (Q-10).
    - Also pins the AC array contains stableHash-derived ids that are byte-equal across calls (determinism).
  </behavior>
  <action>
    **Pre-execution spike (run BEFORE writing the test).** Read `packages/planning/src/admitted-plan*.ts` and `packages/planning/src/index.ts` to locate where `AdmittedPlan` exposes `acceptanceCriteria`. Confirm:
    (a) `AdmittedPlan` exposes an `acceptanceCriteria` field (or equivalent) at the SAME shape and SAME order as `ConfirmedIntent.acceptanceCriteria`.
    (b) The handoff path (parsePlanningPileResult → admitCandidatePlans → assertAdmittedPlanHandoff) preserves the AC array verbatim — no reshaping, no per-task splitting.

    If shape drift exists (e.g. AC are restructured per-task, or fields are dropped, or order is sorted differently): **STOP and escalate**. Do NOT ship a deep-equal test whose pass/fail state is unknown. The escalation is a Plan 07 follow-up: extend Plan 07 to expose AC verbatim at the AdmittedPlan boundary, then resume Plan 09 Task 2. Record the spike outcome in SUMMARY (either "AC shape preserved verbatim — proceeding" or "drift found at <location>, planning-side fix needed before this test ships").

    Only after the spike confirms shape preservation, proceed:

    1. Create packages/admission-e2e/src/ac-normalization-deep-equal.test.ts:
       - import promoteIntentDraft from "@protostar/intent" plus the AcceptanceCriterion type.
       - import parsePlanningPileResult, admitCandidatePlans, assertAdmittedPlanHandoff from "@protostar/planning".
       - Read examples/intents/scaffold.draft.json as IntentDraft.
       - Read examples/planning-results/scaffold.json as the matching planning result.
       - Call promoteIntentDraft → success ConfirmedIntent → confirmedAc = confirmedIntent.acceptanceCriteria (or whatever the field is in the type).
       - Pass that confirmed intent into the planning admission flow (CandidateAdmissionInput likely takes confirmedIntent + parsedPlanningResult). Drive admitCandidatePlans → assertAdmittedPlanHandoff → admittedAc = admittedPlan.acceptanceCriteria (or whatever the AdmittedPlan field is — discover from packages/planning/src).
       - assert.deepEqual(confirmedAc, admittedAc, "AC array must be byte-identical post-handoff") — Q-10 strongest end-to-end guarantee.
       - Run promoteIntentDraft + assertAdmittedPlanHandoff a second time on the same input and assert.deepEqual against the first run (determinism — pairs with INTENT-03 contract).

    2. If AdmittedPlan does not currently expose AC at the same shape (e.g. it stores them under a different key or wraps them in a per-task structure), fail loudly in the test rather than transforming — the test is the contract. If a transformation IS legitimate per the current types, document it in SUMMARY and update the assertion to the deepest reachable identical structure (still byte-equal, just narrower scope). If genuine drift exists, that's a planning-side bug to flag, not paper over.

    3. Build + test:
       - pnpm --filter @protostar/admission-e2e test.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/admission-e2e test</automated>
  </verify>
  <acceptance_criteria>
    - ls packages/admission-e2e/src/ac-normalization-deep-equal.test.ts exists.
    - grep -c "deepEqual" packages/admission-e2e/src/ac-normalization-deep-equal.test.ts is at least 2 (cross-stage + determinism).
    - grep -c "promoteIntentDraft\|assertAdmittedPlanHandoff" packages/admission-e2e/src/ac-normalization-deep-equal.test.ts is at least 2.
    - pnpm --filter @protostar/admission-e2e test exits 0.
    - SUMMARY notes whether AC structure was identical across stages or required scoped narrowing (and why).
  </acceptance_criteria>
  <done>AC deep-equal test passes; INTENT-03 closed at runtime.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: snapshot mutator + fuzzed-bad rejection test</name>
  <read_first>
    - /Users/zakkeown/Code/protostar/examples/planning-results/scaffold.json (the good fixture to mutate)
    - /Users/zakkeown/Code/protostar/packages/planning/src/index.ts (admission rules — duplicate-task-id, missing-AC-coverage, unknown-AC, capability-envelope-expansion etc — these are the rule names the mutator targets)
    - /Users/zakkeown/Code/protostar/packages/planning/src (each *.test.ts here pins one admission rule — gives the executor the rule name conventions)
    - /Users/zakkeown/Code/protostar/.planning/phases/01-intent-planning-admission/01-CONTEXT.md (Q-05 hybrid strategy: programmatic mutator for syntactic, curated for semantic)
  </read_first>
  <behavior>
    - snapshot-mutator.ts exports a pure function applyMutation(input: PlanningResult, mutation: MutationKind): PlanningResult.
    - MutationKind is a discriminated union covering at least: "drop-required-field" (drops a chosen required field), "duplicate-task-id" (clones a task id onto a second task), "inject-unknown-acceptance-criterion" (adds a task-bound AC id not in the intent's AC list), "mutate-ambiguity-score" (sets ambiguity above 0.2 for an intent fixture), "violate-capability-envelope" (adds a grant outside the envelope cap).
    - The mutator is fully deterministic (same input + same kind = byte-identical output).
    - snapshot-mutator-fuzzed.test.ts takes the good scaffold fixture, applies each MutationKind in turn, runs the planning admission flow, asserts the failure carries an error message containing the rule's expected token (e.g. "duplicate task id", "unknown acceptance criterion").
    - Curated semantic bad fixtures (cyclic graph, missing-pr-write-verification, capability-envelope-expansion — already in examples/planning-results/bad/ post-Plan-03) are exercised by the parameterized test in Task 1, NOT re-tested here.
  </behavior>
  <action>
    1. Create packages/admission-e2e/src/snapshot-mutator.ts:
       - export type MutationKind = "drop-required-field" | "duplicate-task-id" | "inject-unknown-acceptance-criterion" | "violate-capability-envelope" — at minimum. Add others as the underlying admission rules suggest.
       - export interface MutationInput<T> { readonly fixture: T; readonly kind: MutationKind; readonly seed?: string }.
       - export function applyMutation<T extends object>(input: MutationInput<T>): T — performs a deep clone (use structuredClone — Node 22 built-in, no dep) then applies the mutation. Pure: no side effects.
       - For each MutationKind, document inline what field/path the mutation targets. Use the scaffold.json fixture's actual structure as the basis (read it once during test setup).

    2. Create packages/admission-e2e/src/snapshot-mutator-fuzzed.test.ts:
       - Read examples/planning-results/scaffold.json once in setup.
       - For each MutationKind, in a separate it() block:
         * Apply mutation via applyMutation.
         * Run the admission flow (parsePlanningPileResult → admitCandidatePlans → assertAdmittedPlanHandoff).
         * Assert the result is rejected.
         * Assert the rejection carries an error string matching the mutation's expected token (use assert.match with a regex per mutation — table-driven case style from intent-ambiguity-scoring.test.ts).
       - Add a determinism it: applyMutation called twice with same input + kind returns deep-equal results.

    3. Add an intent-side companion: snapshot-mutator-intent-fuzzed.test.ts (or merge into the same file under a separate describe). Mutations: "mutate-ambiguity-score", "drop-goal-statement", "drop-acceptance-criteria". Apply against examples/intents/scaffold.draft.json. Assert rejection through promoteIntentDraft and that the resulting clarification report names the affected dimension (e.g. "goal", "constraints").

    4. Build + test pnpm --filter @protostar/admission-e2e test. The mutator + tests must pass; if a mutation kind currently does NOT trigger a rejection (i.e. an admission rule gap), STOP and surface — that is itself a Phase 1 gap to escalate.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/admission-e2e test</automated>
  </verify>
  <acceptance_criteria>
    - ls packages/admission-e2e/src/snapshot-mutator.ts packages/admission-e2e/src/snapshot-mutator-fuzzed.test.ts exist.
    - grep -c "MutationKind" packages/admission-e2e/src/snapshot-mutator.ts is at least 2 (type definition + use).
    - grep -c "structuredClone" packages/admission-e2e/src/snapshot-mutator.ts is at least 1 (no external clone dep).
    - The fuzzed test file contains at least 4 distinct MutationKinds exercised (count by grep -c "kind:" or equivalent).
    - pnpm --filter @protostar/admission-e2e test exits 0.
    - SUMMARY enumerates the MutationKinds covered (planning + intent) and documents any kind that surfaces a rule gap in the underlying admission flow.
  </acceptance_criteria>
  <done>Mutator + fuzzed tests pass; PLAN-A-02 + INTENT-01 fuzzed-bad coverage in place per Q-05.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| examples/ JSON files ↔ admission flow under test | Test fixtures are user-controllable inputs to the admission engine |
| Mutator output ↔ admission engine | Programmatic corruption must trigger the same refusal codepaths as real bad inputs |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-09-01 | Repudiation | Fixture added to bad/ but never iterated | mitigate | Meta-test in Task 1 asserts every *.json on disk is reached by the loop |
| T-01-09-02 | Spoofing | A "bad" fixture that the admission flow accepts | mitigate | Per-fixture verdict assertion fails the suite immediately |
| T-01-09-03 | Tampering | AC normalization drift between intent and planning stages | mitigate | Task 2 deep-equal pin catches any drift (ordering, casing, extra/missing fields) |
| T-01-09-04 | Denial of Service | Mutator producing inputs the admission engine cannot handle (infinite loop, OOM) | accept | structuredClone-based mutations bounded by fixture size; existing admission rules already iterate within O(n) per CONCERNS.md scaling notes |
</threat_model>

<verification>
- Parameterized admission test passes against the post-Plan-03 fixture set.
- Meta-test catches dropped/added fixtures.
- AC deep-equal test passes (or surfaces a real planning-side bug).
- Snapshot mutator + fuzzed tests pass for every MutationKind.
</verification>

<success_criteria>
INTENT-01, INTENT-03, PLAN-A-01, PLAN-A-02 all closed at the runtime layer. The bad/ directory IS the rejection manifest; the snapshot mutator extends syntactic coverage without manual fixture authoring.
</success_criteria>

<output>
After completion, create .planning/phases/01-intent-planning-admission/01-09-SUMMARY.md listing: discovered fixture counts (good + bad per kind), MutationKinds covered, AC normalization assertion result (identical or scoped), and any rule gaps surfaced.
</output>
