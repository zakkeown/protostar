---
phase: 08-evaluation-evolution
plan: 08
type: execute
wave: 6
depends_on: ["08-06", "08-07"]
files_modified:
  - packages/admission-e2e/src/no-skipped-evaluation.contract.test.ts
  - packages/admission-e2e/src/eval-refusal-byte-equality.contract.test.ts
  - packages/admission-e2e/src/evaluation-runner-no-fs.contract.test.ts
  - packages/admission-e2e/src/planning-mission-prior-summary.contract.test.ts
  - packages/admission-e2e/src/calibration-log-append.contract.test.ts
  - packages/admission-e2e/package.json
  - packages/admission-e2e/tsconfig.json
autonomous: true
requirements: [EVAL-04, EVOL-01, EVOL-02, EVOL-03]
must_haves:
  truths:
    - "no-skipped-evaluation.contract.test.ts: a happy-path factory run emits an evaluation-report.json whose every stage has verdict ∈ {pass, fail} (Q-11 closes the EVAL-04 risk-register concern)"
    - "eval-refusal-byte-equality.contract.test.ts: fixture-parse failure refusal artifact and live pile-schema-parse refusal artifact are byte-equal after erasing parseErrors (mirror packages/admission-e2e/src/pile-refusal-byte-equality.contract.test.ts pattern)"
    - "evaluation-runner-no-fs.contract.test.ts: runtime fs-Proxy stub asserts runEvaluationStages does not call any fs/path API (Q-20 defense in depth on top of static walker)"
    - "planning-mission-prior-summary.contract.test.ts: when buildPlanningMission is called with a non-undefined PriorGenerationSummary, the mission text contains '## Previous Generation Summary' literal AND the prior verdicts AND the snapshot field names; with includePriorCodeHints=false the 'Prior diff:' line is ABSENT; with true it is present"
    - "calibration-log-append.contract.test.ts: a factory run produces exactly one new line in .protostar/calibration/ontology-similarity.jsonl (Q-18 stub; Phase 10 consumes)"
  artifacts:
    - path: packages/admission-e2e/src/no-skipped-evaluation.contract.test.ts
      provides: "EVAL-04 risk-register closure contract"
    - path: packages/admission-e2e/src/eval-refusal-byte-equality.contract.test.ts
      provides: "Refusal symmetry contract for evaluation pile failures"
    - path: packages/admission-e2e/src/evaluation-runner-no-fs.contract.test.ts
      provides: "Runtime fs-Proxy contract for @protostar/evaluation-runner"
    - path: packages/admission-e2e/src/planning-mission-prior-summary.contract.test.ts
      provides: "Q-16 PriorGenerationSummary text inclusion contract"
    - path: packages/admission-e2e/src/calibration-log-append.contract.test.ts
      provides: "Q-18 calibration jsonl stub append contract"
  key_links:
    - from: packages/admission-e2e/src/no-skipped-evaluation.contract.test.ts
      to: apps/factory-cli/src/main.ts (runtime)
      via: "Runs factory-cli end-to-end with fixtures and inspects evaluation-report.json"
      pattern: "evaluation-report.json"
    - from: packages/admission-e2e/src/evaluation-runner-no-fs.contract.test.ts
      to: packages/evaluation-runner/src/run-evaluation-stages.ts (runtime)
      via: "fs-Proxy stub passed via global; runner is invoked"
      pattern: "evaluation-runner"
---

<objective>
Land the five Phase 8 admission-e2e contracts. These pin all the high-risk invariants from CONTEXT.md as cross-package integration tests:

1. **No `'skipped'` ever emitted** (Q-11 + EVAL-04 risk-register row from ROADMAP line 316).
2. **Eval refusal byte-equality** — fixture-parse vs live-pile-failure produce equivalent refusal artifacts (mirrors Phase 6's pile-refusal-byte-equality contract).
3. **Runtime fs-Proxy contract** for evaluation-runner (Q-20 defense in depth on top of Plan 08-06's static walker).
4. **PriorGenerationSummary mission text** (Q-16) — text inclusion + codeEvolution-disabled exclusion.
5. **Calibration log stub append** (Q-18) — exactly one line per run; Phase 10 calibration script will consume.

Purpose: Last plan in Phase 8. Closes the EVAL-04 risk-register concern explicitly (per ROADMAP line 316: "add contract test that no stub status is emitted"). Provides defense in depth on the no-fs invariant. Pins behavioral contracts so future refactors can't silently regress them.
Output: Five new contract tests; admission-e2e suite green; Phase 8 verification gate-ready.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/08-evaluation-evolution/08-CONTEXT.md
@.planning/ROADMAP.md
@packages/admission-e2e/src/dogpile-adapter-no-fs.contract.test.ts
@packages/admission-e2e/src/pile-refusal-byte-equality.contract.test.ts
@packages/admission-e2e/src/pile-integration-smoke.contract.test.ts
@packages/admission-e2e/package.json
@packages/admission-e2e/tsconfig.json
@packages/evaluation/src/evaluation-pile-result.ts
@packages/evaluation-runner/src/run-evaluation-stages.ts
@packages/dogpile-adapter/src/index.ts
@packages/dogpile-adapter/src/pile-failure-types.ts
@apps/factory-cli/src/main.ts
@apps/factory-cli/src/calibration-log.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: no-skipped-evaluation.contract.test.ts (Q-11 + EVAL-04 risk closure)</name>
  <read_first>
    - packages/admission-e2e/src/pile-integration-smoke.contract.test.ts (existing Phase 6 end-to-end pattern)
    - apps/factory-cli/src/main.test.ts (around line 505 — the canonical end-to-end exercise referenced in Plan 06-08)
    - .planning/ROADMAP.md (line 316 — risk register: "add contract test that no stub status is emitted")
    - packages/evaluation/src/index.ts (`EvaluationStageStatus` from Plan 08-02 — the type-level guarantee)
  </read_first>
  <behavior>
    - Two-layer pin:
      1. **Static layer**: grep `packages/evaluation/src/` for the literal `"skipped"` → must return zero matches. (Defense against type-level regression where someone reintroduces the literal somewhere.)
      2. **Runtime layer**: run a factory exercise (fixture-mode planning + review piles, mocked evaluation pile that returns valid critiques), capture the produced `evaluation-report.json` artifact, parse it, assert `report.stages.every(s => s.verdict === "pass" || s.verdict === "fail")` — never any other literal.
    - The runtime exercise mocks `runEvaluationStages` deps (or runs against a fake server) — match the existing pile-integration-smoke pattern.
    - Test cases:
      - All-stages-pass run → 3 stages with pass.
      - Mechanical-fail run → 3 stages where mechanical is fail (semantic + consensus still emitted; verdict reflects the fail).
      - Consensus-skipped (high confidence) run → 2 stages, no `'skipped'` literal anywhere in the JSON file body (`grep '"skipped"' evaluation-report.json` → zero).
  </behavior>
  <files>packages/admission-e2e/src/no-skipped-evaluation.contract.test.ts</files>
  <action>
    1. **RED:** Create the file with the test cases. Run; tests fail (no production wiring yet — this contract validates Plan 08-07's wiring).
    2. **GREEN (after Plan 08-07 lands)**: Implement two layers:
       - Layer 1: `import { readFile } from "node:fs/promises"; import { resolve } from "node:path";` then walk `packages/evaluation/src/*.ts` and assert `!source.includes('"skipped"')` for each file. Static check.
       - Layer 2: invoke factory-cli with the cosmetic-tweak fixture; locate `runs/{id}/evaluation-report.json`; `JSON.parse(await readFile(...))`; assert `every(s => s.verdict === "pass" || s.verdict === "fail")`; assert no `'skipped'` substring appears in the raw file body.
    3. Run `pnpm --filter @protostar/admission-e2e test --run no-skipped-evaluation`. Green.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/admission-e2e test --run no-skipped-evaluation</automated>
  </verify>
  <acceptance_criteria>
    - `test -f packages/admission-e2e/src/no-skipped-evaluation.contract.test.ts` returns 0
    - `grep -c '"skipped"' packages/admission-e2e/src/no-skipped-evaluation.contract.test.ts` is at least 1 (the banned literal in the assertion)
    - 3 cases green
    - Test fails if a `'skipped'` literal is reintroduced into `packages/evaluation/src/`
  </acceptance_criteria>
  <done>EVAL-04 risk-register row explicitly closed by contract.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: eval-refusal-byte-equality.contract.test.ts</name>
  <read_first>
    - packages/admission-e2e/src/pile-refusal-byte-equality.contract.test.ts (verbatim template — fixture-parse vs live pile-schema-parse → byte-equal after erasing parseErrors)
    - packages/evaluation/src/evaluation-pile-result.ts (parseEvaluationPileResult)
    - apps/factory-cli/src/refusals-index.ts (refusal artifact shape; pile-evaluation stage)
    - .planning/phases/08-evaluation-evolution/08-CONTEXT.md Q-10 (refusal symmetry expectation)
  </read_first>
  <behavior>
    - Mirrors `pile-refusal-byte-equality.contract.test.ts` exactly. Two refusal artifacts produced from different code paths must be byte-equal except for `parseErrors` (which legitimately differs between fixture and live origin).
    - Path 1 (fixture-parse): manually call `parseEvaluationPileResult("not json")` → triggers schema-parse failure → write the synthesized refusal.json.
    - Path 2 (live): invoke a fake evaluation pile that returns `{ output: "not json" }` → factory-cli writes refusal.json via `writePileArtifacts` (or whatever the pile-persistence equivalent is for evaluation).
    - Erase `failure.parseErrors` from both bodies; deepEqual the rest.
    - `failure.class === "pile-schema-parse"` and `failure.sourceOfTruth === "EvaluationResult"` on both.
  </behavior>
  <files>packages/admission-e2e/src/eval-refusal-byte-equality.contract.test.ts</files>
  <action>
    1. Read `packages/admission-e2e/src/pile-refusal-byte-equality.contract.test.ts` verbatim. Copy structure.
    2. Replace `parsePlanningPileResult` references with `parseEvaluationPileResult`; replace `sourceOfTruth: "PlanningPileResult"` with `"EvaluationResult"`; replace stage `"pile-planning"` with `"pile-evaluation"`.
    3. Adjust the live-path fixture path / pile invocation to use `evaluationPilePreset` + `buildEvaluationMission`.
    4. Run `pnpm --filter @protostar/admission-e2e test --run eval-refusal-byte-equality`. Green.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/admission-e2e test --run eval-refusal-byte-equality</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c '"EvaluationResult"' packages/admission-e2e/src/eval-refusal-byte-equality.contract.test.ts` is at least 2 (both paths)
    - `grep -c '"pile-evaluation"' packages/admission-e2e/src/eval-refusal-byte-equality.contract.test.ts` is at least 2
    - `grep -c 'parseEvaluationPileResult' packages/admission-e2e/src/eval-refusal-byte-equality.contract.test.ts` is at least 1
    - `grep -c 'parseErrors' packages/admission-e2e/src/eval-refusal-byte-equality.contract.test.ts` is at least 1 (the erasure)
    - `grep -c 'deepEqual' packages/admission-e2e/src/eval-refusal-byte-equality.contract.test.ts` is at least 1
    - Test passes
  </acceptance_criteria>
  <done>Eval refusal byte-equality contract green; mirrors Phase 6 precedent.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: evaluation-runner-no-fs.contract.test.ts (runtime fs-Proxy)</name>
  <read_first>
    - packages/admission-e2e/src/dogpile-adapter-no-fs.contract.test.ts (verbatim template — runtime fs-Proxy stub asserting `ok=true` end-to-end while no fs/path APIs are touched; static walker is the SIBLING test in the package itself)
    - packages/evaluation-runner/src/run-evaluation-stages.ts (orchestrator under test)
    - packages/evaluation-runner/src/no-fs.contract.test.ts (Plan 08-06 static walker — counterpart)
    - .planning/phases/08-evaluation-evolution/08-CONTEXT.md Q-20 (runtime fs-Proxy as defense in depth)
  </read_first>
  <behavior>
    - Two-layer no-fs:
      - Static (Plan 08-06, packages/evaluation-runner/src/no-fs.contract.test.ts): bans imports.
      - Runtime (this plan, packages/admission-e2e/src/evaluation-runner-no-fs.contract.test.ts): wraps the test process's `node:fs` and `node:fs/promises` with a Proxy whose `get()` throws if any property is accessed; invokes `runEvaluationStages` with full fakes (fake `runFactoryPile`, fake `snapshotReader`, fake `intent`/`plan`); asserts the runner completes with `ok=true` (or whatever the success shape is) WITHOUT triggering a Proxy access.
    - Same pattern as the dogpile-adapter sibling test.
    - The fs-Proxy is installed via Node's module-resolution interceptor or by direct module-cache poke (whichever the dogpile-adapter precedent uses).
  </behavior>
  <files>packages/admission-e2e/src/evaluation-runner-no-fs.contract.test.ts</files>
  <action>
    1. Read `packages/admission-e2e/src/dogpile-adapter-no-fs.contract.test.ts` verbatim. Copy structure.
    2. Replace target import paths and function under test: `runFactoryPile` → `runEvaluationStages`; `dogpile-adapter` → `evaluation-runner`.
    3. Build fake inputs: a minimal `ConfirmedIntent`, `AdmittedPlan`, `ReviewGate` (with `mechanicalScores`), `runFactoryPile` deps that return successful evaluation pile bodies, `snapshotReader` that returns undefined.
    4. Run runner; assert no fs Proxy access; assert returned `report.verdict === "pass"`.
    5. Run test. Green.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/admission-e2e test --run evaluation-runner-no-fs</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'runEvaluationStages' packages/admission-e2e/src/evaluation-runner-no-fs.contract.test.ts` is at least 1
    - `grep -c 'Proxy' packages/admission-e2e/src/evaluation-runner-no-fs.contract.test.ts` is at least 1
    - `grep -c 'node:fs' packages/admission-e2e/src/evaluation-runner-no-fs.contract.test.ts` is at least 1 (the trapped module)
    - Test passes
    - Smoke: temporarily inserting `await import("node:fs/promises").then(m => m.readFile)` into runEvaluationStages causes test FAIL (revert before commit)
  </acceptance_criteria>
  <done>Runtime fs-Proxy contract green; defense in depth alongside the static walker.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: planning-mission-prior-summary.contract.test.ts (Q-16)</name>
  <read_first>
    - packages/dogpile-adapter/src/index.ts (after Plan 08-07 — `buildPlanningMission(intent, prior?)`, `PriorGenerationSummary` interface)
    - packages/admission-e2e/src/pile-integration-smoke.contract.test.ts (literal-grep token assertion pattern)
    - .planning/phases/08-evaluation-evolution/08-CONTEXT.md Q-16 (mission text content + Q-17 codeEvolution gating)
  </read_first>
  <behavior>
    - 4 cases:
      - `buildPlanningMission(intent)` (no prior) → mission text DOES NOT contain "## Previous Generation Summary".
      - `buildPlanningMission(intent, { generation: 1, snapshotFields: [{ name: "AC-1", type: "smoke" }], evolutionReason: "first run", priorVerdict: "pass", priorEvaluationVerdict: "pass", includePriorCodeHints: false })` → mission text contains "## Previous Generation Summary" AND "AC-1" AND "first run" AND DOES NOT contain "Prior diff:".
      - Same as above with `includePriorCodeHints: true, priorDiffNameOnly: ["src/Button.tsx"]` → mission text contains "Prior diff:" AND "src/Button.tsx".
      - Same as case 2 with `priorVerdict: "fail"` → mission text contains "Prior verdict: fail" (or however the format lays it out — match the Plan 08-07 template).
  </behavior>
  <files>packages/admission-e2e/src/planning-mission-prior-summary.contract.test.ts</files>
  <action>
    1. **RED:** Create the file with 4 cases using minimal `ConfirmedIntent` fixture. Run; tests fail until Plan 08-07 lands the new mission template.
    2. **GREEN (after Plan 08-07):** Confirm cases pass against the real `buildPlanningMission` from `@protostar/dogpile-adapter`.
    3. Run test. Green.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/admission-e2e test --run planning-mission-prior-summary</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'Previous Generation Summary' packages/admission-e2e/src/planning-mission-prior-summary.contract.test.ts` is at least 2 (positive + negative cases)
    - `grep -c 'Prior diff:' packages/admission-e2e/src/planning-mission-prior-summary.contract.test.ts` is at least 2 (positive + negative cases)
    - `grep -c 'includePriorCodeHints' packages/admission-e2e/src/planning-mission-prior-summary.contract.test.ts` is at least 2
    - 4 cases green
  </acceptance_criteria>
  <done>PriorGenerationSummary text-inclusion contract pins Q-16 + Q-17 mission gating.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 5: calibration-log-append.contract.test.ts (Q-18 stub)</name>
  <read_first>
    - apps/factory-cli/src/calibration-log.ts (Plan 08-07 — `appendCalibrationEntry`, `CALIBRATION_LOG_PATH`)
    - packages/admission-e2e/src/pile-integration-smoke.contract.test.ts (end-to-end factory invocation pattern)
    - .planning/phases/08-evaluation-evolution/08-CONTEXT.md Q-18 (stub-only Phase 8 deliverable; consumer is Phase 10)
  </read_first>
  <behavior>
    - Run a single factory exercise to completion (mocked piles + cosmetic-tweak fixture); capture the line count of `.protostar/calibration/ontology-similarity.jsonl` before and after; assert `after === before + 1`.
    - Parse the appended line; assert it has fields `{ runId, lineageId, generation, threshold, evolutionAction, timestamp }` (similarity is optional when no prior).
    - `evolutionAction` is `"continue" | "converged" | "exhausted"`.
    - 2 cases:
      - First-run case (no prior) → line has `similarity: undefined`, `evolutionAction: "continue"`.
      - Second-run case (chain index has one entry) → line has numeric `similarity` and `evolutionAction: "continue"|"converged"`.
  </behavior>
  <files>packages/admission-e2e/src/calibration-log-append.contract.test.ts</files>
  <action>
    1. **RED:** Create the file. Use `mkdtemp` for an isolated `.protostar/calibration/` parent. Run; tests fail until Plan 08-07 wiring lands.
    2. **GREEN (after Plan 08-07):** Run factory-cli end-to-end; verify line count delta + line shape.
    3. Run test. Green.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/admission-e2e test --run calibration-log-append</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'ontology-similarity.jsonl' packages/admission-e2e/src/calibration-log-append.contract.test.ts` is at least 1
    - `grep -c 'evolutionAction' packages/admission-e2e/src/calibration-log-append.contract.test.ts` is at least 1
    - 2 cases green
  </acceptance_criteria>
  <done>Calibration log stub append contract green; Phase 10 calibration script will consume this exact format.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Phase 8 implementation → contract suite | Contracts pin invariants so future refactors can't silently regress |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-08-08-01 | Tampering | no-skipped-evaluation contract | mitigate | Static + runtime two-layer check; closes EVAL-04 risk-register row explicitly. |
| T-08-08-02 | Elevation of Privilege | evaluation-runner-no-fs runtime contract | mitigate | Defense in depth on top of Plan 08-06's static walker. |
| T-08-08-03 | Repudiation | eval-refusal-byte-equality contract | mitigate | Pins symmetric refusal artifacts; one operator mental model. |
| T-08-08-04 | Information Disclosure | planning-mission-prior-summary | mitigate | Asserts code-state hints absent when codeEvolution is disabled. |
</threat_model>

<verification>
- `pnpm --filter @protostar/admission-e2e test` green (5 new contracts + existing 73 from Phase 6 Plan 06-08)
- `pnpm run verify` green (or only existing flake clusters per STATE.md)
</verification>

<success_criteria>
- All 5 contracts land and pass
- EVAL-04 risk-register row closed by no-skipped-evaluation contract
- Q-20 no-fs invariant has both static (Plan 08-06) and runtime (this plan) defense
- Q-16 PriorGenerationSummary text contract pins both inclusion and gated exclusion
- Q-18 calibration jsonl stub format pinned for Phase 10 consumption
</success_criteria>

<output>
Create `.planning/phases/08-evaluation-evolution/08-08-SUMMARY.md` listing all 5 contracts, their target invariants, and noting Phase 8 is now verification-ready (every CONTEXT.md decision Q-01..Q-20 has at least one contract or unit test pinning it).
</output>
