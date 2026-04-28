---
phase: 09-operator-surface-resumability
plan: 11
type: execute
wave: 4
depends_on: [01, 02, 03, 04, 05, 06, 07, 08, 09, 10]
files_modified:
  - packages/admission-e2e/src/exit-codes.contract.test.ts
  - packages/admission-e2e/src/factory-cli-help.contract.test.ts
  - packages/admission-e2e/src/factory-cli-stdout-canonical.contract.test.ts
  - packages/admission-e2e/src/status-row-schema.contract.test.ts
  - packages/admission-e2e/src/inspect-schema.contract.test.ts
  - packages/admission-e2e/src/resume-stage-dispatch.contract.test.ts
  - packages/admission-e2e/src/delivery-reauthorize.contract.test.ts
  - packages/admission-e2e/src/fixtures/help/run-help.txt
  - packages/admission-e2e/src/fixtures/help/status-help.txt
  - packages/admission-e2e/src/fixtures/help/resume-help.txt
  - packages/admission-e2e/src/fixtures/help/cancel-help.txt
  - packages/admission-e2e/src/fixtures/help/inspect-help.txt
  - packages/admission-e2e/src/fixtures/help/deliver-help.txt
  - packages/admission-e2e/src/fixtures/help/prune-help.txt
  - packages/admission-e2e/src/fixtures/help/root-help.txt
  - packages/admission-e2e/package.json
  - packages/admission-e2e/tsconfig.json
autonomous: true
requirements: [OP-01, OP-02, OP-03, OP-04, OP-05, OP-06, OP-07, OP-08]
must_haves:
  truths:
    - "exit-codes.contract.test pins ExitCode integer values 0..6 (Q-03)"
    - "factory-cli-help.contract.test pipes `--help` for root + each subcommand and asserts stdout is empty AND stderr matches a fixture (Q-04 stdout discipline + Pitfall 4 verbatim)"
    - "factory-cli-stdout-canonical.contract.test round-trips stdout JSON through writeStdoutJson + sortJsonValue and asserts byte-identical idempotency (Q-12)"
    - "status-row-schema.contract.test locks BOTH StatusRowMinimal AND StatusRowFull schemas (Q-07)"
    - "inspect-schema.contract.test asserts the {manifest, artifacts: [{stage, kind, path, sha256?}], summary} shape AND that trace.json contents are NEVER inlined (Q-10/Q-11)"
    - "resume-stage-dispatch.contract.test asserts: operator-cancelled → exit 4; transient sentinel → unlinks; mid-execution → replayOrphanedTasks invocation (Q-15)"
    - "delivery-reauthorize.contract.test asserts: persisted authorization roundtrips through reAuthorizeFromPayload; tampered payload (gate-not-pass / runId-mismatch) is rejected (Q-21)"
    - "Help fixtures are pinned via commander 14.0.3 exact pin (avoids commander minor-version drift)"
  artifacts:
    - path: packages/admission-e2e/src/exit-codes.contract.test.ts
      provides: "ExitCode integer snapshot"
    - path: packages/admission-e2e/src/factory-cli-help.contract.test.ts
      provides: "Per-command --help snapshot + stdout-empty assertion"
    - path: packages/admission-e2e/src/factory-cli-stdout-canonical.contract.test.ts
      provides: "Round-trip byte-equality contract"
    - path: packages/admission-e2e/src/status-row-schema.contract.test.ts
      provides: "Tiered status schema lock"
    - path: packages/admission-e2e/src/inspect-schema.contract.test.ts
      provides: "Inspect output shape + no-trace-inline lock"
    - path: packages/admission-e2e/src/resume-stage-dispatch.contract.test.ts
      provides: "Resume dispatch matrix lock"
    - path: packages/admission-e2e/src/delivery-reauthorize.contract.test.ts
      provides: "Re-mint security boundary lock"
  key_links:
    - from: packages/admission-e2e/src/factory-cli-help.contract.test.ts
      to: apps/factory-cli/dist/main.js
      via: "spawnSync against built CLI binary; pipes --help; asserts stdout empty + stderr matches fixture"
      pattern: "spawnSync"
    - from: packages/admission-e2e/src/delivery-reauthorize.contract.test.ts
      to: packages/review/src/delivery-authorization.ts
      via: "imports reAuthorizeFromPayload; asserts security boundary"
      pattern: "reAuthorizeFromPayload"
---

<objective>
Lock every public Phase 9 CLI contract via admission-e2e snapshot tests so future regressions surface immediately. Seven contract test files cover: exit codes, --help text per command, stdout canonical round-trip, status row schemas (minimal + full), inspect schema (with no-trace-inline assertion), resume dispatch matrix, and delivery re-authorization security boundary.

Purpose: Phase 9 introduces ~7 new public contracts. Without snapshot tests, Phase 10 (V1 Hardening) inherits drift risk. Cheap insurance.
Output: Seven new contract test files + 8 help fixtures + admission-e2e dep additions if needed.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/09-operator-surface-resumability/09-CONTEXT.md
@.planning/phases/09-operator-surface-resumability/09-RESEARCH.md
@AGENTS.md
@packages/admission-e2e/package.json
@packages/admission-e2e/src/manifest-status-enum.contract.test.ts
@apps/factory-cli/src/exit-codes.ts
@apps/factory-cli/src/io.ts
@apps/factory-cli/src/commands/status.ts
@apps/factory-cli/src/commands/inspect.ts
@apps/factory-cli/src/commands/resume.ts
@apps/factory-cli/src/commands/cancel.ts
@apps/factory-cli/src/commands/deliver.ts
@apps/factory-cli/src/commands/prune.ts
@packages/review/src/delivery-authorization.ts
@packages/delivery/src/authorization-payload.ts
@packages/artifacts/src/canonical-json.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add 7 admission-e2e contract tests + 8 help fixtures locking the Phase 9 CLI public surface</name>
  <read_first>
    - packages/admission-e2e/package.json (deps; add @protostar/factory-cli, @protostar/review, @protostar/delivery, @protostar/artifacts if not already present)
    - packages/admission-e2e/tsconfig.json (project references)
    - packages/admission-e2e/src/manifest-status-enum.contract.test.ts (Plan 09-03 — pattern to mirror)
    - packages/admission-e2e/src/dogpile-adapter-no-fs.contract.test.ts (existing snapshot+spawn test pattern from Phase 6)
    - packages/admission-e2e/src/pile-integration-smoke.contract.test.ts (existing spawn-the-CLI pattern)
    - apps/factory-cli/src/exit-codes.ts
    - apps/factory-cli/src/commands/status.ts (StatusRowMinimal/Full types)
    - apps/factory-cli/src/commands/inspect.ts (InspectOutput type)
    - packages/review/src/delivery-authorization.ts (reAuthorizeFromPayload signature)
    - packages/delivery/src/authorization-payload.ts (AuthorizationPayload type)
    - packages/artifacts/src/canonical-json.ts (sortJsonValue)
    - .planning/phases/09-operator-surface-resumability/09-CONTEXT.md (Q-03, Q-04, Q-05, Q-07, Q-10, Q-11, Q-12, Q-15, Q-21)
    - .planning/phases/09-operator-surface-resumability/09-RESEARCH.md (Wave 0 Gaps section enumerates each contract test)
  </read_first>
  <files>packages/admission-e2e/src/exit-codes.contract.test.ts, packages/admission-e2e/src/factory-cli-help.contract.test.ts, packages/admission-e2e/src/factory-cli-stdout-canonical.contract.test.ts, packages/admission-e2e/src/status-row-schema.contract.test.ts, packages/admission-e2e/src/inspect-schema.contract.test.ts, packages/admission-e2e/src/resume-stage-dispatch.contract.test.ts, packages/admission-e2e/src/delivery-reauthorize.contract.test.ts, packages/admission-e2e/src/fixtures/help/root-help.txt, packages/admission-e2e/src/fixtures/help/run-help.txt, packages/admission-e2e/src/fixtures/help/status-help.txt, packages/admission-e2e/src/fixtures/help/resume-help.txt, packages/admission-e2e/src/fixtures/help/cancel-help.txt, packages/admission-e2e/src/fixtures/help/inspect-help.txt, packages/admission-e2e/src/fixtures/help/deliver-help.txt, packages/admission-e2e/src/fixtures/help/prune-help.txt, packages/admission-e2e/package.json, packages/admission-e2e/tsconfig.json</files>
  <behavior>
    - exit-codes.contract.test: Object.entries(ExitCode) deep-equals [['Success',0],['GenericError',1],['UsageOrArgError',2],['NotFound',3],['Conflict',4],['CancelledByOperator',5],['NotResumable',6]]; JSON.stringify is byte-stable.
    - factory-cli-help.contract.test: spawnSync('node', ['dist/main.js', '--help']) → stdout === '' AND stderr matches fixtures/help/root-help.txt; exit code 0. Repeat for each subcommand: run, status, resume, cancel, inspect, deliver, prune.
    - factory-cli-stdout-canonical.contract.test: for a fixture {z:1,a:{c:3,b:2}}, capture writeStdoutJson output via stub → JSON.parse → sortJsonValue → JSON.stringify → assert equal to original chunk. Idempotency: run sortJsonValue twice → same output.
    - status-row-schema.contract.test: build a StatusRowMinimal fixture and a StatusRowFull fixture; serialize via writeStdoutJson; parse back; assert exact key set per type.
    - inspect-schema.contract.test: spawn `inspect <id> --json` against a fixture run dir containing trace.json with sentinel string `JUDGE_SAID_INSPECT_TEST_SENTINEL`; parse stdout JSON; assert manifest field, artifacts is array of {stage, kind, path, sha256, bytes}, summary is string; assert sentinel string is NOT in stdout (trace not inlined).
    - resume-stage-dispatch.contract.test: spawn `resume <id>` against three fixture runs:
      - manifest.status='cancelled' → exit 4 + stdout JSON has error='operator-cancelled-terminal'.
      - manifest.status='running' + CANCEL sentinel → sentinel removed after invocation; exit determined by stub executor.
      - manifest.status='completed' → exit 6.
    - delivery-reauthorize.contract.test: build a valid AuthorizationPayload + matching pass/pass review-decision.json → reAuthorizeFromPayload returns ok=true with a brand. Tamper payload.runId → returns ok=false reason='runId-mismatch'. Tamper review-decision to fail → returns ok=false reason='gate-not-pass'.
  </behavior>
  <action>
    1. Update `packages/admission-e2e/package.json` deps to include (if missing): `@protostar/factory-cli`, `@protostar/review`, `@protostar/delivery`, `@protostar/artifacts`. Update `packages/admission-e2e/tsconfig.json` references accordingly.
    2. Generate the 8 help fixtures by FIRST building factory-cli, THEN running each `--help` invocation to stderr and capturing the output verbatim. Save to `packages/admission-e2e/src/fixtures/help/<command>-help.txt`. Process:
       ```bash
       pnpm --filter @protostar/factory-cli build
       node apps/factory-cli/dist/main.js --help 2>packages/admission-e2e/src/fixtures/help/root-help.txt
       node apps/factory-cli/dist/main.js run --help 2>packages/admission-e2e/src/fixtures/help/run-help.txt
       # ... repeat for status, resume, cancel, inspect, deliver, prune
       ```
       Manually inspect each fixture and confirm it does not contain volatile data (timestamps, paths). Strip if needed.
    3. Create the seven contract test files. Each follows the existing admission-e2e pattern (see `packages/admission-e2e/src/manifest-status-enum.contract.test.ts` for shape; `packages/admission-e2e/src/pile-integration-smoke.contract.test.ts` for spawnSync pattern). Sketches:
       - `exit-codes.contract.test.ts`:
         ```typescript
         import { describe, it } from "node:test";
         import assert from "node:assert/strict";
         import { ExitCode } from "@protostar/factory-cli/exit-codes"; // may need a subpath export — alternatively re-export from main
         describe("ExitCode integer values — Phase 9 Q-03 lock", () => {
           it("locked 7 entries with frozen integers", () => {
             assert.deepEqual(Object.entries(ExitCode), [
               ["Success", 0], ["GenericError", 1], ["UsageOrArgError", 2],
               ["NotFound", 3], ["Conflict", 4], ["CancelledByOperator", 5], ["NotResumable", 6],
             ]);
           });
         });
         ```
         (If `@protostar/factory-cli` doesn't expose ExitCode via a subpath, add the subpath to apps/factory-cli/package.json exports as `"./exit-codes"`.)
       - `factory-cli-help.contract.test.ts`: spawnSync against built dist/main.js with `--help` for each command; assert stdout='', stderr matches the fixture file content (read via fs.readFileSync).
       - `factory-cli-stdout-canonical.contract.test.ts`: import sortJsonValue from `@protostar/artifacts/canonical-json`; round-trip + idempotency assertions.
       - `status-row-schema.contract.test.ts`: import the StatusRowMinimal/Full types from a factory-cli subpath (add `"./status-types"` export if needed); build fixtures matching each type; assert key set.
       - `inspect-schema.contract.test.ts`: build a minimal fixture run dir; spawn `inspect <id>` (via spawnSync); parse stdout JSON; assert shape + sentinel exclusion.
       - `resume-stage-dispatch.contract.test.ts`: build three fixture run dirs; spawn `resume <id>` for each; assert exit code + stdout JSON. For the "running + sentinel" case, the test must inject a stub executor (or accept that resume will attempt to run real execution against a fixture and assert only the sentinel-removal side effect, not the executor outcome).
       - `delivery-reauthorize.contract.test.ts`: import reAuthorizeFromPayload from `@protostar/review`; build payload + decision fixtures; assert each branch.
    4. If any test needs subpath exports that don't yet exist on apps/factory-cli, add them to apps/factory-cli/package.json and update tsconfig.
    5. Run `pnpm --filter @protostar/factory-cli build`, `pnpm --filter @protostar/admission-e2e build`, `pnpm --filter @protostar/admission-e2e test`, and `pnpm run verify`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/factory-cli build && pnpm --filter @protostar/admission-e2e build && pnpm --filter @protostar/admission-e2e test</automated>
  </verify>
  <acceptance_criteria>
    - `test -f packages/admission-e2e/src/exit-codes.contract.test.ts` returns 0
    - `test -f packages/admission-e2e/src/factory-cli-help.contract.test.ts` returns 0
    - `test -f packages/admission-e2e/src/factory-cli-stdout-canonical.contract.test.ts` returns 0
    - `test -f packages/admission-e2e/src/status-row-schema.contract.test.ts` returns 0
    - `test -f packages/admission-e2e/src/inspect-schema.contract.test.ts` returns 0
    - `test -f packages/admission-e2e/src/resume-stage-dispatch.contract.test.ts` returns 0
    - `test -f packages/admission-e2e/src/delivery-reauthorize.contract.test.ts` returns 0
    - `ls packages/admission-e2e/src/fixtures/help/ | wc -l` >= 8
    - `grep -c 'JUDGE_SAID_INSPECT_TEST_SENTINEL' packages/admission-e2e/src/inspect-schema.contract.test.ts` is at least 2  # in fixture write + assertion
    - `grep -c 'reAuthorizeFromPayload' packages/admission-e2e/src/delivery-reauthorize.contract.test.ts` is at least 1
    - `grep -cE "'gate-not-pass'" packages/admission-e2e/src/delivery-reauthorize.contract.test.ts` is at least 1
    - `grep -cE "'runId-mismatch'" packages/admission-e2e/src/delivery-reauthorize.contract.test.ts` is at least 1
    - `grep -c 'operator-cancelled-terminal' packages/admission-e2e/src/resume-stage-dispatch.contract.test.ts` is at least 1
    - `pnpm --filter @protostar/admission-e2e test` exits 0
    - `pnpm run verify` exits 0
  </acceptance_criteria>
  <done>All seven contract tests green; all eight help fixtures pinned; Phase 9 public surface fully locked against silent regression.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Public CLI contracts | Snapshot tests are the canary against silent breakage |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-09-11-01 | Tampering | silent regression of public CLI surface | mitigate | Snapshot tests fail loudly on any drift. |
| T-09-11-02 | Information Disclosure | help text exposes internal hostnames/paths | mitigate | Manual inspection of fixtures during creation; no PII expected. |
| T-09-11-03 | Tampering | commander minor-version drift changes --help text | mitigate | commander pinned to exact 14.0.3 in Plan 09-01; fixture refresh requires CONTEXT-revision discipline. |
</threat_model>

<verification>
- `pnpm --filter @protostar/admission-e2e test` clean
- `pnpm run verify` clean (PLAN-A-03 invariant — every package's tests run)
- Manual: each --help fixture inspected for non-deterministic content
</verification>

<success_criteria>
- All 7 contract test files exist and pass
- All 8 help fixtures captured and tested against
- ExitCode integers locked
- StatusRowMinimal + StatusRowFull schemas locked
- inspect output schema + no-trace-inline locked
- resume dispatch matrix locked
- delivery re-authorization security boundary locked
</success_criteria>

<output>
Create `.planning/phases/09-operator-surface-resumability/09-11-SUMMARY.md` summarizing the seven contract tests, the eight help fixtures, and any subpath exports added to apps/factory-cli to make the contracts importable.
</output>
