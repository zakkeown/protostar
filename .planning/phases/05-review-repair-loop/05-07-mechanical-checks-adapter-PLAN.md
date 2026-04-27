---
phase: 05-review-repair-loop
plan: 07
type: execute
wave: 3
depends_on: [02, 04, 06]
files_modified:
  - packages/mechanical-checks/src/index.ts
  - packages/mechanical-checks/src/create-mechanical-checks-adapter.ts
  - packages/mechanical-checks/src/create-mechanical-checks-adapter.test.ts
  - packages/mechanical-checks/src/findings.ts
  - packages/mechanical-checks/src/findings.test.ts
  - packages/mechanical-checks/src/diff-name-only.ts
  - packages/mechanical-checks/src/diff-name-only.test.ts
autonomous: true
requirements: [LOOP-01]
must_haves:
  truths:
    - "`createMechanicalChecksAdapter(config): ExecutionAdapter` exists; returned adapter id is `'mechanical-checks'`"
    - "Adapter consumes commands from `factory-config.json mechanicalChecks.commands` (Q-07); cosmetic-tweak archetype default is `[{id:'verify',argv:['pnpm','verify']}, {id:'lint',argv:['pnpm','lint']}]`"
    - "Adapter executes commands SEQUENTIALLY via `repoSubprocessRunner` from `@protostar/repo` — no other subprocess path"
    - "Adapter computes `git diff --name-only base..head` via isomorphic-git and emits run-level cosmetic-archetype check (Q-08 second defense)"
    - "Adapter parses `node:test` reporter output to detect AC test names (Q-09 mechanical side); ac-uncovered findings have `severity: 'major'` and `repairTaskId` pointing to the task whose acceptanceTestRefs.testName failed to appear"
    - "Adapter emits AdapterEvent stream culminating in `final` with `outcome: 'change-set'` (empty change set — mechanical-checks does NOT modify workspace) carrying structured MechanicalCheckResult evidence"
  artifacts:
    - path: packages/mechanical-checks/src/create-mechanical-checks-adapter.ts
      provides: "factory function returning ExecutionAdapter"
    - path: packages/mechanical-checks/src/findings.ts
      provides: "buildFindings(commandResults, plan, archetype, diffNameOnly): readonly ReviewFinding[]"
    - path: packages/mechanical-checks/src/diff-name-only.ts
      provides: "computeDiffNameOnly(workspaceRoot, baseRef): Promise<readonly string[]> via isomorphic-git"
  key_links:
    - from: packages/mechanical-checks/src/create-mechanical-checks-adapter.ts
      to: "@protostar/repo (repoSubprocessRunner)"
      via: "named import"
      pattern: "from \"@protostar/repo\""
    - from: packages/mechanical-checks/src/findings.ts
      to: "@protostar/review (ReviewFinding type)"
      via: "type import"
      pattern: "from \"@protostar/review\""
---

<objective>
Implement the mechanical-checks adapter (Q-07): runs configured commands inside the workspace via Phase 3's `repoSubprocessRunner`, computes diff-name-only, parses test output for AC coverage, builds structured findings. Adapter is the sole authority for run-level mechanical evidence; `@protostar/review` consumes the evidence and produces the verdict (Plan 05-10).

Per Q-07 + Q-08 + Q-09:
- Q-07: hybrid — adapter runs subprocesses, review inspects evidence
- Q-08 (run-level second defense): assert run-level diff-name-only count ≤1 for cosmetic-tweak archetype
- Q-09 (mechanical side): for each `task.acceptanceTestRefs[]`, assert testFile in diff AND testName in test stdout

Purpose: Subprocess + diff + test-output parsing concentrated in a single, single-purpose package; review stays a pure inspector.
Output: ExecutionAdapter implementation + findings builder + diff-name-only helper, all tested.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/05-review-repair-loop/05-CONTEXT.md
@packages/execution/src/adapter-contract.ts
@packages/repo/src/index.ts
@packages/review/src/repair-types.ts
@packages/review/src/index.ts
@packages/policy/src
@.planning/phases/04-execution-engine/04-06-coder-adapter-orchestrator-PLAN.md

Read repoSubprocessRunner shape: `grep -n "runCommand\\|repoSubprocessRunner\\|export.*subprocess" packages/repo/src/index.ts packages/repo/src/subprocess-runner.ts 2>/dev/null`

Read isomorphic-git for `git.statusMatrix` / `git.log` — Phase 3 already wires it; reuse the same import path. For diff-name-only between two refs (HEAD vs base), use `git.walk` or `git.statusMatrix` — `statusMatrix` is the simpler API. If two-ref diff isn't directly available, materialize the working tree diff using `statusMatrix` filtered to changed entries.

<interfaces>
```typescript
// create-mechanical-checks-adapter.ts
import type { ExecutionAdapter, AdapterEvent, AdapterContext, AdapterResult } from "@protostar/execution";
import type { MechanicalCheckResult } from "@protostar/review";

export interface MechanicalChecksAdapterConfig {
  readonly workspaceRoot: string;
  readonly commands: readonly { readonly id: string; readonly argv: readonly string[]; readonly cwd?: string }[];
  readonly archetype: "cosmetic-tweak" | "feature-add" | "refactor" | "bugfix";
  readonly baseRef: string;        // base SHA to diff against (head is current HEAD)
  readonly runId: string;
  readonly attempt: number;
  // AGENTS.md authority compliance (per checker warning #5):
  // mechanical-checks does NOT import `node:fs` directly. fs reads (e.g.
  // reading subprocess stdout files captured by repoSubprocessRunner) are
  // performed via this injected capability. Wired by 05-12 (factory-cli is the
  // only place node:fs lives, alongside packages/repo).
  readonly readFile: (path: string) => Promise<string>;
  readonly subprocess: import("@protostar/repo").RepoSubprocessRunner;  // injected, not imported directly
}

export function createMechanicalChecksAdapter(config: MechanicalChecksAdapterConfig): ExecutionAdapter;
```

Adapter behavior:
1. Yield `progress { message: "running mechanical commands" }`.
2. For each `command` in config.commands (sequential, in order):
   - Invoke `repoSubprocessRunner.runCommand({ argv: command.argv, cwd: command.cwd ?? config.workspaceRoot, ... })`.
   - Yield `token` events for stdout/stderr (if the runner provides streaming) OR a `progress` event with the byte counts after completion.
   - Capture exit code, stdout/stderr file paths.
3. Compute `diffNameOnly` via `computeDiffNameOnly(workspaceRoot, baseRef)`.
4. Build findings via `buildFindings({ commandResults, plan: config.plan, archetype, diffNameOnly, testStdout })`.
   *Note:* config also needs the admitted plan to read `task.acceptanceTestRefs`. Add `readonly plan: AdmittedPlanExecutionArtifact;` to `MechanicalChecksAdapterConfig`.
5. Yield `final { result: { outcome: "change-set", changeSet: <empty>, evidence: { ...mechanicalCheckResult } } }`.
   - Mechanical-checks does NOT modify the workspace. The empty change set with structured `evidence` carries the `MechanicalCheckResult`.
   - If a finer typing is needed, set `outcome: "adapter-failed", reason: "mechanical-block"` only when a critical-severity finding is present; otherwise emit the change-set+evidence path. Planner pick: emit `change-set` always; the loop reads evidence to derive verdict.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: diff-name-only helper via isomorphic-git</name>
  <files>packages/mechanical-checks/src/diff-name-only.ts, packages/mechanical-checks/src/diff-name-only.test.ts</files>
  <read_first>
    - packages/repo/src/clone-workspace.ts (or wherever isomorphic-git is imported — `grep -rn "isomorphic-git" packages/repo/src/`)
    - packages/repo/src/internal/test-fixtures (Phase 3 Plan 03-04 — buildSacrificialRepo for test setup)
    - .planning/phases/05-review-repair-loop/05-CONTEXT.md §Q-08 ("compute `git diff --name-only base..head` (via `isomorphic-git` from Phase 3)")
  </read_first>
  <behavior>
    - Test 1: Sacrificial repo with one commit on top of base (`base..head` differs by 1 file `src/foo.ts`) → returns `["src/foo.ts"]`.
    - Test 2: No commits since base → returns `[]`.
    - Test 3: 3 files changed → returns all 3, sorted alphabetically (deterministic order).
    - Test 3b (negative-case for cosmetic-tweak ≤1 rule, LOOP-01): repo with 2 files changed since base → `computeDiffNameOnly` returns array of length 2 (used by Task 2 to derive the cosmetic-archetype-violation finding; this asserts the helper does NOT silently truncate to 1).
    - Test 4: Renamed file (Phase 3's diff stack — depends on Phase 3 capability; if statusMatrix doesn't track renames natively, document that renames appear as delete+add).
  </behavior>
  <action>
1. Create `packages/mechanical-checks/src/diff-name-only.ts`:
   ```typescript
   import * as git from "isomorphic-git";
   import * as fs from "node:fs";

   // NOTE: This helper lives in mechanical-checks rather than packages/repo because
   // it's specific to review-time diff inspection, not workspace mutation. The
   // isomorphic-git read-only access is acceptable per AGENTS.md authority boundary
   // discussion — surface to operator if a more conservative split is preferred.

   export async function computeDiffNameOnly(input: {
     readonly workspaceRoot: string;
     readonly baseRef: string;     // commit SHA or ref
     readonly headRef?: string;    // default "HEAD"
   }): Promise<readonly string[]>;
   ```
   Implementation: use `git.walk` with two trees (base and head) and collect paths whose tree entries differ. If `git.walk` is too low-level for the time budget, use `git.statusMatrix({ ref: baseRef })` and emit names where `[2] !== [3]` (head differs from base). Sort output alphabetically for determinism.

   **Authority caveat:** if `packages/repo` already exports a `diffNameOnly` helper, use it instead and remove this file (read repo barrel first). The intent is one helper, owned by repo; mechanical-checks calls it.

2. Tests use `buildSacrificialRepo` from Phase 3 to construct deterministic git state.

If the AGENTS.md authority audit fails (mechanical-checks importing isomorphic-git directly), move this helper to `packages/repo/src/diff-name-only.ts`, export from repo barrel, and import from mechanical-checks. Surface the choice in SUMMARY.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && (grep -c 'export async function computeDiffNameOnly' packages/mechanical-checks/src/diff-name-only.ts || grep -c 'export async function computeDiffNameOnly\|export.*diffNameOnly' packages/repo/src/*.ts) && pnpm --filter @protostar/mechanical-checks test 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `computeDiffNameOnly` (or equivalent named export) exists in either `packages/mechanical-checks/src/diff-name-only.ts` OR `packages/repo/src/diff-name-only.ts`
    - Returns `readonly string[]` sorted alphabetically (Test 3 verifies)
    - Negative-case assertion (LOOP-01 ≤1-file rule per Q-08): Test 3b proves `computeDiffNameOnly` returns length-2 result when the underlying repo has 2 files diff against base — guarantees Task 2's `buildFindings` will see the ≥2 condition and emit `cosmetic-archetype-violation` (severity: critical). The cosmetic-tweak archetype's `MechanicalCheckResult` therefore translates to ReviewGate.verdict !== 'pass' for this fixture.
    - All tests pass
  </acceptance_criteria>
  <done>Diff-name-only helper available; cosmetic-archetype run-level check (Q-08) and AC-coverage check (Q-09) can consume it.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: buildFindings — diff/build/lint/AC findings builder</name>
  <files>packages/mechanical-checks/src/findings.ts, packages/mechanical-checks/src/findings.test.ts</files>
  <read_first>
    - packages/review/src/index.ts (ReviewFinding shape, ReviewRuleId union — extend if needed)
    - packages/review/src/repair-types.ts (MechanicalCheckCommandResult shape)
    - .planning/phases/05-review-repair-loop/05-CONTEXT.md §Q-08, §Q-09
    - packages/planning/src/index.ts (PlanTask.acceptanceTestRefs shape — added in Plan 05-03)
  </read_first>
  <behavior>
    - Test 1 (build-failure): commandResults contains `{ id: 'verify', exitCode: 1 }` → emits 1 finding `{ ruleId: 'build-failure', severity: 'critical', repairTaskId: undefined }` (build failure may not map to a single task — leave repairTaskId undefined; loop treats critical → block).
    - Test 2 (lint-failure): commandResults contains `{ id: 'lint', exitCode: 2 }` → emits 1 finding `{ ruleId: 'lint-failure', severity: 'major' }`.
    - Test 3 (cosmetic-archetype-violation): archetype=cosmetic-tweak, diffNameOnly=["a.ts","b.ts"] → emits 1 finding `{ ruleId: 'cosmetic-archetype-violation', severity: 'critical', evidence: { touchedFiles: ['a.ts','b.ts'] } }`.
    - Test 4 (cosmetic-archetype OK): archetype=cosmetic-tweak, diffNameOnly=["a.ts"] → no violation finding.
    - Test 5 (ac-uncovered, missing testFile): plan task has `acceptanceTestRefs: [{ acId: 'ac-1', testFile: 'a.test.ts', testName: 'renders' }]`, diffNameOnly=["a.ts"] (a.test.ts not in diff) → emits `{ ruleId: 'ac-uncovered', severity: 'major', repairTaskId: 'task-x', evidence: { acId: 'ac-1', missingTestFile: 'a.test.ts' } }`.
    - Test 6 (ac-uncovered, missing testName in stdout): plan task has acceptanceTestRefs, testFile is in diff BUT testName 'renders' is not in `testStdout` → emits ac-uncovered finding with `evidence.missingTestName: 'renders'`.
    - Test 7 (ac covered): both testFile in diff AND testName in stdout → no finding.
  </behavior>
  <action>
1. Inspect `packages/review/src/index.ts` for the `ReviewRuleId` union (locate via `grep -n 'ReviewRuleId' packages/review/src/index.ts`). The union likely needs to widen to include the new ruleIds:
   - `'build-failure'`
   - `'lint-failure'`
   - `'cosmetic-archetype-violation'`
   - `'ac-uncovered'`

   If these ruleIds are missing, edit `packages/review/src/index.ts` to widen the union. List the additions in this plan's SUMMARY (cross-package edit).

2. Create `packages/mechanical-checks/src/findings.ts`:
   ```typescript
   import type { ReviewFinding } from "@protostar/review";
   import type { MechanicalCheckCommandResult } from "@protostar/review";
   import type { AdmittedPlanExecutionArtifact } from "@protostar/planning";

   export function buildFindings(input: {
     readonly commandResults: readonly MechanicalCheckCommandResult[];
     readonly plan: AdmittedPlanExecutionArtifact;
     readonly archetype: "cosmetic-tweak" | "feature-add" | "refactor" | "bugfix";
     readonly diffNameOnly: readonly string[];
     readonly testStdout: string;     // concatenated stdout from all 'test'/'verify' commands
   }): readonly ReviewFinding[];
   ```

3. Implementation walks four checks:
   - For each command with `exitCode !== 0`: emit build-failure (id starts with "verify" or "build") or lint-failure (id starts with "lint") or generic-command-failure (otherwise).
   - If `archetype === "cosmetic-tweak"` and `diffNameOnly.length > 1`: emit cosmetic-archetype-violation with the full file list.
   - For each `task` in `plan.tasks` with `acceptanceTestRefs`: for each ref, check `diffNameOnly.includes(ref.testFile)`; check `testStdout.includes(ref.testName)`. Emit ac-uncovered findings with the failing reason in `evidence`.
   - Pure function — no fs, no subprocess.

4. Tests cover the 7 behaviors. Use small inline plan fixtures.

**AC test parsing (Claude's Discretion per CONTEXT):** v0.1 uses substring search (`testStdout.includes(testName)`). `node:test` reporter output is regular enough that this works for the cosmetic-tweak fixture. Document in module header that `node:test` TAP output is the assumed format; pluggable parsers per archetype is deferred (CONTEXT "Deferred Ideas").
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && grep -c 'export function buildFindings' packages/mechanical-checks/src/findings.ts && grep -cE 'cosmetic-archetype-violation|ac-uncovered|build-failure|lint-failure' packages/mechanical-checks/src/findings.ts | awk '{print ($1 >= 4) ? "ok" : "fail"}' | grep -q ok && grep -cE 'node:fs|node:net|spawn\(|fetch\(' packages/mechanical-checks/src/findings.ts && pnpm --filter @protostar/mechanical-checks test 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'export function buildFindings' packages/mechanical-checks/src/findings.ts` == 1
    - All four new ruleId strings appear in `findings.ts` source
    - `grep -cE 'node:fs|node:net|spawn\\(|fetch\\(' packages/mechanical-checks/src/findings.ts` == 0 (pure)
    - **Negative-case assertion (LOOP-01, per checker warning #7):** Test 3 verifies that with `archetype: "cosmetic-tweak"` and `diffNameOnly: ["a.ts","b.ts"]` (subprocess stub returns a 2-line `git diff --name-only` fixture; ≥2 files) the returned `findings` array contains exactly one `{ ruleId: "cosmetic-archetype-violation", severity: "critical" }` entry. Combined with the existing `createReviewGate` severity→verdict map (review/src/index.ts:128, critical → "block"), this proves the resulting `ReviewGate.verdict !== "pass"` for the ≥2-file case. AC: `grep -c 'severity: "critical"' packages/mechanical-checks/src/findings.ts` ≥ 1 AND the test explicitly `assert.equal(findings[0].severity, "critical")`.
    - All 7 tests pass
    - If `ReviewRuleId` was widened, `grep -c 'cosmetic-archetype-violation' packages/review/src/index.ts` ≥ 1
  </acceptance_criteria>
  <done>Findings builder pinned; mechanical findings flow through `createReviewGate` (existing severity→verdict map in review/src/index.ts:128) without rewrite.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: createMechanicalChecksAdapter (subprocess orchestration + final event)</name>
  <files>packages/mechanical-checks/src/create-mechanical-checks-adapter.ts, packages/mechanical-checks/src/create-mechanical-checks-adapter.test.ts, packages/mechanical-checks/src/index.ts</files>
  <read_first>
    - packages/repo/src/subprocess-runner.ts (or wherever runCommand lives — Phase 3 Plan 03-09 deliverable)
    - packages/execution/src/adapter-contract.ts (ExecutionAdapter, AdapterEvent shapes — Phase 4 Plan 04-02)
    - packages/review/src/repair-types.ts (MechanicalCheckResult shape)
    - packages/repo/src/internal/test-fixtures (buildSacrificialRepo for tests)
    - .planning/phases/05-review-repair-loop/05-CONTEXT.md §Q-07
  </read_first>
  <behavior>
    - Test 1 (happy path, all commands pass): mock subprocess runner returns exit 0 for both verify+lint; diff returns ["a.ts"]; archetype cosmetic-tweak; plan has 1 task with one passing AC ref → adapter yields events including a `final` event with `outcome: "change-set"` and evidence containing `findings: []`.
    - Test 2 (build failure): mock runner returns exit 1 for verify → final evidence contains build-failure finding with severity critical.
    - Test 3 (cosmetic violation): diff returns 2 files → final evidence has cosmetic-archetype-violation.
    - Test 4 (sequential execution): mock runner records call order; assert verify is called before lint.
    - Test 5 (subprocess timeout): runner yields a timeout error → adapter still emits a `final` event with a finding `{ ruleId: 'mechanical-command-timeout', severity: 'critical' }` (do NOT propagate as adapter-failed; loop treats critical as block).
    - Test 6 (id is "mechanical-checks"): `adapter.id === "mechanical-checks"`.
    - Test 7 (AGENTS.md authority — injected fs read, per checker warning #5): construct adapter with a stub `readFile` that records calls. Run a `verify`-id command whose stdout file path is `/tmp/stdout.log`. Assert `stubReadFile` was called EXACTLY once with `"/tmp/stdout.log"`. Assert `grep -cE "from \"node:fs\"|from \"fs\""` against the adapter source is 0.
  </behavior>
  <action>
1. Create `packages/mechanical-checks/src/create-mechanical-checks-adapter.ts` per `<interfaces>`. Use Phase 4's adapter contract literally (AsyncIterable<AdapterEvent>).
2. Implementation outline (per checker warning #5: NO direct `node:fs` imports — `readFile` and `subprocess` are injected via config; AGENTS.md authority preserved):
   ```typescript
   export function createMechanicalChecksAdapter(config: MechanicalChecksAdapterConfig): ExecutionAdapter {
     return {
       id: "mechanical-checks",
       async *execute(_task, ctx) {
         yield { kind: "progress", message: "running mechanical commands" };
         const commandResults: MechanicalCheckCommandResult[] = [];
         let testStdout = "";
         for (const cmd of config.commands) {
           const start = Date.now();
           // Subprocess runner is INJECTED via config.subprocess (sourced from
           // @protostar/repo at the wiring site in 05-12). This adapter does
           // not import the runner module directly — the type-only import in
           // MechanicalChecksAdapterConfig is the only @protostar/repo touch.
           const result = await config.subprocess.runCommand({
             argv: cmd.argv,
             cwd: cmd.cwd ?? config.workspaceRoot,
             signal: ctx.signal,
             timeoutMs: ctx.budget.taskWallClockMs
           });
           commandResults.push({
             id: cmd.id, argv: cmd.argv,
             exitCode: result.exitCode,
             durationMs: Date.now() - start,
             stdoutPath: result.stdoutPath,
             stderrPath: result.stderrPath
           });
           if (cmd.id.includes("verify") || cmd.id.includes("test")) {
             // INJECTED readFile capability (see config). NO `node:fs` import in
             // this package. Wired in 05-12 to the same FsAdapter.readFile that
             // packages/repo + apps/factory-cli already use.
             testStdout += await config.readFile(result.stdoutPath);
           }
           yield { kind: "progress", message: `${cmd.id} exit=${result.exitCode}` };
         }
         const diffNameOnly = await computeDiffNameOnly({ workspaceRoot: config.workspaceRoot, baseRef: config.baseRef });
         const findings = buildFindings({ commandResults, plan: config.plan, archetype: config.archetype, diffNameOnly, testStdout });
         const evidence: MechanicalCheckResult = {
           schemaVersion: "1.0.0", runId: config.runId, attempt: config.attempt,
           commands: commandResults, diffNameOnly, findings
         };
         const result: AdapterResult = { outcome: "change-set", changeSet: { files: [] }, evidence: evidence as any };
         yield { kind: "final", result };
       }
     };
   }
   ```
   **Authority audit:** `grep -cE "from \"node:fs\"|from \"fs\"|require\(\"fs\"\)" packages/mechanical-checks/src/*.ts` MUST be 0. Same gate applies to `child_process`/`spawn`. Subprocess runs ONLY via the injected `config.subprocess`. fs reads ONLY via injected `config.readFile`. The wiring caller (05-12) supplies both from `@protostar/repo`'s authorized helpers + `FsAdapter.readFile`.

   Refine: AdapterResult `evidence` field shape may not accept arbitrary objects — adapt to Phase 4's AdapterEvidence shape if it requires `model`/`attempts`/etc. If MechanicalCheckResult doesn't fit, store it as a separate `mechanicalResult` field on AdapterResult OR widen AdapterResult evidence to accept `MechanicalCheckResult | AdapterEvidence`. Read Phase 4 Plan 04-02 Task 1 contract first; decide based on that shape.

3. Update `packages/mechanical-checks/src/index.ts` to export:
   ```ts
   export * from "./create-mechanical-checks-adapter.js";
   export * from "./findings.js";
   export * from "./diff-name-only.js";
   ```
   Remove the placeholder skeleton constant from Plan 05-02.

4. Tests: stub the subprocess runner (inject via DI or module-mock), assert event sequence and final evidence.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && grep -c 'export function createMechanicalChecksAdapter' packages/mechanical-checks/src/create-mechanical-checks-adapter.ts && grep -c 'id: "mechanical-checks"' packages/mechanical-checks/src/create-mechanical-checks-adapter.ts && grep -c 'export \* from "./create-mechanical-checks-adapter' packages/mechanical-checks/src/index.ts && pnpm --filter @protostar/mechanical-checks test 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'export function createMechanicalChecksAdapter' packages/mechanical-checks/src/create-mechanical-checks-adapter.ts` == 1
    - `grep -c 'id: "mechanical-checks"' packages/mechanical-checks/src/create-mechanical-checks-adapter.ts` == 1
    - `grep -c 'export \\* from "./create-mechanical-checks-adapter' packages/mechanical-checks/src/index.ts` == 1
    - **AGENTS.md authority gate (per checker warning #5):** `grep -rE 'from "node:fs"|from "fs"|require\("fs"\)|child_process|spawn\(' packages/mechanical-checks/src/ | grep -v '\.test\.ts'` returns ZERO results (test files MAY use node:fs for fixture setup; source files MUST NOT)
    - `grep -c 'config.readFile' packages/mechanical-checks/src/create-mechanical-checks-adapter.ts` ≥ 1 (injected fs capability used)
    - `grep -c 'config.subprocess' packages/mechanical-checks/src/create-mechanical-checks-adapter.ts` ≥ 1 (injected subprocess used; no direct repo runner import)
    - All 7 tests pass (was 6; readFile injection assertion added per checker warning #5)
  </acceptance_criteria>
  <done>Mechanical-checks adapter implemented; loop (Plan 05-10) constructs and invokes it as the mechanical-checker service.</done>
</task>

</tasks>

<threat_model>
| Boundary | Description |
|----------|-------------|
| mechanical-checks ↔ filesystem (via repoSubprocessRunner) | only authorized subprocess path |
| mechanical-checks ↔ git read | read-only access to detect violations |

| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|------------|
| T-05-13 | Elevation of Privilege | adapter shells out via Node child_process directly OR reads files via node:fs directly | mitigate | per checker warning #5: BOTH `subprocess` AND `readFile` are INJECTED via `MechanicalChecksAdapterConfig`; Plan 05-12 wires both from authorized sources (`@protostar/repo` runner + `FsAdapter.readFile`). Authority gate AC asserts zero `node:fs|fs|child_process|spawn` imports in `packages/mechanical-checks/src/*.ts` (excluding test files). |
| T-05-14 | Tampering | cosmetic-archetype-violation defeated by missing run-level check | mitigate | run-level diff-name-only is a separate evidence field; review verifies independently of per-task apply gate (Plan 05-09) |
| T-05-15 | Tampering | ac-uncovered defeated by judge-only mention without test | mitigate | requires BOTH testFile in diff AND testName in stdout — substring match in Q-09 lock |
</threat_model>

<verification>
- `pnpm --filter @protostar/mechanical-checks test` green
- `pnpm --filter @protostar/mechanical-checks build` green
- All four new ruleIds present in source
</verification>

<success_criteria>
- Mechanical-checks adapter is a single-purpose ExecutionAdapter
- Run-level cosmetic-archetype check + AC coverage check live in this adapter
- Findings flow into existing review verdict mapping unchanged
</success_criteria>

<output>
Create `.planning/phases/05-review-repair-loop/05-07-SUMMARY.md`: documents the new adapter, the four new ruleIds added to ReviewRuleId, and the diff-name-only helper location (mechanical-checks vs repo).
</output>
</content>
</invoke>