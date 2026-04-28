---
phase: 09-operator-surface-resumability
plan: 04
type: execute
wave: 2
depends_on: [01, 02, 03]
files_modified:
  - apps/factory-cli/src/run-discovery.ts
  - apps/factory-cli/src/run-discovery.test.ts
  - apps/factory-cli/src/run-liveness.ts
  - apps/factory-cli/src/run-liveness.test.ts
  - apps/factory-cli/src/commands/status.ts
  - apps/factory-cli/src/commands/status.test.ts
  - apps/factory-cli/src/main.ts
  - packages/lmstudio-adapter/src/factory-config.schema.json
autonomous: true
requirements: [OP-01, OP-02, OP-07]
must_haves:
  truths:
    - "status (no flags) prints a human-readable fixed-width table to stdout listing up to 25 most recent runs sorted by mtime desc (Q-05/Q-06)"
    - "status --json emits a single JSON value (StatusRowMinimal[]) to stdout, canonicalized via writeStdoutJson (Q-04/Q-05/Q-12)"
    - "status --full --json emits StatusRowFull[] (Q-07)"
    - "status --run <runId> emits a single row (or single object for --json) for that run; runId validated via parseRunId from 09-01 (Q-19)"
    - "status --since <duration> filters by mtime newer than now-duration; --all disables --limit (Q-06)"
    - "row.state is one of 'live' | 'orphaned' | 'unknown' | <manifest.status verbatim>, derived via computeRunLiveness (Q-09); orphaned = manifest.status='running' AND no journal append within livenessThresholdMs AND no CANCEL sentinel"
    - "factory-config.json schema adds operator.livenessThresholdMs (default 60000) (Q-09)"
    - "All progress lines (e.g., 'scanning .protostar/runs/...') go to stderr; stdout is single-shot (Q-04)"
  artifacts:
    - path: apps/factory-cli/src/run-discovery.ts
      provides: "listRuns({limit, since, all}) (Q-08)"
      exports: ["listRuns", "type RunDirEntry"]
    - path: apps/factory-cli/src/run-liveness.ts
      provides: "computeRunLiveness({runDir, thresholdMs}) (Q-09)"
      exports: ["computeRunLiveness", "type RunLiveness"]
    - path: apps/factory-cli/src/commands/status.ts
      provides: "status command builder + execute (Q-05/Q-06/Q-07)"
      exports: ["buildStatusCommand"]
    - path: packages/lmstudio-adapter/src/factory-config.schema.json
      contains: "livenessThresholdMs"
  key_links:
    - from: apps/factory-cli/src/commands/status.ts
      to: apps/factory-cli/src/run-discovery.ts
      via: "imports listRuns"
      pattern: "from .*run-discovery"
    - from: apps/factory-cli/src/commands/status.ts
      to: apps/factory-cli/src/run-liveness.ts
      via: "imports computeRunLiveness for each row"
      pattern: "computeRunLiveness"
    - from: apps/factory-cli/src/main.ts
      to: apps/factory-cli/src/commands/status.ts
      via: "addCommand(buildStatusCommand())"
      pattern: "addCommand\\(buildStatusCommand"
---

<objective>
Implement `protostar-factory status` per Q-05/Q-06/Q-07/Q-08/Q-09. Two output modes (human table default, `--json` opt-in), tiered row schemas (`StatusRowMinimal` default, `StatusRowFull` via `--full`), directory-scan-based run discovery (no top-level index), and runtime-liveness derivation that distinguishes `live` from `orphaned` from `unknown`. Adds `factory-config.json operator.livenessThresholdMs` schema field.

Purpose: First pipeable operator surface — `protostar-factory status --json | jq '.[] | select(.verdict == "block")'` works without prefilter (Q-04 strict).
Output: Two new shared modules (run-discovery, run-liveness), one command module, schema bump, and unit tests covering both shapes + liveness states.
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
@apps/factory-cli/src/main.ts
@apps/factory-cli/src/exit-codes.ts
@apps/factory-cli/src/io.ts
@apps/factory-cli/src/run-id.ts
@apps/factory-cli/src/duration.ts
@packages/artifacts/src/index.ts
@packages/lmstudio-adapter/src/factory-config.schema.json

<interfaces>
```typescript
// apps/factory-cli/src/run-discovery.ts (Q-08)
export interface RunDirEntry {
  readonly runId: string;
  readonly path: string;        // absolute
  readonly mtimeMs: number;
}
export interface ListRunsOptions {
  readonly runsRoot: string;    // absolute path to .protostar/runs
  readonly limit?: number;      // ignored if all=true
  readonly sinceMs?: number;    // filter to entries with mtimeMs >= (now - sinceMs)
  readonly all?: boolean;
  readonly runIdRegex: RegExp;  // RUN_ID_REGEX from run-id.ts
}
export function listRuns(opts: ListRunsOptions): Promise<readonly RunDirEntry[]>;

// apps/factory-cli/src/run-liveness.ts (Q-09)
export type RunLivenessState = "live" | "orphaned" | "unknown";
export interface RunLiveness {
  readonly state: RunLivenessState;
  readonly lastJournalAt: number | null;   // ms epoch; null if no journal yet
  readonly hasSentinel: boolean;
  readonly manifestStatus: import("@protostar/artifacts").FactoryRunStatus | null;
  readonly error?: string;                  // present only when state='unknown'
}
export interface ComputeRunLivenessOptions {
  readonly runDir: string;       // absolute path to runs/<id>
  readonly thresholdMs: number;  // default 60_000
  readonly nowMs?: number;       // injection point for tests
}
export function computeRunLiveness(opts: ComputeRunLivenessOptions): Promise<RunLiveness>;

// apps/factory-cli/src/commands/status.ts (Q-05/Q-06/Q-07)
export interface StatusRowMinimal {
  readonly runId: string;
  readonly archetype: string;
  readonly verdict: "pass" | "block" | "fail" | "repair-budget-exhausted" | "incomplete";
  readonly durationMs: number;
}
export interface StatusRowFull {
  readonly runId: string;
  readonly archetype: string;
  readonly status: import("@protostar/artifacts").FactoryRunStatus;
  readonly state: import("../run-liveness.js").RunLivenessState | import("@protostar/artifacts").FactoryRunStatus;
  readonly reviewVerdict: "pass" | "repair" | "block" | null;
  readonly evaluationVerdict: "pass" | "fail" | null;
  readonly lineageId: string | null;
  readonly generation: number | null;
  readonly prUrl: string | null;
  readonly durationMs: number;
  readonly createdAt: number;   // ms epoch
}
export function buildStatusCommand(): Command;
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: listRuns directory scan + computeRunLiveness with unit tests</name>
  <read_first>
    - apps/factory-cli/src/run-id.ts (RUN_ID_REGEX, RunId)
    - apps/factory-cli/src/duration.ts (parseDuration shape — used to derive sinceMs upstream in status)
    - packages/artifacts/src/index.ts (FactoryRunStatus, FactoryRunManifest schema)
    - apps/factory-cli/src/journal-writer.ts (Phase 4 journal append shape — last-event mtime is what liveness reads)
    - apps/factory-cli/src/main.ts (existing patterns for resolving runsRoot; should use @protostar/paths workspaceRoot resolver)
    - .planning/phases/09-operator-surface-resumability/09-CONTEXT.md (Q-08, Q-09)
    - .planning/phases/09-operator-surface-resumability/09-RESEARCH.md (Architecture Patterns + Pitfall 6)
  </read_first>
  <files>apps/factory-cli/src/run-discovery.ts, apps/factory-cli/src/run-discovery.test.ts, apps/factory-cli/src/run-liveness.ts, apps/factory-cli/src/run-liveness.test.ts</files>
  <behavior>
    - run-discovery.test: listRuns against a tmpdir with 3 run subdirs returns all 3, sorted by mtime desc.
    - run-discovery.test: listRuns({limit: 2}) returns the 2 most recent.
    - run-discovery.test: listRuns({sinceMs: 60_000}) returns only entries with mtime within last 60s (use fs.utimes to control).
    - run-discovery.test: listRuns({all: true, limit: 1}) returns all entries (limit ignored).
    - run-discovery.test: subdirs whose names don't match runIdRegex are filtered out (e.g., "tmp", ".DS_Store").
    - run-discovery.test: missing runsRoot directory returns empty array (no throw).
    - run-liveness.test: state='live' when manifest.status is non-terminal AND journal mtime within threshold AND no CANCEL sentinel.
    - run-liveness.test: state='orphaned' when manifest.status='running' AND journal mtime older than threshold AND no CANCEL sentinel.
    - run-liveness.test: state='unknown' when manifest.json missing or unparseable; error field populated.
    - run-liveness.test: hasSentinel=true when CANCEL sentinel file exists.
    - run-liveness.test: lastJournalAt=null when journal.jsonl absent.
    - run-liveness.test: nowMs injection works (deterministic).
  </behavior>
  <action>
    1. Create `apps/factory-cli/src/run-discovery.ts` per the `<interfaces>` shape:
       - Use `node:fs/promises.readdir(runsRoot, { withFileTypes: true })`. On ENOENT → return `[]`.
       - For each Dirent that is a directory AND matches `opts.runIdRegex.test(name)`: stat the directory, capture `mtimeMs`. Wrap unexpected errors per-entry (continue scanning) — empty array on root error.
       - Sort by `mtimeMs` desc.
       - If `sinceMs` set: filter to `entry.mtimeMs >= (Date.now() - sinceMs)`.
       - If `all` is falsy: take first `limit` (default 25 if both unset).
       - Return readonly array.
    2. Create `apps/factory-cli/src/run-liveness.ts` per the `<interfaces>` shape:
       - Read `runDir/manifest.json` → JSON.parse → if fail/missing → `{ state: 'unknown', error: <message>, hasSentinel, manifestStatus: null, lastJournalAt: null }`.
       - Read `runDir/CANCEL` exists → `hasSentinel = true`.
       - Stat `runDir/execution/journal.jsonl` for mtimeMs → `lastJournalAt`.
       - Compute state:
         - `manifestStatus` terminal (`completed | blocked | cancelled`) → state = manifestStatus (cast through RunLivenessState union OR allow returning manifestStatus directly per `<interfaces>`).
         - `manifestStatus === 'running'` AND `(now - (lastJournalAt ?? 0)) > thresholdMs` AND `!hasSentinel` → `state = 'orphaned'`.
         - Otherwise non-terminal manifestStatus → `state = 'live'`.
       - Return readonly result.
    3. Tests use a tmpdir per case (mirror `apps/factory-cli/src/cancel.test.ts` if present, else use `os.tmpdir() + crypto.randomUUID()` and clean up). Parameterize `nowMs` for deterministic threshold checks.
    4. Run `pnpm --filter @protostar/factory-cli build && pnpm --filter @protostar/factory-cli test`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/factory-cli build && pnpm --filter @protostar/factory-cli test -- --test-name-pattern '^(run-discovery|run-liveness)'</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'export function listRuns' apps/factory-cli/src/run-discovery.ts` is 1
    - `grep -c 'export function computeRunLiveness' apps/factory-cli/src/run-liveness.ts` is 1
    - `grep -cE "state.*'orphaned'" apps/factory-cli/src/run-liveness.ts` is at least 1
    - `pnpm --filter @protostar/factory-cli test` exits 0
  </acceptance_criteria>
  <done>Both shared helpers exist with full unit coverage; ready for status command consumption.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: status command (human + JSON + tiered rows) with config schema bump</name>
  <read_first>
    - apps/factory-cli/src/commands/run.ts (Plan 09-01 — buildRunCommand pattern: exitOverride, configureOutput, action returning ExitCode)
    - apps/factory-cli/src/io.ts (writeStdoutJson, writeStderr)
    - apps/factory-cli/src/exit-codes.ts (ExitCode)
    - apps/factory-cli/src/run-id.ts (parseRunId, assertRunIdConfined for --run argument)
    - apps/factory-cli/src/duration.ts (parseDuration for --since)
    - apps/factory-cli/src/run-discovery.ts (listRuns)
    - apps/factory-cli/src/run-liveness.ts (computeRunLiveness)
    - packages/artifacts/src/index.ts (FactoryRunManifest shape — for reading createdAt, archetype, status)
    - packages/lmstudio-adapter/src/factory-config.schema.json (existing schema; add operator.livenessThresholdMs)
    - apps/factory-cli/src/load-factory-config.ts (existing config loader; widen if needed)
    - .planning/phases/09-operator-surface-resumability/09-CONTEXT.md (Q-05, Q-06, Q-07, Q-09)
  </read_first>
  <files>apps/factory-cli/src/commands/status.ts, apps/factory-cli/src/commands/status.test.ts, apps/factory-cli/src/main.ts, packages/lmstudio-adapter/src/factory-config.schema.json, apps/factory-cli/src/load-factory-config.ts</files>
  <behavior>
    - status (no flags), tmpdir with 3 manifests → human table written to stdout, single chunk; stderr empty (or progress only).
    - status --json → stdout is exactly one JSON-parseable chunk; parsing yields StatusRowMinimal[].
    - status --json --full → StatusRowFull[]; presence of lineageId/generation/prUrl when artifacts exist; null otherwise.
    - status --run <invalidId> → exit 2; stderr contains regex hint.
    - status --run <validId> --json → exit 0; stdout is a single object (StatusRowMinimal | StatusRowFull) — NOT an array.
    - status --run <missingId> --json → exit 3 (NotFound).
    - status --since 1h → filters via parseDuration(1h)=3_600_000.
    - status --since bogus → exit 2; stderr contains parseDuration reject reason.
    - status --all → ignores default limit (returns all).
    - status --limit 5 --since 24h → intersection (most recent up to 5 within last 24h).
    - status against a "running" manifest with stale journal (>livenessThresholdMs) → row state='orphaned'.
    - factory-config.json schema validation: `{ "operator": { "livenessThresholdMs": 30000 } }` parses; non-number rejected.
  </behavior>
  <action>
    1. Update `packages/lmstudio-adapter/src/factory-config.schema.json`:
       - Add a top-level optional `"operator"` block: `{ "type": "object", "additionalProperties": false, "properties": { "livenessThresholdMs": { "type": "integer", "minimum": 1000, "maximum": 3_600_000, "default": 60000, "description": "Threshold in ms for run-liveness derivation; runs with manifest.status=running but no journal append within this window report state=orphaned in `protostar-factory status` (Phase 9 Q-09)." } } }`.
       - Update `additionalProperties: false` at the root to permit `operator`.
    2. Update `apps/factory-cli/src/load-factory-config.ts` (or wherever `FactoryConfig` is typed) to surface `operator?: { livenessThresholdMs?: number }`. Add a resolver `resolveLivenessThresholdMs(config): number` that returns `config.operator?.livenessThresholdMs ?? 60_000`.
    3. Create `apps/factory-cli/src/commands/status.ts`:
       - Use `Command` from `@commander-js/extra-typings`.
       - Options: `--run <runId>`, `--limit <n>` (default `"25"`, parse to int via custom parseFloat-like), `--all`, `--since <duration>`, `--json`, `--full`.
       - `.exitOverride()`, `.configureOutput({writeOut/writeErr → process.stderr.write})`.
       - `executeStatus(opts)`:
         a. Resolve `runsRoot` via `@protostar/paths.resolveWorkspaceRoot()` + `path.join("/.protostar/runs")`.
         b. If `opts.run` set: parse via `parseRunId(opts.run)`; not-ok → ExitCode.UsageOrArgError. Then `assertRunIdConfined`. Compute single row; if manifest missing → ExitCode.NotFound. Emit to stdout (single object for --json, single rendered table-line for human) and exit 0.
         c. Else: parse `--since` via `parseDuration` (if set); reject → ExitCode.UsageOrArgError. parse `--limit` (if not --all). Call `listRuns({runsRoot, limit, sinceMs, all, runIdRegex: RUN_ID_REGEX})`.
         d. For each entry: read manifest, read auxiliary artifacts (review-gate.json, evaluation-report.json, evolution/snapshot.json, delivery/result.json) lazily; compute durationMs (createdAt → completion ts or now); call computeRunLiveness({runDir, thresholdMs}); build row.
         e. If `--json`: writeStdoutJson(rows). Otherwise render fixed-width table to stdout via a single `process.stdout.write(table + "\n")` (single chunk). Columns derived from the JSON minimal/full shape — runId, archetype, verdict (or status when --full), durationMs.
         f. Return ExitCode.Success.
       - `buildStatusCommand` returns the configured Command.
    4. Wire into main.ts: `program.addCommand(buildStatusCommand());`
    5. Write `apps/factory-cli/src/commands/status.test.ts` covering the cases in `<behavior>`. Use a tmpdir runs root and stub stdout/stderr (preserve+restore pattern).
    6. Run `pnpm --filter @protostar/factory-cli build && pnpm --filter @protostar/factory-cli test`, `pnpm --filter @protostar/lmstudio-adapter build && pnpm --filter @protostar/lmstudio-adapter test`, and `pnpm run verify`.
  </action>
  <verify>
    <automated>pnpm --filter @protostar/factory-cli build && pnpm --filter @protostar/factory-cli test && pnpm --filter @protostar/lmstudio-adapter test</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'export function buildStatusCommand' apps/factory-cli/src/commands/status.ts` is 1
    - `grep -c 'addCommand(buildStatusCommand' apps/factory-cli/src/main.ts` is 1
    - `grep -c 'livenessThresholdMs' packages/lmstudio-adapter/src/factory-config.schema.json` is at least 1
    - `grep -c 'StatusRowMinimal' apps/factory-cli/src/commands/status.ts` is at least 1
    - `grep -c 'StatusRowFull' apps/factory-cli/src/commands/status.ts` is at least 1
    - `grep -cE "writeStdoutJson|process\.stdout\.write" apps/factory-cli/src/commands/status.ts` is at least 1
    - `grep -cE "^\\s*console\\.log\\(" apps/factory-cli/src/commands/status.ts` is 0
    - `pnpm --filter @protostar/factory-cli test` exits 0
    - `pnpm --filter @protostar/lmstudio-adapter test` exits 0
  </acceptance_criteria>
  <done>status command live with both shapes; schema bump landed; tests cover happy + reject paths.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| --run argv → fs path | Untrusted runId crosses to runsRoot; defended by parseRunId + assertRunIdConfined |
| stdout consumer | jq/automation pipes; single-shot JSON or single-shot table |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-09-04-01 | Tampering | --run path traversal | mitigate | parseRunId regex + assertRunIdConfined defense in depth (Q-19). |
| T-09-04-02 | Information Disclosure | progress on stdout | mitigate | All progress via writeStderr; stdout = single JSON or single table chunk (Q-04). |
| T-09-04-03 | Repudiation | mid-run "running" lying about a crashed process | mitigate | computeRunLiveness derives `orphaned` from journal staleness (Q-09). |
| T-09-04-04 | DoS | huge runs/ directory | accept | v0.1 scale ≤ low-thousands; Q-08 documents bound; revisit in Phase 10 if dogfood saturates. |
</threat_model>

<verification>
- `pnpm --filter @protostar/factory-cli test` clean
- `pnpm --filter @protostar/lmstudio-adapter test` clean (schema validates new operator block)
- `pnpm run verify` clean
</verification>

<success_criteria>
- status without flags renders human table
- status --json emits canonicalized StatusRowMinimal[]
- status --json --full emits StatusRowFull[]
- status --run / --since / --all / --limit all work; invalid inputs map to documented ExitCodes
- factory-config.json schema accepts operator.livenessThresholdMs
</success_criteria>

<output>
Create `.planning/phases/09-operator-surface-resumability/09-04-SUMMARY.md` summarizing the listRuns + computeRunLiveness shared helpers, the dual-mode status command, and the schema bump for operator.livenessThresholdMs.
</output>
