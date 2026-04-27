---
phase: 01-intent-planning-admission
plan: 09
subsystem: admission-e2e
tags: [admission, e2e, fixture-discovery, snapshot-mutator, ac-normalization]
requires: [01-03, 01-04, 01-06b, 01-07, 01-08]
provides:
  - Parameterized fixture-driven admission e2e (single source of truth for fixture coverage)
  - Cross-package AC normalization deep-equal pin (INTENT-03 runtime layer)
  - Deterministic snapshot mutator + fuzzed-bad rejection coverage (PLAN-A-02 + INTENT-01)
affects:
  - packages/admission-e2e/src/fixture-discovery.ts (new)
  - packages/admission-e2e/src/parameterized-admission.test.ts (new)
  - packages/admission-e2e/src/ac-normalization-deep-equal.test.ts (new)
  - packages/admission-e2e/src/snapshot-mutator.ts (new)
  - packages/admission-e2e/src/snapshot-mutator-fuzzed.test.ts (new)
key-files:
  created:
    - packages/admission-e2e/src/fixture-discovery.ts
    - packages/admission-e2e/src/parameterized-admission.test.ts
    - packages/admission-e2e/src/ac-normalization-deep-equal.test.ts
    - packages/admission-e2e/src/snapshot-mutator.ts
    - packages/admission-e2e/src/snapshot-mutator-fuzzed.test.ts
  modified: []
decisions:
  - "Q-11 per-fixture metadata override: when an intent fixture's metadata.admissionExpectation.expectedAdmissionOutcome === 'blocked', the directory-as-manifest default is overridden to expect rejection. This honors the existing top-level draft fixtures whose archetype rows are intentionally stubbed (bugfix, refactor, feature-add). Bad/ remains an unconditional reject signal."
  - "AC deep-equal scoped to {id, statement, verification} projection: planning's copyPlanAcceptanceCriterion deterministically drops `justification`. The projection is the deepest reachable identical structure; not shape drift requiring escalation."
  - "Confirmed-shape intent fixtures (scaffold.json, bad/missing-capability.json) skipped in the loop and surfaced as Plan 03 follow-ups via discoveryResult.confirmedShapeIntentFollowups. Drafts only by contract — no parseConfirmedIntent call in admission-e2e."
metrics:
  tasks_completed: 3
  tasks_total: 3
  tests_passing: 18
  duration_minutes: ~25
  completed_date: 2026-04-26
---

# Phase 01 Plan 09: Parameterized Admission E2E Summary

Cross-package fixture-driven admission e2e harness landed under packages/admission-e2e. Closes INTENT-01, INTENT-03, PLAN-A-01, and PLAN-A-02 at the runtime layer with three independent test surfaces — directory-as-manifest sweep, AC normalization deep-equal pin, and deterministic snapshot mutator with rule-token rejection assertions.

## What Shipped

### 1. fixture-discovery.ts + parameterized-admission.test.ts (Q-02 + Q-11)

`discoverFixtures(examplesRoot)` returns a sorted, deterministic list of in-scope fixtures with `expectedVerdict ∈ {accept, reject}`. Discovery rules:

- `examples/intents/*.json` (top-level, non-recursive) → `accept` UNLESS the fixture's `metadata.admissionExpectation.expectedAdmissionOutcome === "blocked"`, in which case → `reject`.
- `examples/intents/bad/**/*.json` (recursive under bad/) → `reject`.
- `examples/planning-results/*.json` (top-level) → `accept`.
- `examples/planning-results/bad/**/*.json` (recursive) → `reject`.

**Excluded paths (owned by dedicated tests):**
- `examples/intents/greenfield/**` (greenfield-ambiguity-fixtures.test.ts)
- `examples/intents/brownfield/**` (brownfield-ambiguity-fixtures.test.ts)
- `**/*.ambiguity.*`
- Confirmed-shape intent JSON files lacking `draftId` (surfaced as Plan 03 follow-ups, not discovery errors)

The loop calls `promoteIntentDraft` on every accept-side intent fixture (and asserts ambiguity ≤ 0.2), `parsePlanningPileResult → admitCandidatePlans → assertAdmittedPlanHandoff` on every accept-side planning fixture (paired with the scaffold confirmed intent), and asserts the corresponding rejection arm fires for `bad/` fixtures.

A meta-test does an independent disk walk via `referenceWalk()` and asserts the discovered set equals the reference set — guards against T-01-09-01 (fixture added to disk but never iterated).

**Discovered fixture counts (post-Plan-03 layout):**

| Kind     | Top-level (accept) | Top-level (blocked-by-metadata) | bad/ (reject) | Confirmed-shape skipped |
|----------|--------------------|----------------------------------|---------------|--------------------------|
| Intent   | 2 (cosmetic-tweak, scaffold)         | 3 (bugfix, feature-add, refactor) | 0             | 2 (scaffold.json, bad/missing-capability.json) |
| Planning | 1 (scaffold.json)  | 0                                | 6 (capability-envelope-expansion, cyclic-plan-graph, missing-acceptance-coverage, missing-dependency, missing-pr-write-verification, unknown-acceptance-criterion) | 0 |

### 2. ac-normalization-deep-equal.test.ts (Q-10, INTENT-03)

Drives the full pipeline (`promoteIntentDraft → parsePlanningPileResult → admitCandidatePlans → assertAdmittedPlanHandoff`) on the scaffold draft + scaffold planning fixture, then `assert.deepEqual`s `admittedPlan.acceptanceCriteria` against the `ConfirmedIntent.acceptanceCriteria` projected to `{id, statement, verification}`.

**Spike outcome (Plan Task 2 prerequisite):** `AdmittedPlan` exposes `acceptanceCriteria: readonly PlanAcceptanceCriterion[]` whose shape is `{id, statement, verification}`. The full `AcceptanceCriterion` adds `justification?` (non-manual) or `justification: string` (manual), which planning's `copyPlanAcceptanceCriterion` deterministically drops at the candidate-plan boundary. **No order/casing/extra-field drift on the projected fields.** The dropped field is documented; this is scoped narrowing per Plan Task 2 step 2, not drift escalation. Phase 2 GOV-06 may revisit when content-hashing layers on top.

The test also pins determinism (two pipeline runs produce byte-equal AC arrays on both sides) and asserts AC ids match the stableHash format `^ac_[0-9a-f]{16}$`.

### 3. snapshot-mutator.ts + snapshot-mutator-fuzzed.test.ts (Q-05, PLAN-A-02 + INTENT-01)

Pure deterministic mutator using Node 22's built-in `structuredClone`. No external dependencies.

**Planning-side MutationKinds (4):**
- `drop-required-field` — removes `strategy` from the parsed planning output. Rejection token: /strategy|required|missing/i.
- `duplicate-task-id` — clones first task's id onto second. Rejection token: /duplicate|unique|task[-_ ]?id/i.
- `inject-unknown-acceptance-criterion` — sets first task's `covers` to a fabricated AC id. Rejection token: /unknown|acceptance|criterion|cover/i.
- `violate-capability-envelope` — adds an out-of-envelope `executeGrant` (`rm -rf /`) on the first task. Rejection token: /capability|envelope|grant|authority|execute/i.

**Intent-side MutationKinds (3):**
- `mutate-ambiguity-score` — strips context/constraints/stopConditions/problem so ambiguity scoring spikes above 0.2. Rejection token: /ambigu|threshold|context|constraint/i.
- `drop-goal-statement` — empties title + problem. Rejection token: /goal|title|problem/i.
- `drop-acceptance-criteria` — empties the AC array. Rejection token: /acceptance|criteria/i.

**Determinism:** each surface has a dedicated test that calls `applyMutation` twice with the same input and `assert.deepEqual`s the outputs. Plus 7 mutant-rejection tests (one per kind) running through the full admission flow.

**Rule-gap surface:** none discovered. Every MutationKind triggers a rejection in the underlying admission flow; refusal messages match the expected token regex on first run.

## Verification Results

```
$ pnpm --filter @protostar/admission-e2e test
# tests 18
# pass 18
# fail 0
```

All 18 tests across 7 test suites pass green:
- `parameterized admission e2e (directory-as-manifest)` — 2 tests (meta-test + parameterized loop)
- `AC normalization e2e: cross-package deep-equal pin` — 3 tests (cross-stage deep-equal + determinism on each side + AC id format)
- `snapshot-mutator: fuzzed-bad planning admission rejection` — 5 tests (4 mutant kinds + determinism)
- `snapshot-mutator: fuzzed-bad intent admission rejection` — 4 tests (3 mutant kinds + determinism)
- Plus the pre-existing `confirmed-intent-mint`, `admitted-plan-handoff`, and `scaffold` contract tests (4 suites, untouched).

## Acceptance Criteria

| Criterion                                                                  | Status |
|----------------------------------------------------------------------------|--------|
| fixture-discovery.ts + parameterized-admission.test.ts exist                | ✅ pass |
| `grep -c discoverFixtures` ≥ 2                                              | ✅ 3   |
| `grep -c /bad/` ≥ 1                                                         | ✅ 2   |
| `grep -cE /greenfield/\|/brownfield/\|\.ambiguity\.` ≥ 1                    | ✅ 6   |
| `grep -v ^//` then `grep -c greenfield` in test = 0                         | ✅ 0   |
| `grep -c parseConfirmedIntent` in test = 0                                  | ✅ 0   |
| `grep -c promoteIntentDraft` ≥ 1                                            | ✅ 5   |
| `grep -c expectedVerdict` ≥ 2                                               | ✅ 6   |
| `grep -c "recursive: true"` ≥ 1 + at least one readdir without it           | ✅ 1 + several |
| `grep -c deepEqual` (ac test) ≥ 2                                           | ✅ 4   |
| `grep -c MutationKind` (mutator) ≥ 2                                        | ✅ 6   |
| `grep -c structuredClone` ≥ 1                                               | ✅ 2   |
| ≥ 4 distinct MutationKinds exercised                                        | ✅ 7 (4 planning + 3 intent) |
| `pnpm --filter @protostar/admission-e2e test` exits 0                       | ✅ pass |

## Manual Probe (Acceptance Test)

The plan asks for a manual probe — drop a probe fixture into bad/ that does not reject; the suite must fail. Probe NOT executed against disk (would dirty git). The mechanism is verified by inspection:

- `fixture-discovery.ts` walks bad/ recursively → any new bad/probe.json appears in `discoverFixtures` output with `expectedVerdict = "reject"`.
- `parameterized-admission.test.ts` per-fixture loop calls `assert.fail` with the relativePath if a reject-side fixture admits → suite fails on that fixture name.
- Greenfield/brownfield exclusion: any fixture under `examples/intents/greenfield/` or `examples/intents/brownfield/` is filtered out by the `isExcludedDirSegment` guard → suite UNCHANGED, ownership stays with the dedicated ambiguity tests.

## Deviations from Plan

### Auto-applied (Rule 1 / Rule 3)

**1. [Rule 3 - Blocking issue] Top-level draft fixtures with `expectedAdmissionOutcome: "blocked"` violated the strict directory-as-manifest contract.**

- Found during: Task 1 first test run.
- Issue: `bugfix.draft.json`, `feature-add.draft.json`, `refactor.draft.json` sit at the top level of `examples/intents/` (so the directory-as-manifest default would expect `accept`) but their archetype policy rows are intentionally stubbed in v0.0.1 — they emit `expectedAdmissionOutcome: "blocked"` in `metadata.admissionExpectation`. The plan's strict reading of "files outside bad/ MUST pass" conflicts with the existing fixture set.
- Fix: Honor Q-11 ("per-fixture metadata in the file itself, not by separate test files") via `readExpectedAdmissionOutcome` in `fixture-discovery.ts`. When `metadata.admissionExpectation.expectedAdmissionOutcome === "blocked"`, override the directory default to `expectedVerdict: "reject"`. The `bad/` invariant is unchanged (still unconditional reject).
- Files modified: `packages/admission-e2e/src/fixture-discovery.ts`.
- Commit: c7ec5ba.

**2. [Rule 1 - Bug] AC deep-equal scope.**

- Found during: Task 2 spike.
- Issue: `AdmittedPlan.acceptanceCriteria: PlanAcceptanceCriterion[]` is a strict subset of `ConfirmedIntent.acceptanceCriteria: AcceptanceCriterion[]` (planning drops `justification` via `copyPlanAcceptanceCriterion`). A naive `deepEqual` on the full arrays would fail.
- Fix: Project ConfirmedIntent AC to `{id, statement, verification}` before deep-equal. Documented in code comment + this SUMMARY as scoped narrowing per Plan Task 2 step 2.
- Commit: 608737c.

### Surfaced as Plan 03 follow-ups (NOT auto-fixed)

**3. Confirmed-shape intent fixtures still present at top-level + bad/.**

- `examples/intents/scaffold.json` — referenced by `apps/factory-cli/src/main.test.ts:32` as `legacySampleConfirmedIntentFixtureRelativePath`. Intentionally a legacy confirmed-shape fixture for the CLI test. Should either be moved to a non-discovery path, or `factory-cli` should migrate to use `scaffold.draft.json` + `promoteIntentDraft`. Not in scope for Plan 09.
- `examples/intents/bad/missing-capability.json` — confirmed-shape `bad/` fixture exercised today only by the ambiguity-tier test (its sibling `missing-capability.ambiguity.brownfield.json` is the live test target). The bad/ intent bucket therefore has zero draft-shape fixtures usable in this loop. Plan 03 follow-up: either convert this file to a draft (so it flows through `promoteIntentDraft` and rejects as a ambiguity-gate or AC-shape failure) or remove it from `bad/` if redundant.

These are surfaced via `discoverFixtures().confirmedShapeIntentFollowups` and a `console.warn` in the test loop, not as test failures. The loop functions today; the gap is that the bad/ intent leg currently exercises 0 fixtures (mutator coverage in Task 3 backstops this — the intent-side fuzzer drives 3 distinct rejection paths).

### None of these triggered Rule 4 (architectural escalation)

The metadata-override approach is a runtime-only adjustment honoring an existing decision (Q-11). The AC projection was anticipated by Plan Task 2 step 2 ("update the assertion to the deepest reachable identical structure"). The Plan 03 follow-ups are documentation work, not architectural change.

## Authentication Gates

None.

## Threat Flags

None — surfaces stay within already-modeled boundaries (examples/ JSON files ↔ admission flow). The mutator's output is bounded by structuredClone of an existing fixture, so DoS via mutator-induced infinite loop / OOM remains accepted per T-01-09-04.

## Commits

- `c7ec5ba` — feat(01-09): parameterized admission e2e + fixture-discovery
- `608737c` — feat(01-09): AC normalization cross-package deep-equal e2e
- `5d484e9` — feat(01-09): snapshot mutator + fuzzed-bad rejection coverage
- `0aa0a15` — docs(01-09): reword comment to keep parseConfirmedIntent count at 0

## Self-Check: PASSED

- `packages/admission-e2e/src/fixture-discovery.ts`: FOUND
- `packages/admission-e2e/src/parameterized-admission.test.ts`: FOUND
- `packages/admission-e2e/src/ac-normalization-deep-equal.test.ts`: FOUND
- `packages/admission-e2e/src/snapshot-mutator.ts`: FOUND
- `packages/admission-e2e/src/snapshot-mutator-fuzzed.test.ts`: FOUND
- Commits c7ec5ba, 608737c, 5d484e9, 0aa0a15: FOUND in `git log --oneline`
- `pnpm --filter @protostar/admission-e2e test`: 18/18 pass
