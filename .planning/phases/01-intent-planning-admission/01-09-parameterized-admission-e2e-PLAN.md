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
    - fixture-discovery.ts: pure async function discoverFixtures(examplesRoot: string): Promise<readonly DiscoveredFixture[]> where DiscoveredFixture is { kind: "intent" | "planning"; absolutePath: string; relativePath: string; expectedVerdict: "accept" | "reject" }. expectedVerdict is "reject" if the path contains a /bad/ segment, "accept" otherwise.
    - The discovery walks examples/intents/**/*.json AND examples/planning-results/**/*.json with kind set accordingly. *.draft.json files are intent fixtures with kind="intent".
    - parameterized-admission.test.ts: a single describe block that calls discoverFixtures, then iterates. For each fixture, runs the appropriate admission flow:
        * intent fixtures: read JSON → coerce to IntentDraft (or ConfirmedIntent if file is *.json without .draft.) → call promoteIntentDraft (for drafts) OR parseConfirmedIntent + assert ambiguity gate (for confirmed) → assert verdict matches expectedVerdict.
        * planning fixtures: read JSON → parsePlanningPileResult → admitCandidatePlans → if all pass, assertAdmittedPlanHandoff → assert verdict matches expectedVerdict.
    - Meta-test: asserts the discovery loop covered EVERY file under examples/intents and examples/planning-results that ends in .json. Failure mode: a fixture exists on disk but was not iterated.
    - Files under examples/intents/greenfield/ and examples/intents/brownfield/ that are NOT under a bad/ subdir count as accept.
  </behavior>
  <action>
    1. In packages/admission-e2e/package.json add an additional workspace dep: "@protostar/policy": "workspace:*" (already present per Plan 05). If absent, add. Also add "@protostar/factory-cli" is NOT a dependency (avoid circular). The test reads JSON directly from examples/ — fs is permitted in test files only.

    2. In packages/admission-e2e/tsconfig.json, ensure references include @protostar/intent, @protostar/policy, @protostar/planning (already added by Plan 05).

    3. Create packages/admission-e2e/src/fixture-discovery.ts:
       - Export interface DiscoveredFixture { readonly kind: "intent" | "planning"; readonly absolutePath: string; readonly relativePath: string; readonly expectedVerdict: "accept" | "reject" }.
       - Export async function discoverFixtures(examplesRoot: string): Promise<readonly DiscoveredFixture[]>.
       - Use node:fs/promises readdir with { withFileTypes: true, recursive: true }. Filter to *.json. Exclude *.schema.json under packages/* (only walk under examplesRoot — schema files don't live there, so this is naturally avoided).
       - expectedVerdict = path.includes("/bad/") || path.includes("\\bad\\") ? "reject" : "accept" (handle both POSIX and Windows separators just in case).
       - kind = examplesRoot subdir prefix: paths under examples/intents → "intent"; paths under examples/planning-results → "planning".
       - Result is sorted by relativePath for deterministic test ordering.

    4. Create packages/admission-e2e/src/parameterized-admission.test.ts:
       - Resolve examplesRoot relative to import.meta.url: dist/parameterized-admission.test.js → ../../../../examples (the package is at packages/admission-e2e/, so ../../../examples from src files; verify the actual depth from dist).
       - Call discoverFixtures(examplesRoot).
       - Build two parallel arrays: intentFixtures and planningFixtures.
       - it("covers every json file under examples/intents and examples/planning-results", ...): assert discovered count === actual count from a separate readdir walk (the meta-test).
       - it.each-style loop using a for-of over the discovered list. For each fixture:
           * Read file via node:fs/promises readFile + JSON.parse.
           * Apply the admission flow per kind.
           * If expectedVerdict === "accept": assert promoteIntentDraft / assertAdmittedPlanHandoff returns a success / branded value. Use the descriptive name as the assertion label.
           * If expectedVerdict === "reject": assert the admission returns a failure result (errors non-empty / accepted: false / no admitted candidate). Do NOT throw on success branch — assert.fail with the fixture's relativePath in the message.
       - Use the testCase.name discipline from intent-ambiguity-scoring.test.ts: assertion label is the relativePath.

    5. Build + test pnpm --filter @protostar/admission-e2e test. Both the meta-test and the parameterized loop must pass against the current good + bad fixture set (post-Plan 03 relocation).

    6. SUMMARY records the discovered fixture counts for both kinds.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/admission-e2e build && pnpm --filter @protostar/admission-e2e test</automated>
  </verify>
  <acceptance_criteria>
    - ls packages/admission-e2e/src/fixture-discovery.ts packages/admission-e2e/src/parameterized-admission.test.ts exist.
    - grep -c "discoverFixtures" packages/admission-e2e/src/fixture-discovery.ts is at least 2 (export + signature).
    - grep -c "/bad/" packages/admission-e2e/src/fixture-discovery.ts is at least 1.
    - grep -c "expectedVerdict" packages/admission-e2e/src/parameterized-admission.test.ts is at least 2.
    - pnpm --filter @protostar/admission-e2e test exits 0.
    - Manual probe (record in SUMMARY): if a new file is dropped into examples/intents/bad/probe.json that does NOT reject, the suite fails. If a new file is dropped into examples/intents/probe.json that DOES reject, the suite fails. (Run locally, revert.)
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
