---
phase: 08-evaluation-evolution
plan: 04
type: execute
wave: 2
depends_on: ["08-02"]
files_modified:
  - packages/mechanical-checks/src/findings.ts
  - packages/mechanical-checks/src/findings.test.ts
  - packages/mechanical-checks/src/create-mechanical-checks-adapter.ts
  - packages/mechanical-checks/src/create-mechanical-checks-adapter.test.ts
  - packages/mechanical-checks/src/index.ts
autonomous: true
requirements: [EVAL-01]
must_haves:
  truths:
    - "buildFindings (or sibling new function) now also returns numeric MechanicalScores per Q-01 — the producer of the 4-field score record"
    - "createMechanicalChecksAdapter emits ReviewGate with mechanicalScores field populated"
    - "Score formulas mirror Q-02 verbatim: build=exitCode===0?1:0, lint=exitCode===0?1:0, diffSize=cosmetic?(<=1?1:0):1, acCoverage=covered/total"
    - "All existing mechanical-checks behavior preserved — findings still emitted; only addition is mechanicalScores on the produced ReviewGate"
  artifacts:
    - path: packages/mechanical-checks/src/findings.ts
      provides: "Score producer function + existing ReviewFinding[] producer"
      exports: ["buildFindings", "computeMechanicalScoresFromFindings"]
    - path: packages/mechanical-checks/src/create-mechanical-checks-adapter.ts
      provides: "Adapter that threads mechanicalScores into the ReviewGate it returns"
  key_links:
    - from: packages/mechanical-checks/src/findings.ts
      to: packages/review/src/index.ts
      via: "MechanicalScores type imported"
      pattern: "MechanicalScores"
    - from: packages/mechanical-checks/src/create-mechanical-checks-adapter.ts
      to: packages/mechanical-checks/src/findings.ts
      via: "Calls computeMechanicalScoresFromFindings then sets reviewGate.mechanicalScores"
      pattern: "mechanicalScores"
---

<objective>
Wire the numeric mechanical-score producer into `@protostar/mechanical-checks` (Q-01 producer side). After Plan 08-02 added the `mechanicalScores` field to `ReviewGate` and Plan 08-03 created the pure `computeMechanicalScores` helper, this plan flows real numbers into the gate that the loop already produces.

The score producer in `mechanical-checks` reuses the same Q-02 formulas as `computeMechanicalScores` — but operates against the **already-collected mechanical evidence** (commandResults from execution + diffNameOnly from the repo runner + AC coverage from existing finding logic). It does NOT call `@protostar/evaluation`'s `computeMechanicalScores` directly (that helper is for the evaluation-runner's full assembly path); both producers share the formula spec but live in different domains.

Purpose: When Plan 08-06's `runEvaluationStages` reads a `ReviewGate`, it can lift `gate.mechanicalScores` directly into a `MechanicalEvalResult` via Plan 08-03's helper — no fragile re-parsing of the existing findings array. Single source of numeric truth.
Output: `mechanical-checks` adapter emits gates whose `mechanicalScores` is present whenever the inputs are available; existing finding behavior unchanged.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/08-evaluation-evolution/08-CONTEXT.md
@packages/mechanical-checks/src/findings.ts
@packages/mechanical-checks/src/create-mechanical-checks-adapter.ts
@packages/mechanical-checks/src/diff-name-only.ts
@packages/review/src/index.ts
@packages/evaluation/src/compute-mechanical-scores.ts

<interfaces>
<!-- Producer signature (mechanical-checks domain). -->

```typescript
// packages/mechanical-checks/src/findings.ts (additions)

import type { MechanicalScores } from "@protostar/review";

export interface MechanicalScoresInput {
  readonly buildExitCode: number | undefined;       // undefined when no build command in archetype
  readonly lintExitCode: number | undefined;        // undefined when no lint command in archetype
  readonly diffNameOnly: readonly string[];
  readonly archetype: "cosmetic-tweak" | "feature-add" | "refactor" | "bugfix";
  readonly totalAcCount: number;
  readonly coveredAcCount: number;
}

export function computeMechanicalScoresFromFindings(input: MechanicalScoresInput): MechanicalScores;
// Q-02 formulas (verbatim). When buildExitCode/lintExitCode is undefined (command not in archetype),
// score is 1 (treat absence as not-failed). Documented in JSDoc.
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add computeMechanicalScoresFromFindings producer in mechanical-checks/findings.ts</name>
  <read_first>
    - packages/mechanical-checks/src/findings.ts (full file — current `buildFindings`, `MechanicalChecksArchetype`, AC-coverage finding logic; identify where commandResults are inspected so the score helper can run alongside)
    - packages/mechanical-checks/src/findings.test.ts (existing test pattern + fixtures)
    - packages/review/src/index.ts (`MechanicalScores` interface from Plan 08-02 — confirm import path resolves)
    - .planning/phases/08-evaluation-evolution/08-CONTEXT.md Q-01 (producer locality) + Q-02 (formulas)
  </read_first>
  <behavior>
    - `computeMechanicalScoresFromFindings(input)` returns the strict `MechanicalScores` shape `{ build, lint, diffSize, acCoverage }`.
    - Formulas:
      - `build = input.buildExitCode === undefined ? 1 : (input.buildExitCode === 0 ? 1 : 0)` (absent command = pass).
      - `lint = input.lintExitCode === undefined ? 1 : (input.lintExitCode === 0 ? 1 : 0)`.
      - `diffSize = input.archetype === "cosmetic-tweak" ? (input.diffNameOnly.length <= 1 ? 1 : 0) : 1`.
      - `acCoverage = input.totalAcCount === 0 ? 1 : input.coveredAcCount / input.totalAcCount`.
    - Tests (8 cases):
      - All pass: build=0 exit, lint=0 exit, 1-file diff, 5/5 ACs → all four = 1.
      - build undefined (no build command in archetype) → build = 1.
      - lint exit non-zero → lint = 0.
      - cosmetic-tweak with 2 files → diffSize = 0.
      - cosmetic-tweak with 0 files → diffSize = 1.
      - feature-add archetype with 5 files → diffSize = 1 (graduated).
      - 3/5 AC coverage → acCoverage = 0.6.
      - Zero ACs → acCoverage = 1.
  </behavior>
  <files>packages/mechanical-checks/src/findings.ts, packages/mechanical-checks/src/findings.test.ts</files>
  <action>
    1. **RED:** Append the 8 test cases to `packages/mechanical-checks/src/findings.test.ts` under a new `describe("computeMechanicalScoresFromFindings", ...)` block. Run; cases fail (function doesn't exist).
    2. **GREEN:** Add to `packages/mechanical-checks/src/findings.ts`:
       ```typescript
       import type { MechanicalScores } from "@protostar/review";

       export interface MechanicalScoresInput {
         readonly buildExitCode: number | undefined;
         readonly lintExitCode: number | undefined;
         readonly diffNameOnly: readonly string[];
         readonly archetype: "cosmetic-tweak" | "feature-add" | "refactor" | "bugfix";
         readonly totalAcCount: number;
         readonly coveredAcCount: number;
       }

       /**
        * Phase 8 Q-01 / Q-02: numeric mechanical scores.
        * Producer lives here (mechanical-checks domain owns the inputs).
        * @protostar/evaluation re-uses the same formula via its own helper —
        * single source of formula truth is documented in
        * .planning/phases/08-evaluation-evolution/08-CONTEXT.md Q-02.
        */
       export function computeMechanicalScoresFromFindings(input: MechanicalScoresInput): MechanicalScores {
         const build = input.buildExitCode === undefined ? 1 : (input.buildExitCode === 0 ? 1 : 0);
         const lint = input.lintExitCode === undefined ? 1 : (input.lintExitCode === 0 ? 1 : 0);
         const diffSize =
           input.archetype === "cosmetic-tweak"
             ? (input.diffNameOnly.length <= 1 ? 1 : 0)
             : 1;
         const acCoverage =
           input.totalAcCount === 0 ? 1 : input.coveredAcCount / input.totalAcCount;
         return { build, lint, diffSize, acCoverage };
       }
       ```
    3. Re-export from `packages/mechanical-checks/src/index.ts`.
    4. Run `pnpm --filter @protostar/mechanical-checks test`. All cases green; no regressions.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/mechanical-checks test --run findings</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'export function computeMechanicalScoresFromFindings' packages/mechanical-checks/src/findings.ts` is 1
    - `grep -c 'MechanicalScores' packages/mechanical-checks/src/findings.ts` is at least 2 (import + return type)
    - 8 new test cases green
    - All existing `findings.test.ts` cases still green
    - `grep -c 'computeMechanicalScoresFromFindings' packages/mechanical-checks/src/index.ts` is at least 1 (barrel re-export)
  </acceptance_criteria>
  <done>Score producer landed in mechanical-checks; tests cover all 8 formula cases.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Thread mechanicalScores into the ReviewGate produced by createMechanicalChecksAdapter</name>
  <read_first>
    - packages/mechanical-checks/src/create-mechanical-checks-adapter.ts (full file — locate the point where the adapter constructs and returns the `ReviewGate`-like result)
    - packages/mechanical-checks/src/create-mechanical-checks-adapter.test.ts (existing test pattern; identify the assertion that inspects the returned gate)
    - packages/review/src/index.ts (current `createReviewGate` signature after Plan 08-02 — confirm it now accepts optional `mechanicalScores` input)
    - packages/mechanical-checks/src/findings.ts (after Task 1 — `computeMechanicalScoresFromFindings`)
  </read_first>
  <behavior>
    - When `createMechanicalChecksAdapter` builds its `ReviewGate` output, it now ALSO calls `computeMechanicalScoresFromFindings` with the same inputs that drove `buildFindings` and threads the result through `createReviewGate({...existing, mechanicalScores})`.
    - Backward compat: existing tests that don't inspect `mechanicalScores` MUST still pass (the field is optional and additive).
    - Tests (3 new):
      - Adapter run with successful build/lint + 1-file cosmetic diff + 1/1 AC → returned `gate.mechanicalScores` is `{ build: 1, lint: 1, diffSize: 1, acCoverage: 1 }`.
      - Adapter run with failing lint → `gate.mechanicalScores.lint === 0`.
      - Adapter run with cosmetic-tweak archetype + 3-file diff → `gate.mechanicalScores.diffSize === 0`.
    - DO NOT change the adapter's existing finding-emission behavior. The score is purely additive.
  </behavior>
  <files>packages/mechanical-checks/src/create-mechanical-checks-adapter.ts, packages/mechanical-checks/src/create-mechanical-checks-adapter.test.ts</files>
  <action>
    1. **RED:** Add 3 new test cases to `create-mechanical-checks-adapter.test.ts` asserting the `mechanicalScores` field on the returned gate. Run; tests fail.
    2. **GREEN:** Edit `packages/mechanical-checks/src/create-mechanical-checks-adapter.ts`:
       - Locate the existing call to `createReviewGate` (or wherever the output gate is constructed).
       - Compute `mechanicalScores` via `computeMechanicalScoresFromFindings({ buildExitCode, lintExitCode, diffNameOnly, archetype, totalAcCount, coveredAcCount })`. The required inputs are ALREADY available where findings are produced — locate `buildExitCode` from `commandResults.find(r => r.id === "build")?.exitCode` (and same for lint), `diffNameOnly` from the existing diff computation, `archetype` from the input, `totalAcCount` from `intent.acceptanceCriteria.length`, `coveredAcCount` from the existing AC-coverage analysis (it currently produces a finding when uncovered — count covered ACs from the same data source).
       - Pass `mechanicalScores` to `createReviewGate({ ...existing, mechanicalScores })` (new optional field from Plan 08-02).
       - If the inputs to compute scores are not in scope at the gate-construction site, refactor to lift them — but keep changes minimal.
    3. Run `pnpm --filter @protostar/mechanical-checks test`. All 3 new + all existing green.
    4. **REFACTOR:** Verify no fs/network imports were introduced.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/mechanical-checks test --run create-mechanical-checks-adapter</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'mechanicalScores' packages/mechanical-checks/src/create-mechanical-checks-adapter.ts` is at least 2 (computation + threading)
    - `grep -c 'computeMechanicalScoresFromFindings' packages/mechanical-checks/src/create-mechanical-checks-adapter.ts` is at least 1
    - 3 new test cases green
    - All existing adapter tests still green
    - `pnpm run verify` does not regress (or only the existing flake clusters listed in STATE.md surface)
  </acceptance_criteria>
  <done>Adapter emits gates with mechanicalScores populated; backward-compat preserved.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| commandResults → mechanical scores | Exit codes drive 0|1 score; absent commands score 1 (documented) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-08-04-01 | Tampering | findings.ts | mitigate | Pure formula; no I/O. Tests cover undefined-exit-code + zero-AC edge cases. |
| T-08-04-02 | Repudiation | create-mechanical-checks-adapter.ts | mitigate | Scores are additive; existing findings audit trail unchanged. |
</threat_model>

<verification>
- `pnpm --filter @protostar/mechanical-checks test` green
- `pnpm --filter @protostar/mechanical-checks build` green
- `pnpm run verify` does not regress
</verification>

<success_criteria>
- mechanical-checks emits numeric scores into the produced ReviewGate
- Q-02 formulas implemented with edge-case coverage
- No regression in existing finding behavior
</success_criteria>

<output>
Create `.planning/phases/08-evaluation-evolution/08-04-SUMMARY.md` documenting the producer + adapter wiring and the implicit contract that `@protostar/evaluation`'s `computeMechanicalScores` and this producer share Q-02 as the single formula source.
</output>
