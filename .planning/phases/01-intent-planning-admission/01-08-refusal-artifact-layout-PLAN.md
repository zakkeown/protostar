---
phase: 01-intent-planning-admission
plan: 08
type: execute
wave: 2
depends_on: [04]
files_modified:
  - packages/intent/src/clarification-report/index.ts
  - packages/planning/src/artifacts/index.ts
  - apps/factory-cli/src/main.ts
  - apps/factory-cli/src/refusals-index.ts
  - apps/factory-cli/src/refusals-index.test.ts
  - apps/factory-cli/src/main.test.ts
autonomous: true
requirements:
  - PLAN-A-02
  - INTENT-01
must_haves:
  truths:
    - "Refusal artifacts share the run-directory layout: .protostar/runs/{runId}/clarification-report.json OR .protostar/runs/{runId}/no-plan-admitted.json (Q-08)"
    - "Each refusal run produces a .protostar/runs/{runId}/terminal-status.json marker recording the refusal stage and reason"
    - "Each refusal appends one JSON-line entry to .protostar/refusals.jsonl with fields { runId, timestamp, stage, reason, artifactPath, schemaVersion }"
    - "Pre-admission failure (parse error, all candidates rejected, missing AC coverage) refuses to advance — runFactory exits non-zero AND the no-plan-admitted artifact + index entry are present"
    - "Authority boundary preserved: only apps/factory-cli writes to .protostar/ (packages/* remain pure)"
  artifacts:
    - path: apps/factory-cli/src/refusals-index.ts
      provides: "Pure helper to format and append a refusals.jsonl line; consumers (main.ts) own the actual fs.appendFile call"
      exports: ["formatRefusalIndexLine", "appendRefusalIndexEntry"]
    - path: apps/factory-cli/src/main.ts
      provides: "runFactory writes refusal artifact + terminal-status.json + appends refusals.jsonl on every refusal path"
      contains: "refusals.jsonl"
  key_links:
    - from: apps/factory-cli/src/main.ts
      to: ".protostar/refusals.jsonl"
      via: "fs.appendFile after writing per-run artifact"
      pattern: "refusals.jsonl"
    - from: apps/factory-cli/src/main.ts
      to: ".protostar/runs/{runId}/terminal-status.json"
      via: "writeJson in the refusal branch"
      pattern: "terminal-status.json"
---

<objective>
Wire the refusal artifact layout: every refusal (intent-side ambiguity gate failure or planning-side admission failure) produces (a) a per-run artifact in .protostar/runs/{runId}/, (b) a terminal-status.json marker in the same dir, (c) a one-line append to .protostar/refusals.jsonl. Per Q-08. Closes PLAN-A-02 (no-plan-admitted artifact on pre-admission failure) and the runtime half of INTENT-01 (clarification-report writes when ambiguity gate blocks).

Purpose: Phase 9's operator surface lists all runs uniformly regardless of outcome; the .jsonl index gives status / inspect cheap cross-run queries. Schema versions from Plan 04 are now persisted to disk.

Output: Refusal artifacts + terminal-status + refusals.jsonl produced on every refusal path, with non-zero exit and no advancement.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/01-intent-planning-admission/01-CONTEXT.md
@.planning/codebase/CONCERNS.md
@.planning/codebase/CONVENTIONS.md
@apps/factory-cli/src/main.ts
@apps/factory-cli/src/main.test.ts
@packages/intent/src/clarification-report
@packages/planning/src/artifacts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add refusals-index helper (pure) and terminal-status type</name>
  <read_first>
    - /Users/zakkeown/Code/protostar/apps/factory-cli/src/main.ts (find current refusal-emitting branches: ambiguity-gate-block, planning-parse-error, all-candidates-rejected paths around lines 218-228 readPlanningFixtureInput and the writePlanningAdmissionArtifacts call sites)
    - /Users/zakkeown/Code/protostar/.planning/codebase/CONVENTIONS.md (zero runtime deps; node:fs/promises only; pure helpers preferred)
    - /Users/zakkeown/Code/protostar/.planning/codebase/STRUCTURE.md (where to put new factory-cli helpers)
  </read_first>
  <behavior>
    - formatRefusalIndexLine({ runId, timestamp, stage, reason, artifactPath, schemaVersion }) returns a string ending in "\n" — one valid JSON object on a single line.
    - The function is pure: no fs calls, no Date.now() (timestamp is an input).
    - terminal-status.json shape: { runId: string, status: "refused", stage: "intent" | "planning", reason: string, schemaVersion: "1.0.0", refusalArtifact: string }.
    - appendRefusalIndexEntry(filePath, line) is a thin wrapper around fs.appendFile — owned by factory-cli per Authority boundary.
    - Unit tests cover: line format determinism, JSON validity per line, terminal-status.json shape pin.
  </behavior>
  <action>
    1. Create apps/factory-cli/src/refusals-index.ts with:
       - export interface RefusalIndexEntry { readonly runId: string; readonly timestamp: string; readonly stage: "intent" | "planning"; readonly reason: string; readonly artifactPath: string; readonly schemaVersion: "1.0.0" }.
       - export function formatRefusalIndexLine(entry: RefusalIndexEntry): string — returns JSON.stringify(entry) + "\n".
       - export async function appendRefusalIndexEntry(filePath: string, entry: RefusalIndexEntry): Promise<void> — uses node:fs/promises appendFile with the formatted line.
       - export interface TerminalStatusArtifact { readonly schemaVersion: "1.0.0"; readonly runId: string; readonly status: "refused"; readonly stage: "intent" | "planning"; readonly reason: string; readonly refusalArtifact: string }.
       - export function buildTerminalStatusArtifact(input: Omit<TerminalStatusArtifact, "schemaVersion" | "status">): TerminalStatusArtifact — returns the full object with status: "refused" and schemaVersion: "1.0.0".

    2. Create apps/factory-cli/src/refusals-index.test.ts:
       - Test that formatRefusalIndexLine produces a string ending in "\n".
       - Test that the line, with the trailing newline trimmed, parses as valid JSON.
       - Test that the parsed object has every field of the input entry, with values byte-equal.
       - Test that calling formatRefusalIndexLine twice on the same input returns identical strings (determinism).
       - Test that buildTerminalStatusArtifact returns status: "refused" and schemaVersion: "1.0.0" regardless of input shape.

    3. Build + test pnpm --filter @protostar/factory-cli test (existing tests still pass; new tests pass).
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/factory-cli build && pnpm --filter @protostar/factory-cli test</automated>
  </verify>
  <acceptance_criteria>
    - ls apps/factory-cli/src/refusals-index.ts apps/factory-cli/src/refusals-index.test.ts exist.
    - grep -c "formatRefusalIndexLine\|appendRefusalIndexEntry\|buildTerminalStatusArtifact" apps/factory-cli/src/refusals-index.ts is at least 3 (one per export).
    - grep -c "schemaVersion" apps/factory-cli/src/refusals-index.ts is at least 2 (interface + buildTerminalStatusArtifact return).
    - pnpm --filter @protostar/factory-cli test exits 0.
  </acceptance_criteria>
  <done>Pure helper module + tests in place; ready for runFactory wiring in Task 2.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire runFactory to write refusal artifacts + terminal-status + append to refusals.jsonl on every refusal branch</name>
  <read_first>
    - /Users/zakkeown/Code/protostar/apps/factory-cli/src/main.ts (find every place runFactory currently exits early on refusal: ambiguity gate block, planning parse error, all candidates rejected, missing AC coverage. The CONCERNS.md note about lines 218-228 + 438 reducer is the map.)
    - /Users/zakkeown/Code/protostar/apps/factory-cli/src/main.test.ts (existing smoke tests — bad-fixture cases must now also assert refusal artifact + terminal-status + refusals.jsonl entry)
    - /Users/zakkeown/Code/protostar/apps/factory-cli/src/refusals-index.ts (Task 1 helpers — use them, do not reimplement)
    - /Users/zakkeown/Code/protostar/packages/intent/src/clarification-report/index.ts (clarification-report.json type — Plan 04 added schemaVersion)
    - /Users/zakkeown/Code/protostar/packages/planning/src/artifacts/index.ts (no-plan-admitted.json type)
  </read_first>
  <behavior>
    - On intent-side ambiguity-gate refusal: runFactory writes .protostar/runs/{runId}/clarification-report.json (already exists, now schemaVersion-tagged from Plan 04) AND terminal-status.json AND appends one line to .protostar/refusals.jsonl with stage: "intent". Process exits non-zero.
    - On planning-side refusal (parse error, all candidates rejected, missing AC coverage): runFactory writes .protostar/runs/{runId}/no-plan-admitted.json AND terminal-status.json AND appends one line to refusals.jsonl with stage: "planning". Process exits non-zero.
    - The refusals.jsonl path is .protostar/refusals.jsonl (resolved from the same workspace root as .protostar/runs/).
    - .protostar/refusals.jsonl is created on first append (not pre-created by checked-in scaffolding).
    - factory-cli's main.test.ts is extended: for at least one bad-intent fixture (examples/intents/bad/missing-capability.json) and one bad-planning fixture (examples/planning-results/bad/cyclic-plan-graph.json — relocated path from Plan 03), assert all three outputs are present and well-formed.
    - Authority boundary intact: every fs write happens inside main.ts (or a helper imported from refusals-index.ts that returns a Promise<void>); packages/intent and packages/planning remain pure.
  </behavior>
  <action>
    1. In apps/factory-cli/src/main.ts:
       a. Import { formatRefusalIndexLine, appendRefusalIndexEntry, buildTerminalStatusArtifact } from "./refusals-index.js".
       b. Identify every refusal branch in runFactory. Likely sites:
          - After assessIntentAmbiguity returns accepted: false → write clarification-report.json (already happens, Plan 04 added schemaVersion to its body) → ALSO write terminal-status.json + appendRefusalIndexEntry → exit non-zero.
          - After parsePlanningPileResult returns errors → write no-plan-admitted.json → ALSO write terminal-status.json + appendRefusalIndexEntry → exit non-zero.
          - After admitCandidatePlans returns no admitted candidate → same as above.
          - After missing AC coverage / pre-handoff verification fails → same as above.
       c. For each branch: build the TerminalStatusArtifact via buildTerminalStatusArtifact, writeJson it to .protostar/runs/{runId}/terminal-status.json, then await appendRefusalIndexEntry(refusalsIndexPath, indexEntry).
       d. The refusalsIndexPath is resolved from the same workspaceRoot the runs dir uses (CONCERNS.md flags workspaceRoot is currently INIT_CWD-dependent — that bug is Phase 3 REPO-07; for Plan 08, reuse whatever path resolution main.ts already uses for .protostar/runs/).
       e. Ensure runFactory returns/exits non-zero on every refusal branch. If a refusal branch currently returns success: false but the exit code is 0, fix the exit code path.

    2. Extend apps/factory-cli/src/main.test.ts:
       a. Add a withTempDir-based test for an intent-side refusal: use a bad intent fixture (e.g. examples/intents/bad/missing-capability.json — Plan 03 relocated path), spawn the CLI, assert exit code != 0, assert clarification-report.json exists, assert terminal-status.json exists with status: "refused" and stage: "intent", assert .protostar/refusals.jsonl exists and contains one parseable JSON line whose stage is "intent".
       b. Add a similar test for a planning-side refusal using examples/planning-results/bad/cyclic-plan-graph.json. Assert no-plan-admitted.json present, terminal-status.json with stage: "planning", refusals.jsonl entry with stage: "planning".
       c. The existing bad-fixture tests at apps/factory-cli/src/main.test.ts:34-37 (already updated by Plan 03 to use the new paths) should be extended or paired with these new assertions, not duplicated.

    3. Build + test:
       - pnpm --filter @protostar/factory-cli test
       - pnpm -r build (no consumer regressions)
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/factory-cli test && pnpm -r build</automated>
  </verify>
  <acceptance_criteria>
    - grep -c "appendRefusalIndexEntry\|formatRefusalIndexLine\|buildTerminalStatusArtifact" apps/factory-cli/src/main.ts is at least 2 (helper imports/uses).
    - grep -c "terminal-status.json" apps/factory-cli/src/main.ts is at least 1.
    - grep -c "refusals.jsonl" apps/factory-cli/src/main.ts is at least 1.
    - grep -c "terminal-status.json\|refusals.jsonl" apps/factory-cli/src/main.test.ts is at least 2 (asserted in tests).
    - pnpm --filter @protostar/factory-cli test exits 0 with the new bad-fixture assertions present.
    - Manual run (record in SUMMARY): pnpm run factory --draft examples/intents/bad/missing-capability.json against a temp out dir produces the three expected artifacts and exits non-zero.
  </acceptance_criteria>
  <done>Refusal branches all emit the three artifacts; tests pinning each branch are green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| runFactory ↔ filesystem (.protostar/) | Authority boundary — only factory-cli writes here |
| refusals.jsonl ↔ Phase 9 status/inspect readers | Append-only contract; line format is durable |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-08-01 | Repudiation | A refusal occurs but no artifact is produced (silent fail) | mitigate | Tests in Task 2 step 2 assert all three outputs exist; missing any one fails the suite |
| T-01-08-02 | Tampering | refusals.jsonl format drifts | mitigate | formatRefusalIndexLine is pure + unit tested; field set fixed by RefusalIndexEntry interface |
| T-01-08-03 | Elevation of Privilege | A non-cli package gains fs write capability | mitigate | All fs writes remain in apps/factory-cli; helpers in refusals-index.ts only call node:fs from inside factory-cli's bin scope |
</threat_model>

<verification>
- refusals-index helper unit tests pass.
- main.test.ts asserts artifact triple on intent-side and planning-side refusal cases.
- Manual smoke run produces the artifacts and exits non-zero.
- All workspace consumers still build.
</verification>

<success_criteria>
PLAN-A-02 closed at runtime: pre-admission failure produces the no-plan-admitted artifact and refuses to advance. INTENT-01 closed at runtime: ambiguity gate blocks produce the clarification-report and refuse to advance. Phase 9 has its index file ready.
</success_criteria>

<output>
After completion, create .planning/phases/01-intent-planning-admission/01-08-SUMMARY.md listing every refusal branch wired, the path resolution used (so Plan 09's parameterized e2e knows where to look), and a sample refusals.jsonl line for documentation.
</output>
